import { Prisma } from "@sammlerraum/db/search-sql";
/** Explicit private declarations only. Both endpoints and parents must still be live and owned.
 * Candidate lifecycle belongs to the outer scope; a retained marked partner has its own lifecycle. */
export function markedDuplicatePredicate(actorUserId: string): Prisma.Sql {
  return Prisma.sql`EXISTS(SELECT 1 FROM "DuplicateRelation" d JOIN "CollectibleItem" a ON a.id=d."itemAId" JOIN "Collection" ac ON ac.id=a."collectionId" AND ac."ownerId"=a."ownerId" JOIN "CollectibleItem" b ON b.id=d."itemBId" JOIN "Collection" bc ON bc.id=b."collectionId" AND bc."ownerId"=b."ownerId" WHERE d."ownerId"=${actorUserId} AND (d."itemAId"=i.id OR d."itemBId"=i.id) AND a."ownerId"=${actorUserId} AND b."ownerId"=${actorUserId} AND a."deletedAt" IS NULL AND b."deletedAt" IS NULL AND ac."deletedAt" IS NULL AND bc."deletedAt" IS NULL)`;
}
