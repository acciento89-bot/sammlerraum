import { z } from "zod";
import { BillingTierSchema } from "./billing";
const count = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/u)
  .max(78);
export const BillingOfferSchema = z.strictObject({
  cadence: z.enum(["MONTHLY", "YEARLY"]),
  amountMinor: z
    .string()
    .regex(/^(?:0|[1-9][0-9]*)$/u)
    .max(16),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  minorUnitExponent: z.number().int().min(0).max(3),
  taxBehavior: z.enum(["inclusive", "exclusive", "unspecified"]),
});
export const BillingCatalogSchema = z
  .array(BillingOfferSchema)
  .length(2)
  .refine((offers) => new Set(offers.map((o) => o.cadence)).size === 2);
export type BillingOffer = z.infer<typeof BillingOfferSchema>;
export const BillingOverviewSchema = z.strictObject({
  plan: z.enum(["FREE", "PREMIUM"]),
  limits: BillingTierSchema,
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  hasCustomer: z.boolean(),
  readAt: z.iso.datetime(),
  nextMonthlyResetAt: z.iso.datetime(),
  usage: z.strictObject({
    ITEM_CREATE: count,
    MEDIA_COUNT: count,
    MEDIA_BYTES: count,
    AI_MONTHLY: count,
    IMPORT_PROFILES: count,
  }),
});
export type BillingOverview = z.infer<typeof BillingOverviewSchema>;
