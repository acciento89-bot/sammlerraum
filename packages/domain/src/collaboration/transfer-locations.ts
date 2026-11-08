import { randomBytes, randomUUID } from "node:crypto";
import { MembershipError } from "@sammlerraum/contracts/collaboration";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { BoundedSearchReadTransaction } from "../search/search-read";
type Location = {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  visibility: string;
};
/** Caller locks both users before the collection/items, serializing normal hierarchy edits. */
export async function transferPrivateLocations(
  tx: BoundedSearchReadTransaction,
  collectionId: string,
  oldOwnerId: string,
  newOwnerId: string,
): Promise<void> {
  const [count] = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) FROM "ItemLocationHistory" history JOIN "CollectibleItem" item ON item.id=history."itemId" WHERE item."collectionId"=${collectionId}::uuid
  `);
  if (!count || count.count > 10000n) throw new MembershipError("MEMBERSHIP_LIMIT_EXCEEDED");
  const locations = await tx.$queryRaw<Location[]>(Prisma.sql`
    WITH RECURSIVE seeds(id) AS (
      SELECT "storageLocationId" FROM "CollectibleItem" WHERE "collectionId"=${collectionId}::uuid
      UNION SELECT history."fromLocationId" FROM "ItemLocationHistory" history JOIN "CollectibleItem" item ON item.id=history."itemId" WHERE item."collectionId"=${collectionId}::uuid
      UNION SELECT history."toLocationId" FROM "ItemLocationHistory" history JOIN "CollectibleItem" item ON item.id=history."itemId" WHERE item."collectionId"=${collectionId}::uuid
    ), needed(id) AS (
      SELECT id FROM seeds WHERE id IS NOT NULL
      UNION SELECT location."parentId" FROM "StorageLocation" location JOIN needed ON needed.id=location.id
        WHERE location."ownerId"=${oldOwnerId} AND location."parentId" IS NOT NULL
    )
    SELECT location.id,location."parentId",location.name,location.type,location.visibility
    FROM "StorageLocation" location JOIN needed ON needed.id=location.id
    WHERE location."ownerId"=${oldOwnerId} ORDER BY location.id LIMIT 1001
  `);
  if (locations.length > 1000) throw new MembershipError("MEMBERSHIP_LIMIT_EXCEEDED");
  const ordered: Location[] = [],
    pending = new Map(locations.map((location) => [location.id, location]));
  const copies = new Map<string, string>();
  // Reject cycles/missing ancestors without recursion or partial writes.
  while (pending.size) {
    const layer = [...pending.values()].filter(
      (location) => location.parentId === null || copies.has(location.parentId),
    );
    if (!layer.length) throw new MembershipError("MEMBERSHIP_INTEGRITY");
    for (const location of layer) {
      copies.set(location.id, randomUUID());
      ordered.push(location);
      pending.delete(location.id);
    }
  }
  if (!locations.length && count.count === 0n) return;
  await tx.$queryRaw(
    Prisma.sql`SET CONSTRAINTS "CollectibleItem_storageLocationId_ownerId_fkey", "ItemLocationHistory_itemId_ownerId_fkey" DEFERRED`,
  );
  for (const location of ordered) {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO "StorageLocation" (id,"ownerId","parentId",name,type,visibility,"qrToken","updatedAt")
      VALUES (${copies.get(location.id)!}::uuid,${newOwnerId},${location.parentId ? copies.get(location.parentId)! : null}::uuid,
       ${location.name},${location.type}::"LocationType",${location.visibility}::"Visibility",${randomBytes(32).toString("base64url")},timezone('UTC',clock_timestamp())) RETURNING id
    `);
  }
  if (locations.length) {
    const mapping = Prisma.join(
      locations.map(
        (location) => Prisma.sql`(${location.id}::uuid,${copies.get(location.id)!}::uuid)`,
      ),
    );
    await tx.$queryRaw(Prisma.sql`
      UPDATE "CollectibleItem" item SET "storageLocationId"=mapping.target
      FROM (VALUES ${mapping}) AS mapping(source,target)
      WHERE item."collectionId"=${collectionId}::uuid AND item."storageLocationId"=mapping.source RETURNING item.id
    `);
    await tx.$queryRaw(Prisma.sql`
      WITH mapping(source,target) AS (VALUES ${mapping})
      UPDATE "ItemLocationHistory" history SET "ownerId"=${newOwnerId},
        "fromLocationId"=(SELECT target FROM mapping WHERE source=history."fromLocationId"),
        "toLocationId"=(SELECT target FROM mapping WHERE source=history."toLocationId")
      FROM "CollectibleItem" item WHERE item.id=history."itemId" AND item."collectionId"=${collectionId}::uuid
      RETURNING history.id
    `);
  }
}
