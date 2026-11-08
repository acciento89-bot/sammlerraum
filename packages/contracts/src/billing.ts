import { z } from "zod";
export const QUOTA_FEATURES = [
  "ITEM_CREATE",
  "MEDIA_COUNT",
  "MEDIA_BYTES",
  "AI_MONTHLY",
  "IMPORT_PROFILES",
] as const;
export const PREMIUM_FEATURES = [
  "MARKET_DATA",
  "EXTENDED_HISTORY",
  "ADVANCED_ANALYTICS",
  "XLSX",
  "ADVANCED_FILTERS",
] as const;
export type QuotaFeature = (typeof QUOTA_FEATURES)[number];
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];
export type BillingFeature = QuotaFeature | PremiumFeature;
const limit = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const tier = z.strictObject({
  ITEM_CREATE: limit,
  MEDIA_COUNT: limit,
  MEDIA_BYTES: limit,
  AI_MONTHLY: limit,
  IMPORT_PROFILES: limit,
  MARKET_DATA: z.boolean(),
  EXTENDED_HISTORY: z.boolean(),
  ADVANCED_ANALYTICS: z.boolean(),
  XLSX: z.boolean(),
  ADVANCED_FILTERS: z.boolean(),
});
export const BillingPolicySchema = z
  .strictObject({ FREE: tier, PREMIUM: tier })
  .superRefine((policy, ctx) => {
    for (const key of QUOTA_FEATURES) {
      const free = policy.FREE[key],
        premium = policy.PREMIUM[key];
      if (premium !== null && (free === null || premium < free))
        ctx.addIssue({
          code: "custom",
          path: ["PREMIUM", key],
          message: "Premium must preserve Free limits",
        });
    }
    for (const key of PREMIUM_FEATURES)
      if (policy.FREE[key] && !policy.PREMIUM[key])
        ctx.addIssue({
          code: "custom",
          path: ["PREMIUM", key],
          message: "Premium must preserve Free features",
        });
  });
export type BillingPolicy = z.infer<typeof BillingPolicySchema>;
export type Entitlements = {
  plan: "FREE" | "PREMIUM";
  limits: BillingPolicy["FREE"];
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};
export class BillingError extends Error {
  constructor(
    readonly code:
      | "PLAN_LIMIT_REACHED"
      | "PREMIUM_REQUIRED"
      | "BILLING_INVALID_REQUEST"
      | "BILLING_NOT_FOUND"
      | "BILLING_UNAVAILABLE"
      | "BILLING_CONFLICT"
      | "BILLING_EVENT_CONFLICT"
      | "BILLING_INVALID_SIGNATURE",
  ) {
    super(code);
    this.name = "BillingError";
  }
}
export type BillingUsage = { currentCount: number; amount?: number };
const usageSchema = z.strictObject({
  currentCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  amount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
});
/** Internal measured usage, never an HTTP caller's claimed count. Admission and write must share a lock/transaction. */
export function assertPlanFeature(
  entitlements: Entitlements,
  feature: BillingFeature,
  usage?: BillingUsage,
): Entitlements {
  if ((QUOTA_FEATURES as readonly string[]).includes(feature)) {
    const parsed = usageSchema.safeParse(usage);
    if (!parsed.success) throw new BillingError("BILLING_INVALID_REQUEST");
    const maximum = entitlements.limits[feature as QuotaFeature];
    if (
      maximum !== null &&
      (parsed.data.currentCount > maximum ||
        parsed.data.amount > maximum - parsed.data.currentCount)
    )
      throw new BillingError("PLAN_LIMIT_REACHED");
  } else if ((PREMIUM_FEATURES as readonly string[]).includes(feature)) {
    if (!entitlements.limits[feature as PremiumFeature]) throw new BillingError("PREMIUM_REQUIRED");
  } else throw new BillingError("BILLING_INVALID_REQUEST");
  return entitlements;
}

const billingOpaqueId = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_.:-]+$/u);
export const VerifiedBillingEventSchema = z.strictObject({
  eventId: billingOpaqueId,
  type: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z_.]+$/u),
  created: z.number().int().min(0).max(253402300799),
  liveMode: z.boolean(),
  customerId: billingOpaqueId.nullable(),
  subscriptionId: billingOpaqueId.nullable(),
  invoiceId: billingOpaqueId.nullable(),
  chargeId: billingOpaqueId.nullable(),
  paymentIntentId: billingOpaqueId.nullable(),
  objectId: billingOpaqueId.nullable().optional(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type VerifiedBillingEvent = z.infer<typeof VerifiedBillingEventSchema>;
export const BillingSubscriptionSnapshotSchema = z
  .strictObject({
    subscriptionId: billingOpaqueId,
    customerId: billingOpaqueId,
    status: z.enum([
      "ACTIVE",
      "TRIALING",
      "PAST_DUE",
      "CANCELED",
      "UNPAID",
      "INCOMPLETE",
      "INCOMPLETE_EXPIRED",
      "PAUSED",
    ]),
    currentPeriodStart: z.date(),
    currentPeriodEnd: z.date(),
    cancelAtPeriodEnd: z.boolean(),
    planEligible: z.boolean(),
    risk: z
      .strictObject({
        reason: z.enum(["REFUND", "DISPUTE", "FRAUD"]),
        through: z.date().nullable(),
      })
      .nullable(),
  })
  .refine(
    (s) =>
      s.currentPeriodEnd > s.currentPeriodStart &&
      (!s.risk || s.risk.reason === "REFUND" || s.risk.through === null),
  );
export type BillingSubscriptionSnapshot = z.infer<typeof BillingSubscriptionSnapshotSchema>;

export const BillingProviderContextSchema = z.strictObject({
  providerIds: z
    .array(z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/u))
    .min(1)
    .max(4),
});
export type BillingProviderContext = z.infer<typeof BillingProviderContextSchema>;
