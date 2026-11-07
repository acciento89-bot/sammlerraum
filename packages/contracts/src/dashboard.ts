import { MarketSelectorSchema } from "./search";
import { ValuationInstantSchema } from "./valuations";
import { PurchaseCostResultSchema } from "./money-coverage";
import { z } from "zod";
import {
  parseItemSearchQuery,
  searchFail,
  SearchLifecycleSchema,
  ItemSummarySchema,
} from "./item-search";
import { CanonicalTimestampSchema, TradeStatusSchema } from "./items";

const marketInteger = (digits: number) =>
  z
    .string()
    .regex(/^(?:0|[1-9][0-9]*)$/u)
    .max(digits);
export const MarketReferenceTotalSchema = z
  .object({
    selector: MarketSelectorSchema,
    semantics: z.literal("ADDITIVE_PER_UNIT_REFERENCE_VALUE"),
    basis: z.enum(["ONE_PER_ITEM", "CURRENT_QUANTITY"]),
    coverage: z.enum(["COMPLETE", "PARTIAL", "EMPTY"]),
    candidateItemCount: marketInteger(19),
    contributingItemCount: marketInteger(19),
    missingItemCount: marketInteger(19),
    contributedQuantity: marketInteger(78),
    observedAtFrom: ValuationInstantSchema.nullable(),
    observedAtTo: ValuationInstantSchema.nullable(),
    total: z
      .union([
        z.object({ type: z.literal("POINT"), amountMinor: marketInteger(78) }).strict(),
        z
          .object({
            type: z.literal("RANGE"),
            lowMinor: marketInteger(78),
            highMinor: marketInteger(78),
          })
          .strict(),
      ])
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Invalid market reference total" });
    if (
      ![
        v.candidateItemCount,
        v.contributingItemCount,
        v.missingItemCount,
        v.contributedQuantity,
      ].every((n) => /^(?:0|[1-9][0-9]*)$/u.test(n))
    ) {
      invalid();
      return;
    }
    const candidates = BigInt(v.candidateItemCount),
      contributing = BigInt(v.contributingItemCount),
      missing = BigInt(v.missingItemCount),
      quantity = BigInt(v.contributedQuantity);
    if (contributing + missing !== candidates || quantity < contributing) invalid();
    if (contributing === 0n) {
      if (
        v.coverage !== "EMPTY" ||
        v.total !== null ||
        v.observedAtFrom !== null ||
        v.observedAtTo !== null ||
        quantity !== 0n
      )
        invalid();
    } else {
      if (
        v.coverage !== (missing === 0n ? "COMPLETE" : "PARTIAL") ||
        !v.total ||
        !v.observedAtFrom ||
        !v.observedAtTo ||
        v.observedAtFrom > v.observedAtTo
      )
        invalid();
      if (v.total && (v.selector.kind === "PRICE_RANGE") !== (v.total.type === "RANGE")) invalid();
      if (
        v.total?.type === "RANGE" &&
        /^(?:0|[1-9][0-9]*)$/u.test(v.total.lowMinor) &&
        /^(?:0|[1-9][0-9]*)$/u.test(v.total.highMinor) &&
        BigInt(v.total.lowMinor) > BigInt(v.total.highMinor)
      )
        invalid();
    }
  });
export type MarketReferenceTotal = z.infer<typeof MarketReferenceTotalSchema>;

export const DASHBOARD_MAX_RESPONSE_BYTES = 1048576;
const count = z.number().int().nonnegative().safe();
const decimal = (signed = false) =>
  z
    .string()
    .regex(signed ? /^(?:0|-?[1-9][0-9]*)$/u : /^(?:0|[1-9][0-9]*)$/u)
    .superRefine((v, ctx) => {
      if (/^(?:0|-?[1-9][0-9]*)$/u.test(v) && v.replace(/^-/u, "").length > 78)
        ctx.addIssue({
          code: "custom",
          message: "Dashboard capacity exceeded",
          params: { dashboardCapacity: true },
        });
    });
const units = decimal();
export const DashboardCountSchema = z.object({ itemCount: count, unitCount: units }).strict();
const pair = DashboardCountSchema;
const timestamp = CanonicalTimestampSchema;
const denomination = {
  source: z.literal("MANUAL"),
  basis: z.literal("PER_UNIT"),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  minorUnitExponent: z.number().int().min(0).max(9),
};
const listMeta = { limit: z.literal(10), eligibleCount: count, hasMore: z.boolean() };
const topItem = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
    collectionId: z.string().uuid(),
    quantity: z.number().int().positive().safe(),
    valuationId: z.string().uuid(),
    perUnitMinor: units,
    weightedMinor: units,
    observedAt: timestamp,
  })
  .strict();
const manualGroup = z
  .object({
    ...denomination,
    totalMinor: units,
    contributors: pair,
    otherDenomination: pair,
    observedAtFrom: timestamp,
    observedAtTo: timestamp,
    topItems: z
      .object({
        ...listMeta,
        quantityBasis: z.literal("CURRENT_QUANTITY"),
        items: z.array(topItem).max(10),
      })
      .strict(),
  })
  .strict();
const changeGroup = z
  .object({
    ...denomination,
    deltaMinor: decimal(true),
    contributors: pair,
    previousObservedAtFrom: timestamp,
    previousObservedAtTo: timestamp,
    latestObservedAtFrom: timestamp,
    latestObservedAtTo: timestamp,
  })
  .strict();
const missing = z
  .object({
    category: pair,
    condition: pair,
    acquisitionDate: pair,
    purchaseAmount: pair,
    ownEstimate: pair,
    grading: pair,
    catalogLink: pair,
    image: pair,
    document: pair,
  })
  .strict();
