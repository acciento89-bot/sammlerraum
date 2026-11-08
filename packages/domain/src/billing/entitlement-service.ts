import { Prisma } from "@sammlerraum/db/search-sql";
import {
  BillingError,
  BillingPolicySchema,
  assertPlanFeature,
  type BillingFeature,
  type BillingPolicy,
  type BillingUsage,
  type Entitlements,
} from "@sammlerraum/contracts/billing";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { SearchReadTransaction } from "../search/search-read";
/** Caller must retain the subject lock through any counted write. No Stripe request during feature checks. */
export async function getEntitlementsInTransaction(
  tx: SearchReadTransaction,
  subjectId: unknown,
  policy: BillingPolicy,
): Promise<Entitlements> {
  const subject = MembershipActorIdSchema.safeParse(subjectId);
  if (!subject.success) throw new BillingError("BILLING_NOT_FOUND");
  const [user] = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "user" WHERE id=${subject.data} AND "emailVerified" FOR UPDATE`,
  );
  if (!user) throw new BillingError("BILLING_NOT_FOUND");
  const [subscription] = await tx.$queryRaw<
    { currentPeriodEnd: Date; cancelAtPeriodEnd: boolean }[]
  >(
    Prisma.sql`SELECT "currentPeriodEnd","cancelAtPeriodEnd" FROM "BillingSubscription" WHERE "subjectId"=${subject.data} AND status IN ('ACTIVE','TRIALING') AND "currentPeriodStart"<=clock_timestamp() AND "currentPeriodEnd">clock_timestamp() ORDER BY "currentPeriodEnd" DESC,id LIMIT 1`,
  );
  const plan = subscription ? "PREMIUM" : "FREE";
  return {
    plan,
    limits: { ...policy[plan] },
    currentPeriodEnd: subscription?.currentPeriodEnd.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
  };
}
export function createEntitlementService(database: MembershipDatabase, policyInput: BillingPolicy) {
  const parsed = BillingPolicySchema.safeParse(policyInput);
  if (!parsed.success) throw new BillingError("BILLING_UNAVAILABLE");
  const policy = parsed.data;
  async function getEntitlements(subjectId: unknown) {
    try {
      return await runTransferTransaction(database, (tx) =>
        getEntitlementsInTransaction(tx, subjectId, policy),
      );
    } catch (error) {
      if (error instanceof BillingError) throw error;
      if (error instanceof MembershipError) throw new BillingError("BILLING_UNAVAILABLE");
      throw error;
    }
  }
  return {
    getEntitlements,
    async assertEntitled(subjectId: unknown, feature: BillingFeature, usage?: BillingUsage) {
      return assertPlanFeature(await getEntitlements(subjectId), feature, usage);
    },
  };
}
