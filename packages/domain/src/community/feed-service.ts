import { Prisma } from "@sammlerraum/db/search-sql";
import { CommunityError, CommunityFeedQuerySchema } from "@sammlerraum/contracts/community";
import { communityActor, communityTransaction, type CommunityActor } from "./community-transaction";
import { lockCommunityParticipants, notBlocked, publicItemPredicate } from "./social-scope";
import type { CommunityDatabase } from "./social-service";
type FeedRow = {
  id: string;
  title: string;
  publicDescription: string | null;
  tradeStatus: "NOT_FOR_TRADE" | "OPEN_TO_TRADE" | "FOR_SALE" | "RESERVED";
  collectionId: string;
  collectionName: string;
  ownerId: string;
  handle: string;
  displayName: string;
  createdAt: Date;
  imageAssetId: string | null;
  favorite: boolean;
  following: boolean;
  isOwner: boolean;
  commentsEnabled: boolean;
};
export function createFeedService(db: CommunityDatabase) {
  return {
    async getFeed(who: CommunityActor, input: unknown = {}) {
      const parsed = CommunityFeedQuerySchema.safeParse(input);
      if (!parsed.success) throw new CommunityError("COMMUNITY_INVALID");
      const value = parsed.data,
        actor = communityActor(who);
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor], "READ");
        const permitted = Prisma.sql`${publicItemPredicate} AND ${notBlocked(actor, Prisma.sql`c."ownerId"`)} AND EXISTS(SELECT 1 FROM "UserProfile" p WHERE p."userId"=c."ownerId")`;
        const following = Prisma.sql`EXISTS(SELECT 1 FROM "UserFollow" f WHERE f."followerId"=${actor} AND f."followedId"=c."ownerId")`;
        const favorite = Prisma.sql`EXISTS(SELECT 1 FROM "Favorite" f WHERE f."userId"=${actor} AND f."itemId"=i.id)`;
        const rows = await tx.$queryRaw<FeedRow[]>(
          Prisma.sql`WITH cursor AS (SELECT i."createdAt",i.id FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id=${value.afterId ?? null}::uuid AND ${permitted}) SELECT i.id,i.title,left(i."publicDescription",400) AS "publicDescription",i."tradeStatus",c.id AS "collectionId",c.name AS "collectionName",c."ownerId",p.handle,p."displayName",i."createdAt",(SELECT a.id FROM "MediaLink" ml JOIN "MediaAsset" a ON a.id=ml."assetId" WHERE ml."itemId"=i.id AND ml.purpose='GALLERY' AND a.kind='IMAGE' AND a.status='READY' AND a."cleanupStartedAt" IS NULL AND a."ownerId"=i."ownerId" ORDER BY ml.position,ml.id LIMIT 1) AS "imageAssetId",EXISTS(SELECT 1 FROM "Favorite" f WHERE f."userId"=${actor} AND f."itemId"=i.id) AS favorite,${following} AS following,c."ownerId"=${actor} AS "isOwner",i."commentsEnabled" AND c."commentsEnabled" AND coalesce(cp."commentsEnabled",true) AS "commentsEnabled" FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" JOIN "UserProfile" p ON p."userId"=c."ownerId" LEFT JOIN "CommunityPreference" cp ON cp."userId"=c."ownerId" WHERE ${permitted} ${value.scope === "FOLLOWING" ? Prisma.sql`AND ${following}` : value.scope === "FAVORITES" ? Prisma.sql`AND ${favorite}` : Prisma.empty} ${value.afterId ? Prisma.sql`AND (i."createdAt",i.id)<(SELECT "createdAt",id FROM cursor)` : Prisma.empty} ORDER BY i."createdAt" DESC,i.id DESC LIMIT ${value.limit + 1}`,
        );
        return {
          items: rows
            .slice(0, value.limit)
            .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
          next: rows.length > value.limit ? rows[value.limit - 1]!.id : null,
        };
      });
    },
  };
}
