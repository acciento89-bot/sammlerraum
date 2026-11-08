import { createHash } from "node:crypto";
import {
  parseBillingPolicyEnv,
  parseBillingProviderEnv,
  parseBillingContextEnv,
} from "@sammlerraum/config/server";
import { BillingError, type BillingPolicy } from "@sammlerraum/contracts/billing";
import { StripeBillingProvider } from "@sammlerraum/billing/stripe-provider";
import { createBillingOverviewService } from "@sammlerraum/domain/billing/billing-overview";
import { prisma } from "@sammlerraum/db/client";
import { createBillingPriceCache } from "./billing-price-cache";
const publicPrices = createBillingPriceCache();
export async function ownBillingOverview(subjectId: string) {
  try {
    const context = parseBillingContextEnv(process.env);
    return await createBillingOverviewService(prisma, parseBillingPolicyEnv(process.env), {
      providerIds: context.providerIds,
    }).getOverview(subjectId);
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError("BILLING_UNAVAILABLE");
  }
}
export function billingPaymentActionsEnabled() {
  try {
    return parseBillingProviderEnv(process.env) !== null;
  } catch {
    return false;
  }
}
export async function publicBillingCatalog() {
  let policy: BillingPolicy | null = null;
  try {
    policy = parseBillingPolicyEnv(process.env);
  } catch {
    /* No guessed limits. */
  }
  try {
    const config = parseBillingProviderEnv(process.env);
    if (!config) return { policy, offers: null, paymentsEnabled: false };
    const fingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
    const offers = await publicPrices.read(fingerprint, () =>
      new StripeBillingProvider(config).getPublicPrices(),
    );
    return { policy, offers, paymentsEnabled: true };
  } catch {
    return { policy, offers: null, paymentsEnabled: false };
  }
}
