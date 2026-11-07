import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  NotificationError,
  NotificationEventSchema,
  NotificationIdSchema,
  NotificationListSchema,
  UpdateNotificationPreferencesSchema,
  notificationCategory,
  type NotificationEvent,
} from "@sammlerraum/contracts/notifications";
import {
  communityActor,
  communityTransaction,
  type CommunityActor,
} from "../community/community-transaction";
import type { CommunityDatabase } from "../community/social-service";
import {
  lockCommunityParticipants,
  loadPublicCommunityTarget,
  notBlocked,
  publicItemPredicate,
} from "../community/social-scope";
import type { SearchReadTransaction } from "../search/search-read";
const categories = ["COMMUNITY", "INVENTORY", "ACCOUNT", "SECURITY"] as const,
  channels = ["IN_APP", "EMAIL"] as const;
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const value = schema.safeParse(input);
  if (!value.success) throw new NotificationError("NOTIFICATION_INVALID");
  return value.data;
}
function missing(): never {
  throw new NotificationError("NOTIFICATION_NOT_FOUND");
}
export async function notificationPreferencesInTransaction(
  tx: SearchReadTransaction,
  userId: string,
) {
  const rows = await tx.$queryRaw<{ category: string; channel: string; enabled: boolean }[]>(
    Prisma.sql`SELECT category,channel,enabled FROM "NotificationPreference" WHERE "userId"=${userId}`,
  );
  const [settings] = await tx.$queryRaw<{ locale: "de" | "en" }[]>(
    Prisma.sql`SELECT locale FROM "NotificationSettings" WHERE "userId"=${userId}`,
  );
  return {
    locale: settings?.locale ?? "de",
    preferences: categories.flatMap((category) =>
      channels.map((channel) => ({
        category,
        channel,
        enabled:
          category === "SECURITY" && channel === "EMAIL"
            ? true
            : (rows.find((r) => r.category === category && r.channel === channel)?.enabled ??
              channel === "IN_APP"),
      })),
    ),
  };
}
/** Server-only producer, including same-transaction event handlers. Never expose this as a client create endpoint. */
export async function createNotificationInTransaction(tx: SearchReadTransaction, input: unknown) {
  const value = parse(NotificationEventSchema, input),
    category = notificationCategory(value.type);
  await lockCommunityParticipants(tx, [
    value.recipientId,
    ...(value.actorId ? [value.actorId] : []),
  ]);
  if (category === "COMMUNITY") {
    if (value.actorId === value.recipientId) return { id: null, created: false, suppressed: true };
    const [allowed] = await tx.$queryRaw<{ allowed: boolean }[]>(
      Prisma.sql`SELECT ${notBlocked(value.recipientId, Prisma.sql`${value.actorId}`)} AS allowed`,
    );
    if (!allowed?.allowed) return { id: null, created: false, suppressed: true };
  }
  const [existing] = await tx.$queryRaw<
    { id: string; type: string; targetType: string; targetId: string; actorId: string | null }[]
  >(
    Prisma.sql`SELECT id,type,"targetType","targetId","actorId" FROM "Notification" WHERE "recipientId"=${value.recipientId} AND "eventKey"=${value.eventKey}`,
  );
  if (existing) {
    if (
      existing.type !== value.type ||
      existing.targetType !== value.target.type ||
      existing.targetId !== value.target.id ||
      existing.actorId !== value.actorId
    )
      throw new NotificationError("NOTIFICATION_CONFLICT");
    return { id: existing.id, created: false, suppressed: false };
  }
  if (
    category === "COMMUNITY" &&
    (value.target.type === "ITEM" || value.target.type === "COLLECTION")
  )
    await loadPublicCommunityTarget(tx, value.target);
  const prefs = await notificationPreferencesInTransaction(tx, value.recipientId),
    id = randomUUID();
  const enabled = (channel: "EMAIL" | "IN_APP") =>
    prefs.preferences.find((p) => p.category === category && p.channel === channel)!.enabled;
  await tx.$queryRaw(
    Prisma.sql`INSERT INTO "Notification"(id,"recipientId","actorId","eventKey",type,category,"targetType","targetId",locale,"inAppEnabled","emailWanted") VALUES(${id}::uuid,${value.recipientId},${value.actorId},${value.eventKey},${value.type},${category},${value.target.type},${value.target.id},${prefs.locale},${enabled("IN_APP")},${enabled("EMAIL")})`,
  );
  return { id, created: true, suppressed: false };
}
type NotificationRow = {
  id: string;
  type: NotificationEvent["type"];
  category: string;
  targetType: string;
  targetId: string;
  readAt: Date | null;
  createdAt: Date;
  safeTargetLabel: string | null;
  available: boolean;
};
export function createNotificationService(db: CommunityDatabase) {
  async function own<T>(
    who: CommunityActor,
    work: (tx: SearchReadTransaction, userId: string) => Promise<T>,
    write = false,
  ) {
    const userId = communityActor(who);
    return communityTransaction(db, async (tx) => {
      await lockCommunityParticipants(tx, [userId], write ? "WRITE" : "READ");
      return work(tx, userId);
    });
  }
  return {
    createNotificationOnce: (input: unknown) =>
      communityTransaction(db, (tx) => createNotificationInTransaction(tx, input)),
    getPreferences: (who: CommunityActor) =>
      own(who, (tx, id) => notificationPreferencesInTransaction(tx, id)),
    async updatePreferences(who: CommunityActor, input: unknown) {
      const value = parse(UpdateNotificationPreferencesSchema, input);
      return own(
        who,
        async (tx, userId) => {
          if (value.locale)
            await tx.$queryRaw(
              Prisma.sql`INSERT INTO "NotificationSettings"("userId",locale)VALUES(${userId},${value.locale}) ON CONFLICT("userId") DO UPDATE SET locale=excluded.locale`,
            );
          for (const pref of value.preferences)
            await tx.$queryRaw(
              Prisma.sql`INSERT INTO "NotificationPreference"("userId",category,channel,enabled)VALUES(${userId},${pref.category},${pref.channel},${pref.category === "SECURITY" && pref.channel === "EMAIL" ? true : pref.enabled}) ON CONFLICT("userId",category,channel) DO UPDATE SET enabled=excluded.enabled`,
            );
          return notificationPreferencesInTransaction(tx, userId);
        },
        true,
      );
    },
    async markRead(who: CommunityActor, idInput: string) {
      const id = parse(NotificationIdSchema, idInput);
      return own(
        who,
        async (tx, userId) => {
          const [row] = await tx.$queryRaw<{ id: string; readAt: Date }[]>(
            Prisma.sql`UPDATE "Notification" SET "readAt"=coalesce("readAt",timezone('UTC',clock_timestamp())) WHERE id=${id}::uuid AND "recipientId"=${userId} RETURNING id,"readAt"`,
          );
          if (!row) return missing();
          return { id: row.id, readAt: row.readAt.toISOString() };
        },
        true,
      );
    },
    markAllRead: (who: CommunityActor) =>
      own(
        who,
        async (tx, userId) => {
          const rows = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`UPDATE "Notification" SET "readAt"=timezone('UTC',clock_timestamp()) WHERE "recipientId"=${userId} AND "readAt" IS NULL RETURNING id`,
          );
          return { updatedCount: rows.length };
        },
        true,
      ),
    async listNotifications(who: CommunityActor, input: unknown = {}) {
      const value = parse(NotificationListSchema, input);
      return own(who, async (tx, userId) => {
        const publicActor = Prisma.sql`(n."actorId" IS NULL OR ${notBlocked(userId, Prisma.sql`n."actorId"`)})`;
        const publicItem = Prisma.sql`(${publicItemPredicate} AND ${notBlocked(userId, Prisma.sql`c."ownerId"`)})`;
        const publicCollection = Prisma.sql`(nc.visibility='PUBLIC' AND nc."deletedAt" IS NULL AND ${notBlocked(userId, Prisma.sql`nc."ownerId"`)})`;
        const available = Prisma.sql`(${publicActor} AND CASE n."targetType" WHEN 'USER' THEN p."userId" IS NOT NULL AND ${notBlocked(userId, Prisma.sql`p."userId"`)} WHEN 'ITEM' THEN ${publicItem} WHEN 'COLLECTION' THEN ${publicCollection} WHEN 'ACCOUNT' THEN n."targetId"=${userId} ELSE false END)`;
        const rows = await tx.$queryRaw<NotificationRow[]>(
          Prisma.sql`WITH page AS (SELECT * FROM "Notification" WHERE "recipientId"=${userId} AND "inAppEnabled" ${value.afterId ? Prisma.sql`AND ("createdAt",id)<(SELECT "createdAt",id FROM "Notification" WHERE id=${value.afterId}::uuid AND "recipientId"=${userId})` : Prisma.empty} ORDER BY "createdAt" DESC,id DESC LIMIT ${value.limit + 1}) SELECT n.id,n.type,n.category,n."targetType",n."targetId",n."readAt",n."createdAt",coalesce(${available},false) AS available,CASE WHEN ${available} THEN CASE n."targetType" WHEN 'USER' THEN p."displayName" WHEN 'ITEM' THEN i.title WHEN 'COLLECTION' THEN nc.name ELSE NULL END ELSE NULL END AS "safeTargetLabel" FROM page n LEFT JOIN "UserProfile" p ON p."userId"=CASE WHEN n."targetType"='USER' THEN n."targetId" END LEFT JOIN "CollectibleItem" i ON i.id=CASE WHEN n."targetType"='ITEM' THEN n."targetId"::uuid END LEFT JOIN "Collection" c ON c.id=i."collectionId" LEFT JOIN "Collection" nc ON nc.id=CASE WHEN n."targetType"='COLLECTION' THEN n."targetId"::uuid END ORDER BY n."createdAt" DESC,n.id DESC`,
        );
        const [unread] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "Notification" WHERE "recipientId"=${userId} AND "inAppEnabled" AND "readAt" IS NULL`,
        );
        return {
          notifications: rows.slice(0, value.limit).map((row) => ({
            id: row.id,
            type: row.type,
            category: row.category,
            readAt: row.readAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
            safeTarget: row.available ? { type: row.targetType, id: row.targetId } : null,
            safeTargetLabel: row.safeTargetLabel,
          })),
          next: rows.length > value.limit ? rows[value.limit - 1]!.id : null,
          unreadCount: Number(unread?.count ?? 0n),
        };
      });
    },
  };
}
