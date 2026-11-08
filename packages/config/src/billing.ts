import { z } from "zod";
import { BillingPolicySchema } from "@sammlerraum/contracts/billing";
import { EnvironmentConfigurationError } from "./errors";
/** Required central product policy; never substitute guessed Free/Premium quotas. */
export function parseBillingPolicyEnv(input: Record<string, string | undefined>) {
  try {
    if (!input.BILLING_PLAN_LIMITS || Buffer.byteLength(input.BILLING_PLAN_LIMITS, "utf8") > 8192)
      throw new Error();
    const parsed = BillingPolicySchema.safeParse(JSON.parse(input.BILLING_PLAN_LIMITS));
    if (!parsed.success) throw new Error();
    return parsed.data;
  } catch {
    throw new EnvironmentConfigurationError(["BILLING_PLAN_LIMITS"]);
  }
}

/** Payment data is namespace-isolated even if an operator changes test/live credentials. */
export function parseBillingContextEnv(input: Record<string, string | undefined>) {
  const mode = z
    .enum(["test", "live"])
    .safeParse(input.BILLING_ENVIRONMENT ?? (input.NODE_ENV === "production" ? "live" : "test"));
  if (!mode.success) throw new EnvironmentConfigurationError(["BILLING_ENVIRONMENT"]);
  return { liveMode: mode.data === "live", providerIds: [`stripe_${mode.data}`] };
}
