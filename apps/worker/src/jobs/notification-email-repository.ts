import { randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { CommunityDatabase } from "@sammlerraum/domain/community/social-service";
import { notificationPreferencesInTransaction } from "@sammlerraum/domain/notifications/notification-service";
import type { NotificationEmailRepository } from "./send-email";
type Tx = { $queryRaw<T>(query: Prisma.Sql): Promise<T> };
type Row = {
  id: string;
  status: string;
  attempts: number;
  leaseToken: string | null;
  leaseUntil: Date | null;
  nextAttemptAt: Date;
  recipientId: string;
  actorId: string | null;
  category: string;
  type: string;
  locale: "de" | "en";
  emailWanted: boolean;
};
export function createNotificationEmailRepository(
  db: CommunityDatabase,
  options: { now?: () => Date } = {},
) {
  const clock = options.now ?? (() => new Date());
  async function tx<T>(work: (sql: Tx, at: Date) => Promise<T>) {
    return db.$transaction(
      async (sql) => {
        await sql.$queryRaw(
          Prisma.sql`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout','5000ms',true)`,
        );
        return work(sql, clock());
      },
      { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 },
    );
  }
  async function locked(sql: Tx, id: string) {
    const [scope] = await sql.$queryRaw<{ recipientId: string }[]>(
      Prisma.sql`SELECT n."recipientId" FROM "NotificationEmailDelivery" d JOIN "Notification" n ON n.id=d."notificationId" WHERE d.id=${id}::uuid`,
    );
    if (!scope) return null;
    const [user] = await sql.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "user" WHERE id=${scope.recipientId} FOR NO KEY UPDATE`,
    );
    if (!user) return null;
    const [row] = await sql.$queryRaw<Row[]>(
      Prisma.sql`SELECT d.id,d.status,d.attempts,d."leaseToken",d."leaseUntil",d."nextAttemptAt",n."recipientId",n."actorId",n.category,n.type,n.locale,n."emailWanted" FROM "NotificationEmailDelivery" d JOIN "Notification" n ON n.id=d."notificationId" WHERE d.id=${id}::uuid FOR UPDATE OF d`,
    );
    return row ?? null;
  }
  async function eligible(sql: Tx, row: Row) {
    const [user] = await sql.$queryRaw<{ email: string; verified: boolean; blocked: boolean }[]>(
      Prisma.sql`SELECT u.email,u."emailVerified" AS verified,EXISTS(SELECT 1 FROM "UserBlock" b WHERE (b."blockerId"=u.id AND b."blockedId"=${row.actorId}) OR (b."blockedId"=u.id AND b."blockerId"=${row.actorId})) AS blocked FROM "user" u WHERE u.id=${row.recipientId}`,
    );
    if (
      !user?.verified ||
      !row.emailWanted ||
      (row.category === "COMMUNITY" && (!row.actorId || user.blocked))
    )
      return null;
    const prefs = await notificationPreferencesInTransaction(sql, row.recipientId);
    if (
      !prefs.preferences.find((p) => p.category === row.category && p.channel === "EMAIL")?.enabled
    )
      return null;
    return { to: user.email, type: row.type, locale: row.locale };
  }
  async function suppress(sql: Tx, id: string, at: Date) {
    await sql.$queryRaw(
      Prisma.sql`UPDATE "NotificationEmailDelivery" SET status='SUPPRESSED',"lastOutcome"='PREFERENCE_OR_RECIPIENT',"updatedAt"=${at} WHERE id=${id}::uuid`,
    );
    return { state: "SUPPRESSED" };
  }
  const repository: NotificationEmailRepository & {
    dispatchCandidates(limit: number): Promise<string[]>;
  } = {
    async dispatchCandidates(limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw Error("Invalid email batch limit");
      return tx(async (sql, at) => {
        await sql.$queryRaw(
          Prisma.sql`INSERT INTO "NotificationEmailDelivery"(id,"notificationId","nextAttemptAt") SELECT gen_random_uuid(),n.id,${at} FROM "Notification" n WHERE n."emailWanted" AND NOT EXISTS(SELECT 1 FROM "NotificationEmailDelivery" d WHERE d."notificationId"=n.id) ORDER BY n."createdAt",n.id LIMIT ${limit} ON CONFLICT("notificationId") DO NOTHING`,
        );
        const rows = await sql.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "NotificationEmailDelivery" WHERE (status='PENDING' AND "nextAttemptAt"<=${at}) OR (status IN ('CLAIMED','SENDING') AND "leaseUntil"<=${at}) ORDER BY "nextAttemptAt",id LIMIT ${limit}`,
        );
        return rows.map((r) => r.id);
      });
    },
    async claim(id) {
      return tx(async (sql, at) => {
        const row = await locked(sql, id);
        if (!row) return { state: "MISSING" };
        if (row.status === "SENDING") {
          if (row.leaseUntil && row.leaseUntil.getTime() <= at.getTime()) {
            await sql.$queryRaw(
              Prisma.sql`UPDATE "NotificationEmailDelivery" SET status='UNKNOWN',"lastOutcome"='UNKNOWN',"updatedAt"=${at} WHERE id=${id}::uuid`,
            );
            return { state: "UNKNOWN" };
          }
          return { state: "BUSY" };
        }
        if (!["PENDING", "CLAIMED"].includes(row.status)) return { state: row.status };
        if (row.status === "CLAIMED" && row.leaseUntil && row.leaseUntil.getTime() > at.getTime())
          return { state: "BUSY" };
        if (row.status === "PENDING" && row.nextAttemptAt.getTime() > at.getTime())
          return { state: "DEFERRED" };
        if (!(await eligible(sql, row))) return suppress(sql, id, at);
        if (row.attempts >= 3) {
          await sql.$queryRaw(
            Prisma.sql`UPDATE "NotificationEmailDelivery" SET status='FAILED',"updatedAt"=${at} WHERE id=${id}::uuid`,
          );
          return { state: "FAILED" };
        }
        const token = randomUUID();
        await sql.$queryRaw(
          Prisma.sql`UPDATE "NotificationEmailDelivery" SET status='CLAIMED',"leaseToken"=${token}::uuid,"leaseUntil"=${new Date(at.getTime() + 120000)},"updatedAt"=${at} WHERE id=${id}::uuid`,
        );
        return { state: "CLAIMED", token };
      });
    },
    async beginSend(id, token) {
      return tx(async (sql, at) => {
        const row = await locked(sql, id);
        if (!row) return { state: "MISSING" };
        if (
          row.status !== "CLAIMED" ||
          row.leaseToken !== token ||
          !row.leaseUntil ||
          row.leaseUntil.getTime() <= at.getTime()
        )
          return { state: "BUSY" };
        const message = await eligible(sql, row);
        if (!message) return suppress(sql, id, at);
        await sql.$queryRaw(
          Prisma.sql`UPDATE "NotificationEmailDelivery" SET status='SENDING',attempts=attempts+1,"leaseUntil"=${new Date(at.getTime() + 120000)},"updatedAt"=${at} WHERE id=${id}::uuid`,
        );
        return { state: "SENDING", message };
      });
    },
    async markSent(id, token, providerMessageId) {
      if (!providerMessageId || providerMessageId.length > 512)
        throw Error("Invalid email receipt");
      await tx(async (sql, at) => {
        await sql.$queryRaw(
          Prisma.sql`UPDATE "NotificationEmailDelivery" SET status='SENT',"providerMessageId"=${providerMessageId},"sentAt"=coalesce("sentAt",${at}),"lastOutcome"='ACCEPTED',"updatedAt"=${at} WHERE id=${id}::uuid AND "leaseToken"=${token}::uuid AND status IN ('SENDING','UNKNOWN')`,
        );
      });
    },
    async markFailure(id, token, outcome) {
      await tx(async (sql, at) => {
        await sql.$queryRaw(
          Prisma.sql`UPDATE "NotificationEmailDelivery" SET status=CASE WHEN ${outcome}='UNKNOWN' THEN 'UNKNOWN' WHEN attempts>=3 THEN 'FAILED' ELSE 'PENDING' END,"lastOutcome"=${outcome},"nextAttemptAt"=${new Date(at.getTime() + 60000)},"updatedAt"=${at} WHERE id=${id}::uuid AND "leaseToken"=${token}::uuid AND status='SENDING'`,
        );
      });
    },
  };
  return repository;
}
