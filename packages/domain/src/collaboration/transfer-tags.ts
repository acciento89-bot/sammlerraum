import { randomUUID } from "node:crypto";
import { MembershipError } from "@sammlerraum/contracts/collaboration";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { BoundedSearchReadTransaction } from "../search/search-read";

/** Caller holds the collection and every affected item in stable order. */
export async function transferPrivateTags(
  tx: BoundedSearchReadTransaction,
  collectionId: string,
  oldOwnerId: string,
  newOwnerId: string,
): Promise<void> {
  const links = await tx.$queryRaw<
    {
      itemId: string;
      tagId: string;
      ownerId: string;
      name: string;
      normalizedName: string;
    }[]
  >(Prisma.sql`
    SELECT link."itemId",link."tagId",tag."ownerId",tag.name,tag."normalizedName"
    FROM "ItemTag" link JOIN "CollectibleItem" item ON item.id=link."itemId"
    JOIN "Tag" tag ON tag.id=link."tagId"
    WHERE item."collectionId"=${collectionId}::uuid
    ORDER BY tag."normalizedName" COLLATE "C",tag.id,link."itemId" LIMIT 10001
  `);
  if (links.length > 10000) throw new MembershipError("MEMBERSHIP_LIMIT_EXCEEDED");
  if (links.some((link) => link.ownerId !== oldOwnerId))
    throw new MembershipError("MEMBERSHIP_INTEGRITY");
  const replacements = new Map<string, string>();
  // Use the database's ordered normalized names for a consistent upsert lock order.
  for (const link of links) {
    if (replacements.has(link.tagId)) continue;
    const [tag] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "Tag" (id,"ownerId",name,"normalizedName")
      VALUES (${randomUUID()}::uuid,${newOwnerId},${link.name},${link.normalizedName})
      ON CONFLICT ("ownerId","normalizedName") DO UPDATE SET id="Tag".id RETURNING id
    `);
    if (!tag) throw new MembershipError("MEMBERSHIP_INTEGRITY");
    replacements.set(link.tagId, tag.id);
  }
  // Old tags may still label another collection: only replace this collection's links.
  if (links.length) {
    await tx.$queryRaw(Prisma.sql`
      DELETE FROM "ItemTag" link USING "CollectibleItem" item
      WHERE item.id=link."itemId" AND item."collectionId"=${collectionId}::uuid
      RETURNING link."itemId"
    `);
    const rows = links.map(
      (link) => Prisma.sql`(${link.itemId}::uuid,${replacements.get(link.tagId)!}::uuid)`,
    );
    // Bounded batches avoid one statement per link and the protocol parameter ceiling.
    for (let start = 0; start < rows.length; start += 500)
      await tx.$queryRaw(Prisma.sql`
        INSERT INTO "ItemTag" ("itemId","tagId") VALUES ${Prisma.join(rows.slice(start, start + 500))}
        ON CONFLICT DO NOTHING RETURNING "itemId"
      `);
  }
}
