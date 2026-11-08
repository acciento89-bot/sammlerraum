import { MembershipError } from "@sammlerraum/contracts/collaboration";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { BoundedSearchReadTransaction } from "../search/search-read";

/** No storage I/O in this transaction. The same advisory namespace excludes byte writers/cleanup. */
export async function lockPrivateTransferMedia(
  tx: BoundedSearchReadTransaction,
  collectionId: string,
  oldOwnerId: string,
): Promise<string[]> {
  const assets = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT asset.id FROM "MediaAsset" asset WHERE asset.id IN (
      SELECT link."assetId" FROM "MediaLink" link JOIN "CollectibleItem" item ON item.id=link."itemId" WHERE item."collectionId"=${collectionId}::uuid
      UNION SELECT link."assetId" FROM "DocumentLink" link JOIN "CollectibleItem" item ON item.id=link."itemId" WHERE item."collectionId"=${collectionId}::uuid
    ) ORDER BY asset.id LIMIT 1001
  `);
  if (assets.length > 1000) throw new MembershipError("MEMBERSHIP_LIMIT_EXCEEDED");
  for (const { id } of assets) {
    const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${`sammlerraum:media:${id}`},0)) AS acquired
    `);
    if (!lock?.acquired) throw new MembershipError("MEMBERSHIP_TRANSFER_BLOCKED");
    const [asset] = await tx.$queryRaw<{ ownerId: string; ready: boolean }[]>(Prisma.sql`
      SELECT "ownerId",(status='READY' AND "cleanupStartedAt" IS NULL AND "processingToken" IS NULL AND "processingLeaseUntil" IS NULL) AS ready
      FROM "MediaAsset" WHERE id=${id}::uuid FOR UPDATE
    `);
    if (!asset || asset.ownerId !== oldOwnerId) throw new MembershipError("MEMBERSHIP_INTEGRITY");
    if (!asset.ready) throw new MembershipError("MEMBERSHIP_TRANSFER_BLOCKED");
    const [outside] = await tx.$queryRaw<{ blocked: boolean }[]>(Prisma.sql`
      SELECT (EXISTS(SELECT 1 FROM "MediaLink" link JOIN "CollectibleItem" item ON item.id=link."itemId" WHERE link."assetId"=${id}::uuid AND item."collectionId"<>${collectionId}::uuid)
       OR EXISTS(SELECT 1 FROM "DocumentLink" link JOIN "CollectibleItem" item ON item.id=link."itemId" WHERE link."assetId"=${id}::uuid AND item."collectionId"<>${collectionId}::uuid)
       OR EXISTS(SELECT 1 FROM "UserProfile" WHERE "avatarAssetId"=${id}::uuid)
       OR EXISTS(SELECT 1 FROM "ExportJob" WHERE "artifactId"=${id}::uuid)
       OR EXISTS(SELECT 1 FROM "ReportJob" WHERE "artifactId"=${id}::uuid)) AS blocked
    `);
    if (!outside || outside.blocked) throw new MembershipError("MEMBERSHIP_TRANSFER_BLOCKED");
  }
  return assets.map((asset) => asset.id);
}
export async function transferPrivateMedia(
  tx: BoundedSearchReadTransaction,
  assetIds: string[],
  newOwnerId: string,
): Promise<void> {
  for (const id of assetIds)
    await tx.$queryRaw(
      Prisma.sql`UPDATE "MediaAsset" SET "ownerId"=${newOwnerId} WHERE id=${id}::uuid RETURNING id`,
    );
}
