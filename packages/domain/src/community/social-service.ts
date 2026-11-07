import { communityEventHandlers } from "../notifications/community-event-handlers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import {
  CommunityError,
  FollowTargetSchema,
  FavoriteTargetSchema,
  CommunityListQuerySchema,
  COMMUNITY_MAX_FOLLOWS,
  COMMUNITY_MAX_FAVORITES,
} from "@sammlerraum/contracts/community";
import type { SearchReadTransaction } from "../search/search-read";
import { isReadDependencyFailure } from "../api/read-dependency-errors";
import {
  notBlocked,
  publicItemPredicate,
  lockCommunityUsers,
  assertCommunityInteraction,
  loadPublicCommunityTarget,
} from "./social-scope";
type Actor = { userId: string };
export type CommunityDatabase = {
  $transaction<T>(
    work: (tx: SearchReadTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted"; maxWait: number; timeout: number },
  ): Promise<T>;
};
function fail(code: CommunityError["code"]): never {
  throw new CommunityError(code);
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return fail("COMMUNITY_INVALID");
  return result.data;
}
/** Public-only social relationships; never route a member's private read through a favorite. */
export function createSocialService(database: CommunityDatabase) {
  async function run<T>(
    who: Actor,
    work: (tx: SearchReadTransaction, actor: string) => Promise<T>,
  ) {
    const actor = parse(MembershipActorIdSchema, who?.userId);
    try {
      return await database.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout','5000ms',true)`,
          );
          return work(tx, actor);
        },
        { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 },
      );
    } catch (error) {
      if (error instanceof CommunityError) throw error;
      if (isReadDependencyFailure(error)) return fail("COMMUNITY_UNAVAILABLE");
      throw error;
    }
  }
  return {
    async followUser(who: Actor, targetInput: string) {
      const target = parse(FollowTargetSchema, { userId: targetInput }).userId;
      if (target === who?.userId) return fail("COMMUNITY_INVALID");
      return run(who, async (tx, actor) => {
        await lockCommunityUsers(tx, actor, target);
        await assertCommunityInteraction(tx, actor, target);
        const [profile] = await tx.$queryRaw<{ userId: string }[]>(
          Prisma.sql`SELECT "userId" FROM "UserProfile" WHERE "userId"=${target} FOR SHARE`,
        );
        if (!profile) return fail("NOT_FOUND");
        const [existing] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "UserFollow" WHERE "followerId"=${actor} AND "followedId"=${target}`,
        );
        if (existing) return { id: existing.id, userId: target, followed: true };
        const [quota] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "UserFollow" WHERE "followerId"=${actor}`,
        );
        if (!quota || quota.count >= BigInt(COMMUNITY_MAX_FOLLOWS)) return fail("COMMUNITY_LIMIT");
        const id = randomUUID();
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "UserFollow"(id,"followerId","followedId")VALUES(${id}::uuid,${actor},${target})`,
        );
        await communityEventHandlers(tx).onFollowCreated({
          id,
          actorId: actor,
          recipientId: target,
        });
        return { id, userId: target, followed: true };
      });
    },
    async unfollowUser(who: Actor, targetInput: string) {
      const target = parse(FollowTargetSchema, { userId: targetInput }).userId;
      return run(who, async (tx, actor) => {
        await lockCommunityUsers(tx, actor);
        await tx.$queryRaw(
          Prisma.sql`DELETE FROM "UserFollow" WHERE "followerId"=${actor} AND "followedId"=${target}`,
        );
        return { userId: target, followed: false };
      });
    },
    async favoriteTarget(who: Actor, input: unknown) {
      const target = parse(FavoriteTargetSchema, input);
      return run(who, async (tx, actor) => {
        const initial = await loadPublicCommunityTarget(tx, target);
        await lockCommunityUsers(tx, actor, initial.ownerId);
        const [parent] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "Collection" WHERE id=${initial.collectionId}::uuid AND "deletedAt" IS NULL FOR SHARE`,
        );
        if (!parent) return fail("NOT_FOUND");
        const fresh = await loadPublicCommunityTarget(tx, target);
        if (fresh.ownerId !== initial.ownerId) return fail("COMMUNITY_CONFLICT");
        await assertCommunityInteraction(tx, actor, fresh.ownerId);
        const selector =
          target.type === "COLLECTION"
            ? Prisma.sql`"collectionId"=${target.id}::uuid`
            : Prisma.sql`"itemId"=${target.id}::uuid`;
        const [existing] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "Favorite" WHERE "userId"=${actor} AND ${selector}`,
        );
        if (existing) return { favoriteId: existing.id, target, favorited: true };
        const [quota] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "Favorite" WHERE "userId"=${actor}`,
        );
        if (!quota || quota.count >= BigInt(COMMUNITY_MAX_FAVORITES))
          return fail("COMMUNITY_LIMIT");
        const favoriteId = randomUUID();
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "Favorite"(id,"userId",type,"collectionId","itemId")VALUES(${favoriteId}::uuid,${actor},${target.type}::"FavoriteTargetType",${target.type === "COLLECTION" ? target.id : null}::uuid,${target.type === "ITEM" ? target.id : null}::uuid)`,
        );
        await communityEventHandlers(tx).onFavoriteCreated({
          id: favoriteId,
          actorId: actor,
          recipientId: fresh.ownerId,
          target,
        });
        return { favoriteId, target, favorited: true };
      });
    },
    async unfavoriteTarget(who: Actor, input: unknown) {
      const target = parse(FavoriteTargetSchema, input);
      return run(who, async (tx, actor) => {
        await lockCommunityUsers(tx, actor);
        const selector =
          target.type === "COLLECTION"
            ? Prisma.sql`"collectionId"=${target.id}::uuid`
            : Prisma.sql`"itemId"=${target.id}::uuid`;
        await tx.$queryRaw(
          Prisma.sql`DELETE FROM "Favorite" WHERE "userId"=${actor} AND ${selector}`,
        );
        return { target, favorited: false };
      });
    },
    async listFavorites(who: Actor, input: unknown = {}) {
      const query = parse(CommunityListQuerySchema, input);
      return run(who, async (tx, actor) => {
        await lockCommunityUsers(tx, actor);
        const rows = await tx.$queryRaw<
          { favoriteId: string; id: string; type: "ITEM" | "COLLECTION"; title: string }[]
        >(Prisma.sql`WITH visible AS (
    SELECT f.id AS "favoriteId",c.id,'COLLECTION'::text AS type,c.name AS title FROM "Favorite" f JOIN "Collection" c ON c.id=f."collectionId" WHERE f."userId"=${actor} AND f.type='COLLECTION' AND c.visibility='PUBLIC' AND c."deletedAt" IS NULL AND ${notBlocked(actor, Prisma.sql`c."ownerId"`)}
    UNION ALL SELECT f.id AS "favoriteId",i.id,'ITEM'::text AS type,i.title FROM "Favorite" f JOIN "CollectibleItem" i ON i.id=f."itemId" JOIN "Collection" c ON c.id=i."collectionId" WHERE f."userId"=${actor} AND f.type='ITEM' AND ${publicItemPredicate} AND ${notBlocked(actor, Prisma.sql`i."ownerId"`)}
   ) SELECT * FROM visible ${query.afterId ? Prisma.sql`WHERE "favoriteId">${query.afterId}::uuid` : Prisma.empty} ORDER BY "favoriteId" LIMIT ${query.limit + 1}`);
        return {
          favorites: rows.slice(0, query.limit),
          next: rows.length > query.limit ? rows[query.limit - 1]!.favoriteId : null,
        };
      });
    },
    async listFollowing(who: Actor, input: unknown = {}) {
      const query = parse(CommunityListQuerySchema, input);
      return run(who, async (tx, actor) => {
        await lockCommunityUsers(tx, actor);
        const rows = await tx.$queryRaw<
          {
            id: string;
            userId: string;
            handle: string;
            displayName: string;
            avatarAssetId: string | null;
          }[]
        >(
          Prisma.sql`SELECT f.id,p."userId",p.handle,p."displayName",p."avatarAssetId" FROM "UserFollow" f JOIN "UserProfile" p ON p."userId"=f."followedId" WHERE f."followerId"=${actor} AND ${notBlocked(actor, Prisma.sql`p."userId"`)} ${query.afterId ? Prisma.sql`AND f.id>${query.afterId}::uuid` : Prisma.empty} ORDER BY f.id LIMIT ${query.limit + 1}`,
        );
        return {
          follows: rows.slice(0, query.limit),
          next: rows.length > query.limit ? rows[query.limit - 1]!.id : null,
        };
      });
    },
  };
}