export const DashboardSummarySchema = z
  .object({
    selection: pair.extend({ matchedCollectionCount: count }).strict(),
    collections: z.object({ ownedLiveCount: count }).strict(),
    trade: z.array(pair.extend({ tradeStatus: TradeStatusSchema }).strict()).length(4),
    tradeReady: pair,
    missing,
  })
  .strict();
export const DashboardManualSchema = z
  .object({
    manualValues: z
      .object({
        state: z.enum(["EMPTY", "NO_ESTIMATES", "PARTIAL", "COMPLETE"]),
        quantityBasis: z.literal("CURRENT_QUANTITY"),
        contributors: pair,
        missing: pair,
        groups: z.array(manualGroup).max(256).nullable(),
      })
      .strict(),
    manualChange: z
      .object({
        state: z.enum(["EMPTY", "INSUFFICIENT_DATA", "PARTIAL", "COMPLETE"]),
        mode: z.literal("LATEST_VS_PREVIOUS_OBSERVATION"),
        quantityBasis: z.literal("CURRENT_QUANTITY"),
        comparable: pair,
        excluded: z
          .object({
            NO_ESTIMATE: pair,
            INSUFFICIENT_HISTORY: pair,
            NONCOMPARABLE_DENOMINATION: pair,
          })
          .strict(),
        groups: z.array(changeGroup).max(256).nullable(),
      })
      .strict(),
  })
  .strict();
export const DashboardDistributionsSchema = z
  .object({
    condition: z
      .object({
        missing: pair,
        groups: z
          .array(
            pair
              .extend({
                categoryTemplateId: z.string().uuid(),
                conditionOptionId: z.string().uuid(),
                schemeId: z.string().uuid(),
                labelKey: z.string().min(1).max(128),
                labelDe: z.string().min(1).max(200),
                labelEn: z.string().min(1).max(200),
                optionActive: z.boolean(),
                schemeActive: z.boolean(),
              })
              .strict(),
          )
          .max(128),
      })
      .strict(),
    grading: z
      .object({
        gradedItemCount: count,
        gradingRecordCount: count,
        groups: z
          .array(
            z
              .object({
                providerKey: z.string().min(1).max(120),
                grade: z.string().min(1).max(120),
                recordCount: count,
                itemCount: count,
              })
              .strict(),
          )
          .max(128),
      })
      .strict(),
  })
  .strict();
export const DashboardRankingsSchema = z
  .object({
    topCollections: z
      .object({
        ...listMeta,
        basis: z.literal("SELECTED_PHYSICAL_UNITS"),
        items: z
          .array(pair.extend({ id: z.string().uuid(), name: z.string().min(1).max(120) }).strict())
          .max(10),
      })
      .strict(),
    recentAdditions: z
      .object({
        ...listMeta,
        basis: z.literal("INVENTORY_CREATED_AT"),
        items: z.array(ItemSummarySchema).max(10),
      })
      .strict(),
  })
  .strict();
export const DashboardDataSchema = DashboardSummarySchema.extend({
  version: z.literal(1),
  scope: z.literal("OWNED"),
  lifecycle: SearchLifecycleSchema,
  readAt: timestamp,
  ...DashboardManualSchema.shape,
  ...DashboardDistributionsSchema.shape,
  ...DashboardRankingsSchema.shape,
  purchaseTotals: z.union([
    z
      .object({
        state: z.literal("UNAVAILABLE"),
        reason: z.literal("LEGACY_MONEY_INTERPRETATION_UNAVAILABLE"),
        groups: z.null(),
      })
      .strict(),
    PurchaseCostResultSchema,
  ]),
  marketValues: z.union([
    z
      .object({
        state: z.literal("UNAVAILABLE"),
        reason: z.literal("MARKET_AGGREGATION_UNAVAILABLE"),
        groups: z.null(),
      })
      .strict(),
    z
      .object({
        state: z.literal("AVAILABLE"),
        selectionBasis: z.literal("ALL_LIFECYCLE_OWNED"),
        groups: z.array(MarketReferenceTotalSchema).min(1).max(50),
      })
      .strict(),
  ]),
  duplicates: z.union([
    z
      .object({
        state: z.literal("UNAVAILABLE"),
        reason: z.literal("DUPLICATE_NOT_IMPLEMENTED"),
        count: z.null(),
      })
      .strict(),
    z
      .object({
        state: z.literal("AVAILABLE"),
        selectionBasis: z.literal("ALL_LIVE_OWNED_PAIRS"),
        count,
      })
      .strict(),
  ]),
  wishlist: z.union([
    z
      .object({
        state: z.literal("UNAVAILABLE"),
        reason: z.literal("WISHLIST_NOT_IMPLEMENTED"),
        count: z.null(),
      })
      .strict(),
    z
      .object({
        state: z.literal("AVAILABLE"),
        selectionBasis: z.literal("ALL_OWNED_WISHES"),
        count,
        fulfilledCount: count,
      })
      .strict(),
  ]),
  milestoneCandidates: z
    .array(
      z
        .object({
          kind: z.enum(["ITEM_COUNT", "WISHLIST_COMPLETED"]),
          threshold: count,
          achieved: z.boolean(),
        })
        .strict(),
    )
    .max(8)
    .default([]),
}).strict();
export type DashboardData = z.infer<typeof DashboardDataSchema>;
export function parseDashboardQuery(input: unknown) {
  const keys = z
    .object({
      text: z.unknown().optional(),
      filter: z.unknown().optional(),
      lifecycle: z.unknown().optional(),
    })
    .strict()
    .safeParse(input);
  if (!keys.success) return searchFail("SEARCH_INVALID");
  const { text, filter, lifecycle } = parseItemSearchQuery(keys.data);
  return { text, filter, lifecycle };
}
