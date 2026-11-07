import { Prisma } from "@sammlerraum/db/search-sql";
import { AuditError, type AuditMutation } from "@sammlerraum/contracts/audit";
import type { SearchReadTransaction } from "../search/search-read";
export type AuditScope = {
  ownerId: string;
  collectionId: string | null;
  itemId: string | null;
  locationOwnerUserId: string | null;
};
function missing(): never {
  throw new AuditError("AUDIT_NOT_FOUND");
}
export async function lockAuditUser(tx: SearchReadTransaction, id: string) {
  const [user] = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "user" WHERE id=${id} FOR NO KEY UPDATE`,
  );
  if (!user) return missing();
}
/** Locks in resource order and derives ownership from current data, including retained trash. */
export async function resolveAuditScope(
  tx: SearchReadTransaction,
  target: Pick<AuditMutation, "resourceType" | "resourceId">,
  history = false,
  requiredOwner?: string,
): Promise<AuditScope> {
  if (target.resourceType === "LOCATION") {
    let [row] = await tx.$queryRaw<{ ownerId: string }[]>(
      Prisma.sql`SELECT "ownerId" FROM "StorageLocation" WHERE id=${target.resourceId}::uuid`,
    );
    if (!row && history) {
      const rows = await tx.$queryRaw<{ ownerId: string }[]>(
        Prisma.sql`SELECT DISTINCT "locationOwnerUserId" AS "ownerId" FROM "AuditEvent" WHERE "resourceType"='LOCATION' AND "resourceId"=${target.resourceId}::uuid AND "locationOwnerUserId" IS NOT NULL LIMIT 2`,
      );
      if (rows.length === 1) row = rows[0];
    }
    if (!row || (requiredOwner !== undefined && row.ownerId !== requiredOwner)) return missing();
    await lockAuditUser(tx, row.ownerId);
    // A live location is rechecked after acquiring the namespace lock.
    const [live] = await tx.$queryRaw<{ ownerId: string }[]>(
      Prisma.sql`SELECT "ownerId" FROM "StorageLocation" WHERE id=${target.resourceId}::uuid FOR SHARE`,
    );
    if (live && live.ownerId !== row.ownerId) return missing();
    if (!live && !history) return missing();
    return {
      ownerId: row.ownerId,
      collectionId: null,
      itemId: null,
      locationOwnerUserId: row.ownerId,
    };
  }
  let collectionId: string | undefined;
  if (target.resourceType === "COLLECTION") collectionId = target.resourceId;
  else {
    const table = Prisma.raw(
      target.resourceType === "ITEM"
        ? '"CollectibleItem"'
        : target.resourceType === "NODE"
          ? '"CollectionNode"'
          : target.resourceType === "IMPORT_JOB"
            ? '"ImportJob"'
            : '"CollectionShare"',
    );
    const [reference] = await tx.$queryRaw<{ collectionId: string }[]>(
      Prisma.sql`SELECT "collectionId" FROM ${table} WHERE id=${target.resourceId}::uuid`,
    );
    collectionId = reference?.collectionId;
    if (!collectionId && history && target.resourceType !== "ITEM") {
      const prior = await tx.$queryRaw<{ collectionId: string }[]>(
        Prisma.sql`SELECT DISTINCT "collectionId" FROM "AuditEvent" WHERE "resourceType"=${target.resourceType}::"AuditResourceType" AND "resourceId"=${target.resourceId}::uuid AND "collectionId" IS NOT NULL LIMIT 2`,
      );
      if (prior.length === 1) collectionId = prior[0]!.collectionId;
    }
  }
  if (!collectionId) return missing();
  const [parent] = await tx.$queryRaw<{ ownerId: string }[]>(
    Prisma.sql`SELECT "ownerId" FROM "Collection" WHERE id=${collectionId}::uuid ${requiredOwner !== undefined ? Prisma.sql`AND "ownerId"=${requiredOwner}` : Prisma.empty} FOR SHARE`,
  );
  if (!parent) return missing();
  if (target.resourceType === "ITEM") {
    const [item] = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "CollectibleItem" WHERE id=${target.resourceId}::uuid AND "collectionId"=${collectionId}::uuid AND "ownerId"=${parent.ownerId} FOR SHARE`,
    );
    if (!item) return missing();
    return {
      ownerId: parent.ownerId,
      collectionId: null,
      itemId: item.id,
      locationOwnerUserId: null,
    };
  }
  return { ownerId: parent.ownerId, collectionId, itemId: null, locationOwnerUserId: null };
}
export function auditAnchorPredicate(scope: AuditScope) {
  return scope.itemId
    ? Prisma.sql`"itemId"=${scope.itemId}::uuid`
    : scope.collectionId
      ? Prisma.sql`"collectionId"=${scope.collectionId}::uuid`
      : Prisma.sql`"locationOwnerUserId"=${scope.locationOwnerUserId}`;
}
