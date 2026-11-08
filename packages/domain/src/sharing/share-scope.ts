import { Prisma } from "@sammlerraum/db/search-sql";
export type ShareScope = {
  collectionId: string;
  creatorUserId: string;
  targetKind: "COLLECTION" | "NODE" | "ITEM";
  targetId: string;
};
export function shareScopeCte(row: ShareScope) {
  return row.targetKind === "NODE"
    ? Prisma.sql`WITH RECURSIVE scope(id) AS (SELECT id FROM "CollectionNode" WHERE id=${row.targetId}::uuid AND "collectionId"=${row.collectionId}::uuid UNION SELECT n.id FROM "CollectionNode" n JOIN scope s ON n."parentId"=s.id WHERE n."collectionId"=${row.collectionId}::uuid)`
    : Prisma.empty;
}
/** The alias i is fixed by callers; all external identifiers remain bound parameters. */
export function shareItemPredicate(row: ShareScope) {
  return Prisma.sql`i."collectionId"=${row.collectionId}::uuid AND i."ownerId"=${row.creatorUserId} AND i."deletedAt" IS NULL ${row.targetKind === "ITEM" ? Prisma.sql`AND i.id=${row.targetId}::uuid` : row.targetKind === "NODE" ? Prisma.sql`AND i."nodeId" IN (SELECT id FROM scope)` : Prisma.empty}`;
}
