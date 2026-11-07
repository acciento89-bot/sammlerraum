import { CommunityError, type FavoriteTarget } from "@sammlerraum/contracts/community";
import type { SearchReadTransaction } from "../search/search-read";
import { Prisma } from "@sammlerraum/db/search-sql";
/** Trusted fixed SQL aliases i/c only; no user-provided SQL or cached visibility facts. */
export const publicItemPredicate = Prisma.sql`
 i.visibility='PUBLIC' AND i."deletedAt" IS NULL AND c.visibility='PUBLIC' AND c."deletedAt" IS NULL AND i."ownerId"=c."ownerId"
 AND (i."nodeId" IS NULL OR coalesce((
  WITH RECURSIVE ancestors AS (
   SELECT n.id,n."parentId",n.visibility,ARRAY[n.id] AS path,false AS cycle,0 AS depth FROM "CollectionNode" n WHERE n.id=i."nodeId" AND n."collectionId"=i."collectionId"
   UNION ALL SELECT p.id,p."parentId",p.visibility,a.path||p.id,p.id=ANY(a.path),a.depth+1 FROM "CollectionNode" p JOIN ancestors a ON p.id=a."parentId" WHERE p."collectionId"=i."collectionId" AND NOT a.cycle AND a.depth<64
  ) SELECT bool_and(visibility='PUBLIC' AND NOT cycle) AND bool_or("parentId" IS NULL) FROM ancestors
 ),false))
`;
export function notBlocked(actor: string, owner: Prisma.Sql) {
  return Prisma.sql`NOT EXISTS(SELECT 1 FROM "UserBlock" b WHERE (b."blockerId"=${actor} AND b."blockedId"=${owner}) OR (b."blockerId"=${owner} AND b."blockedId"=${actor}))`;
}

export type PublicCommunityTarget = {
  id: string;
  ownerId: string;
  collectionId: string;
  title: string;
};

export async function lockCommunityUsers(tx: SearchReadTransaction, actor: string, target = actor) {
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "user" WHERE id IN (${actor},${target}) ORDER BY id COLLATE "C" FOR NO KEY UPDATE`,
  );
  if (rows.length !== (actor === target ? 1 : 2)) throw new CommunityError("NOT_FOUND");
}
export async function assertCommunityInteraction(
  tx: SearchReadTransaction,
  actor: string,
  target: string,
) {
  const [row] = await tx.$queryRaw<{ allowed: boolean }[]>(
    Prisma.sql`SELECT ${notBlocked(actor, Prisma.sql`${target}`)} AS allowed`,
  );
  if (!row?.allowed) throw new CommunityError("BLOCKED_INTERACTION");
}
export async function loadPublicCommunityTarget(
  tx: SearchReadTransaction,
  target: FavoriteTarget,
): Promise<PublicCommunityTarget> {
  const rows =
    target.type === "COLLECTION"
      ? await tx.$queryRaw<PublicCommunityTarget[]>(
          Prisma.sql`SELECT id,"ownerId",id AS "collectionId",name AS title FROM "Collection" WHERE id=${target.id}::uuid AND visibility='PUBLIC' AND "deletedAt" IS NULL`,
        )
      : await tx.$queryRaw<PublicCommunityTarget[]>(
          Prisma.sql`SELECT i.id,i."ownerId",i."collectionId",i.title FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id=${target.id}::uuid AND ${publicItemPredicate}`,
        );
  if (!rows[0]) throw new CommunityError("NOT_FOUND");
  return rows[0];
}
