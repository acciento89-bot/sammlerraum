import { Prisma } from "@sammlerraum/db/search-sql";
import {
  BillingError,
  BillingPolicySchema,
  BillingProviderContextSchema,
  type BillingPolicy,
  type BillingProviderContext,
} from "@sammlerraum/contracts/billing";
import { BillingOverviewSchema } from "@sammlerraum/contracts/billing-ui";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import { runSearchRead, type SearchDatabase } from "../search/search-read";
import { getEntitlementsInTransaction } from "./entitlement-service";
/** Own local snapshot only. No vendor calls, requested customer ids, or return-query authority. */
export function createBillingOverviewService(
  database: SearchDatabase,
  policyInput: BillingPolicy,
  contextInput: BillingProviderContext,
) {
  const p = BillingPolicySchema.safeParse(policyInput),
    c = BillingProviderContextSchema.safeParse(contextInput);
  if (!p.success || !c.success) throw new BillingError("BILLING_UNAVAILABLE");
  const policy = p.data,
    context = c.data;
  return {
    async getOverview(subjectInput: unknown) {
      const who = MembershipActorIdSchema.safeParse(subjectInput);
      if (!who.success) throw new BillingError("BILLING_NOT_FOUND");
      return runSearchRead(database, async (tx) => {
        const entitlement = await getEntitlementsInTransaction(tx, who.data, policy, context, {
          lockSubject: false,
        });
        const [clock] = await tx.$queryRaw<
          { readAt: Date; nextMonthlyResetAt: Date; hasCustomer: boolean }[]
        >(
          Prisma.sql`SELECT transaction_timestamp() AT TIME ZONE 'UTC' AS "readAt",date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 month' AS "nextMonthlyResetAt",EXISTS(SELECT 1 FROM "BillingAccount" WHERE "subjectId"=${who.data} AND provider=ANY(${context.providerIds}::text[]) AND "providerCustomerId" IS NOT NULL) AS "hasCustomer"`,
        );
        if (!clock) throw new BillingError("BILLING_UNAVAILABLE");
        const [usage] = await tx.$queryRaw<
          {
            ITEM_CREATE: string;
            MEDIA_COUNT: string;
            MEDIA_BYTES: string;
            AI_MONTHLY: string;
            IMPORT_PROFILES: string;
          }[]
        >(Prisma.sql`SELECT
    (SELECT count(*)::text FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId" WHERE i."ownerId"=${who.data} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL) AS "ITEM_CREATE",
    (SELECT count(*)::text FROM "MediaAsset" WHERE NOT "generatedArtifact" AND "ownerId"=${who.data}) AS "MEDIA_COUNT",
    (SELECT COALESCE(sum("byteSize"),0)::text FROM "MediaAsset" WHERE NOT "generatedArtifact" AND "ownerId"=${who.data}) AS "MEDIA_BYTES",
    (SELECT count(*)::text FROM "AIAnalysisAdmission" WHERE "ownerId"=${who.data} AND "admittedAt">=date_trunc('month',${clock?.readAt}::timestamp) AND "admittedAt"<${clock?.nextMonthlyResetAt}::timestamp) AS "AI_MONTHLY",
    (SELECT count(*)::text FROM "ImportMappingProfile" WHERE "ownerId"=${who.data}) AS "IMPORT_PROFILES"`);
        if (!clock || !usage) throw new BillingError("BILLING_UNAVAILABLE");
        return BillingOverviewSchema.parse({
          ...entitlement,
          ...clock,
          readAt: clock.readAt.toISOString(),
          nextMonthlyResetAt: clock.nextMonthlyResetAt.toISOString(),
          usage,
        });
      });
    },
  };
}
