import { z } from "zod";
import { DashboardCountSchema } from "./dashboard";
import { PurchaseCostResultSchema } from "./money-coverage";
import { SearchLifecycleSchema } from "./item-search";
import { CanonicalTimestampSchema, TradeStatusSchema } from "./items";
const decimal = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/u);
export const ScopedManualSummarySchema = z
  .object({
    state: z.enum(["EMPTY", "NO_ESTIMATES", "PARTIAL", "COMPLETE"]),
    quantityBasis: z.literal("CURRENT_QUANTITY"),
    contributors: DashboardCountSchema,
    missing: DashboardCountSchema,
    groups: z
      .array(
        z
          .object({
            currency: z.string().regex(/^[A-Z]{3}$/u),
            minorUnitExponent: z.number().int().min(0).max(9),
            totalMinor: decimal,
            contributors: DashboardCountSchema,
          })
          .strict(),
      )
      .max(256),
  })
  .strict();
const disabledPurchase = z
  .object({
    state: z.literal("UNAVAILABLE"),
    reason: z.literal("LEGACY_MONEY_INTERPRETATION_UNAVAILABLE"),
    groups: z.null(),
  })
  .strict();
export const ScopedDashboardSchema = z
  .object({
    version: z.literal(1),
    scope: z.enum(["OWNER_COLLECTION", "MEMBER_COLLECTION", "SHARE"]),
    lifecycle: SearchLifecycleSchema,
    readAt: CanonicalTimestampSchema,
    selection: DashboardCountSchema,
    values: z.discriminatedUnion("state", [
      z.object({ state: z.literal("UNAVAILABLE"), purchase: z.null(), manual: z.null() }).strict(),
      z
        .object({
          state: z.literal("AVAILABLE"),
          purchase: z.union([PurchaseCostResultSchema, disabledPurchase]),
          manual: ScopedManualSummarySchema,
        })
        .strict(),
    ]),
    trade: z
      .array(z.object({ tradeStatus: TradeStatusSchema, ...DashboardCountSchema.shape }).strict())
      .max(4)
      .nullable(),
    privatePairs: z.null(),
    wishlist: z.null(),
    market: z.null(),
  })
  .strict();
export type ScopedDashboard = z.infer<typeof ScopedDashboardSchema>;
