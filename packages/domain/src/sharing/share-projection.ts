import type { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { ShareError, SharePermissionsSchema } from "@sammlerraum/contracts/sharing";
import type { BoundedSearchReadTransaction } from "../search/search-read";
import { readMoneyFact } from "../money/legacy-money-store";
import { shareScopeCte, shareItemPredicate, type ShareScope } from "./share-scope";

type Rights = z.infer<typeof SharePermissionsSchema>;
export type ShareBaseItem = {
  id: string;
  title: string;
  publicDescription: string | null;
  quantity: number;
  privateNotes: string | null;
};
type Document = { id: string; title: string | null; category: string; mimeType: string };
type Image = {
  id: string;
  title: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
};
type Insurance = {
  amountMinor: string | null;
  currency: string | null;
  minorUnitExponent: number | null;
  basis: string;
  valuationDate: string | null;
  insurer: string | null;
  policyReference: string | null;
};
type Valuation = {
  amountMinor: string;
  currency: string;
  minorUnitExponent: number;
  basis: string;
  observedAt: string;
};
async function sharedPurchase(tx: BoundedSearchReadTransaction, scope: ShareScope, id: string) {
  // This is an internal read projection after checking the explicit capability, never a write.
  const view = await readMoneyFact(
      tx,
      { family: "PURCHASE", itemId: id },
      { userId: scope.creatorUserId },
    ),
    i = view.interpretation;
  return {
    raw: view.raw,
    interpretation:
      i.kind === "INTERPRETED"
        ? {
            kind: i.kind,
            exponent: i.exponent,
            decimal: i.decimal,
            unitKey: i.unitKey,
            eligibility: i.eligibility,
          }
        : i.kind === "UNKNOWN"
          ? { kind: i.kind, reason: i.reason }
          : { kind: i.kind },
  };
}
export type SharedItem = Omit<ShareBaseItem, "privateNotes"> & {
  privateNotes?: string | null;
  storageLocation?: { name: string; type: string } | null;
  insurance?: Insurance | null;
  purchase?: Awaited<ReturnType<typeof sharedPurchase>>;
  valuation?: Valuation | null;
  documents?: Document[];
  images?: Image[];
};
export async function validateShareDocuments(
  tx: BoundedSearchReadTransaction,
  scope: ShareScope,
  rights: Rights,
) {
  if (!rights.documents.length) return;
  const ids = [...new Set(rights.documents)];
  if (ids.length !== rights.documents.length) throw new ShareError("SHARE_INVALID");
  const rows = await tx.$queryRaw<{ id: string; category: string }[]>(
    Prisma.sql`${shareScopeCte(scope)} SELECT d.id,d.category FROM "DocumentLink" d JOIN "CollectibleItem" i ON i.id=d."itemId" AND i."ownerId"=d."ownerId" JOIN "MediaAsset" a ON a.id=d."assetId" AND a."ownerId"=d."ownerId" WHERE ${shareItemPredicate(scope)} AND d.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND a.kind='DOCUMENT' AND a.status='READY' AND a."cleanupStartedAt" IS NULL AND a."mimeType"='application/pdf' ORDER BY d.id FOR SHARE OF d,a,i`,
  );
  if (rows.length !== ids.length) throw new ShareError("SHARE_NOT_FOUND");
  if (
    !rights.purchaseReceipts &&
    rows.some((row) => row.category === "PURCHASE_RECEIPT" || row.category === "INVOICE")
  )
    throw new ShareError("SHARE_INVALID");
}
/** Explicit field lists only. No spread of database rows, authoring evidence or storage metadata. */
export async function projectShareItems(
  tx: BoundedSearchReadTransaction,
  scope: ShareScope,
  rights: Rights,
  items: ShareBaseItem[],
): Promise<SharedItem[]> {
  const output: SharedItem[] = [];
  for (const item of items) {
    tx.checkBudget();
    const value: SharedItem = {
      id: item.id,
      title: item.title,
      publicDescription: item.publicDescription,
      quantity: item.quantity,
    };
    if (rights.privateNotes) value.privateNotes = item.privateNotes;
    if (rights.storageLocation) {
      const [location] = await tx.$queryRaw<{ name: string; type: string }[]>(
        Prisma.sql`SELECT l.name,l.type FROM "StorageLocation" l JOIN "CollectibleItem" i ON i."storageLocationId"=l.id AND i."ownerId"=l."ownerId" WHERE i.id=${item.id}::uuid AND i."ownerId"=${scope.creatorUserId}`,
      );
      value.storageLocation = location ?? null;
    }
    if (rights.insurance) {
      const [insurance] = await tx.$queryRaw<Insurance[]>(
        Prisma.sql`SELECT "amountMinor"::text,currency,"minorUnitExponent",basis,to_char("valuationDate",'YYYY-MM-DD') AS "valuationDate",insurer,"policyReference" FROM "InsuranceRecord" WHERE "itemId"=${item.id}::uuid AND "ownerId"=${scope.creatorUserId}`,
      );
      value.insurance = insurance ?? null;
    }
    if (rights.values) {
      value.purchase = await sharedPurchase(tx, scope, item.id);
      const [valuation] = await tx.$queryRaw<Valuation[]>(
        Prisma.sql`SELECT "amountMinor"::text,currency,"minorUnitExponent",basis,to_char("observedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "observedAt" FROM "Valuation" WHERE "itemId"=${item.id}::uuid AND "ownerId"=${scope.creatorUserId} ORDER BY "observedAt" DESC,"createdAt" DESC,id DESC LIMIT 1`,
      );
      value.valuation = valuation ?? null;
    }
    if (rights.documents.length) {
      value.documents = await tx.$queryRaw<Document[]>(
        Prisma.sql`SELECT d.id,d.title,d.category,a."mimeType" FROM "DocumentLink" d JOIN "MediaAsset" a ON a.id=d."assetId" AND a."ownerId"=d."ownerId" WHERE d."itemId"=${item.id}::uuid AND d."ownerId"=${scope.creatorUserId} AND d.id IN (${Prisma.join(rights.documents.map((id) => Prisma.sql`${id}::uuid`))}) AND a.status='READY' AND a.kind='DOCUMENT' AND a."cleanupStartedAt" IS NULL AND a."mimeType"='application/pdf' ${rights.purchaseReceipts ? Prisma.empty : Prisma.sql`AND d.category NOT IN ('PURCHASE_RECEIPT','INVOICE')`} ORDER BY d.position,d.id LIMIT 50`,
      );
    }
    if (rights.images) {
      value.images = await tx.$queryRaw<Image[]>(
        Prisma.sql`SELECT l.id,l.title,a."mimeType",a.width,a.height FROM "MediaLink" l JOIN "MediaAsset" a ON a.id=l."assetId" AND a."ownerId"=l."ownerId" WHERE l."itemId"=${item.id}::uuid AND l."ownerId"=${scope.creatorUserId} AND a.status='READY' AND a.kind='IMAGE' AND a."cleanupStartedAt" IS NULL AND a."mimeType" IN ('image/jpeg','image/png','image/webp') ORDER BY l.position,l.id LIMIT 8`,
      );
    }
    output.push(value);
  }
  if (Buffer.byteLength(JSON.stringify(output)) > 2097152)
    throw new ShareError("SHARE_LIMIT_EXCEEDED");
  return output;
}

/** A child share never inherits its unselected collection's insurance or policy data. */
export async function projectShareCollectionInsurance(
  tx: BoundedSearchReadTransaction,
  scope: ShareScope,
  rights: Rights,
): Promise<Insurance | null | undefined> {
  if (scope.targetKind !== "COLLECTION" || !rights.insurance) return undefined;
  const [value] = await tx.$queryRaw<Insurance[]>(
    Prisma.sql`SELECT "amountMinor"::text,currency,"minorUnitExponent",basis,to_char("valuationDate",'YYYY-MM-DD') AS "valuationDate",insurer,"policyReference" FROM "InsuranceRecord" WHERE "collectionId"=${scope.collectionId}::uuid AND "ownerId"=${scope.creatorUserId}`,
  );
  return value ?? null;
}
