import { Prisma } from "@sammlerraum/db/search-sql";
import { parseBillingPolicyEnv, parseBillingContextEnv } from "@sammlerraum/config/billing";
import {
  BillingError,
  QUOTA_FEATURES,
  PREMIUM_FEATURES,
  assertPlanFeature,
  type QuotaFeature,
  type PremiumFeature,
} from "@sammlerraum/contracts/billing";
import type { SearchReadTransaction } from "../search/search-read";
import { getEntitlementsInTransaction } from "./entitlement-service";
export function billingPolicy() {
  try {
    return parseBillingPolicyEnv(process.env);
  } catch {
    throw new BillingError("BILLING_UNAVAILABLE");
  }
}
export function quotaIsBounded(feature: QuotaFeature) {
  if (!(QUOTA_FEATURES as readonly string[]).includes(feature))
    throw new BillingError("BILLING_INVALID_REQUEST");
  return billingPolicy().FREE[feature] !== null;
}
/** Version update also rejects stale RepeatableRead snapshots after waiting on another admission. */
export async function lockBillingQuotaSubject(tx: SearchReadTransaction, subjectId: string) {
  const [row] = await tx.$queryRaw<{ subjectId: string }[]>(
    Prisma.sql`INSERT INTO "BillingQuotaFence" ("subjectId",revision) VALUES (${subjectId},1) ON CONFLICT("subjectId") DO UPDATE SET revision="BillingQuotaFence".revision+1 RETURNING "subjectId"`,
  );
  if (!row) throw new BillingError("BILLING_UNAVAILABLE");
}
async function fencedEntitlements(tx: SearchReadTransaction, subjectId: string) {
  let context;
  try {
    context = parseBillingContextEnv(process.env);
  } catch {
    throw new BillingError("BILLING_UNAVAILABLE");
  }
  return getEntitlementsInTransaction(
    tx,
    subjectId,
    billingPolicy(),
    { providerIds: context.providerIds },
    { lockSubject: false, requireVerified: false },
  );
}
export async function assertQuotaInTransaction(
  tx: SearchReadTransaction,
  subjectId: string,
  feature: QuotaFeature,
  amount = 1,
) {
  if (!Number.isSafeInteger(amount) || amount < 1)
    throw new BillingError("BILLING_INVALID_REQUEST");
  if (!quotaIsBounded(feature)) return;
  await lockBillingQuotaSubject(tx, subjectId);
  const entitlements = await fencedEntitlements(tx, subjectId);
  if (entitlements.limits[feature] === null) return;
  const query =
    feature === "ITEM_CREATE"
      ? Prisma.sql`SELECT count(*)::text AS used FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId" WHERE i."ownerId"=${subjectId} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL`
      : feature === "MEDIA_COUNT"
        ? Prisma.sql`SELECT count(*)::text AS used FROM "MediaAsset" WHERE NOT "generatedArtifact" AND "ownerId"=${subjectId}`
        : feature === "MEDIA_BYTES"
          ? Prisma.sql`SELECT COALESCE(sum("byteSize"),0)::text AS used FROM "MediaAsset" WHERE NOT "generatedArtifact" AND "ownerId"=${subjectId}`
          : feature === "IMPORT_PROFILES"
            ? Prisma.sql`SELECT count(*)::text AS used FROM "ImportMappingProfile" WHERE "ownerId"=${subjectId}`
            : Prisma.sql`SELECT count(*)::text AS used FROM "AIAnalysisAdmission" WHERE "ownerId"=${subjectId} AND "admittedAt">=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AND "admittedAt"<date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 month'`;
  const [row] = await tx.$queryRaw<{ used: string }[]>(query);
  if (!row) throw new BillingError("BILLING_UNAVAILABLE");
  const used = Number(row.used);
  if (!Number.isSafeInteger(used) || used < 0) throw new BillingError("PLAN_LIMIT_REACHED");
  assertPlanFeature(entitlements, feature, { currentCount: used, amount });
}
export async function assertFeatureInTransaction(
  tx: SearchReadTransaction,
  subjectId: string,
  feature: PremiumFeature,
) {
  if (!(PREMIUM_FEATURES as readonly string[]).includes(feature))
    throw new BillingError("BILLING_INVALID_REQUEST");
  if (billingPolicy().FREE[feature]) return;
  await lockBillingQuotaSubject(tx, subjectId);
  assertPlanFeature(await fencedEntitlements(tx, subjectId), feature);
}

/** Read-only bounded snapshot: no mutation or row lock for a feature read. */
export async function featureEnabledInTransaction(
  tx: SearchReadTransaction,
  subjectId: string,
  feature: PremiumFeature,
) {
  if (!(PREMIUM_FEATURES as readonly string[]).includes(feature))
    throw new BillingError("BILLING_INVALID_REQUEST");
  if (billingPolicy().FREE[feature]) return true;
  return (await fencedEntitlements(tx, subjectId)).limits[feature];
}
export async function assertReadFeatureInTransaction(
  tx: SearchReadTransaction,
  subjectId: string,
  feature: PremiumFeature,
) {
  if (!(await featureEnabledInTransaction(tx, subjectId, feature)))
    throw new BillingError("PREMIUM_REQUIRED");
}

export async function planQuotaInTransaction(
  tx: SearchReadTransaction,
  subjectId: string,
  feature: QuotaFeature,
) {
  if (!(QUOTA_FEATURES as readonly string[]).includes(feature))
    throw new BillingError("BILLING_INVALID_REQUEST");
  if (!quotaIsBounded(feature)) return null;
  return (await fencedEntitlements(tx, subjectId)).limits[feature];
}
