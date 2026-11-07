import { MembershipError } from "@sammlerraum/contracts/collaboration";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { BoundedSearchReadTransaction } from "../search/search-read";
/** Keep existing facts/authors/units untouched. Only a closed provenance graph can change owner. */
export async function requireClosedMoneyTransferScope(
  tx: BoundedSearchReadTransaction,
  collectionId: string,
): Promise<void> {
  for (const name of [
    "PurchaseMoneyInterpretationEvent",
    "CustomMoneyInterpretationEvent",
  ] as const) {
    const table = Prisma.raw(`"${name}"`);
    const [row] = await tx.$queryRaw<{ blocked: boolean }[]>(Prisma.sql`
      WITH scoped AS (SELECT id FROM "CollectibleItem" WHERE "collectionId"=${collectionId}::uuid),
      owned_events AS (SELECT event.id FROM ${table} event JOIN scoped ON scoped.id=event."itemId"),
      edges AS (
        SELECT event.id FROM ${table} event JOIN scoped ON scoped.id=event."itemId" WHERE event.operation='COPY'
        UNION SELECT event.id FROM ${table} event JOIN owned_events source ON source.id=event."sourceEventId" WHERE event.operation='COPY'
        UNION SELECT event.id FROM ${table} event JOIN owned_events origin ON origin.id=event."originEventId" WHERE event.operation='COPY'
      )
      SELECT EXISTS(SELECT 1 FROM edges JOIN ${table} copy ON copy.id=edges.id
        JOIN "CollectibleItem" target ON target.id=copy."itemId"
        LEFT JOIN ${table} source ON source.id=copy."sourceEventId"
        LEFT JOIN "CollectibleItem" source_item ON source_item.id=source."itemId"
        LEFT JOIN ${table} origin ON origin.id=copy."originEventId"
        LEFT JOIN "CollectibleItem" origin_item ON origin_item.id=origin."itemId"
        WHERE (source_item.id IS NOT NULL AND (source_item."collectionId"=${collectionId}::uuid)<>(target."collectionId"=${collectionId}::uuid))
           OR (origin_item.id IS NOT NULL AND (origin_item."collectionId"=${collectionId}::uuid)<>(target."collectionId"=${collectionId}::uuid))
      ) AS blocked
    `);
    if (!row || row.blocked) throw new MembershipError("MEMBERSHIP_TRANSFER_BLOCKED");
  }
}
