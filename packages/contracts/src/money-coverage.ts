import { z } from "zod";
import {
  LEGACY_MONEY_MAX_RAW,
  LegacyMoneyExponentSchema,
  HistoricalCurrencySchema,
} from "./legacy-money";
const maximumItems = BigInt(Number.MAX_SAFE_INTEGER),
  maximumQuantity = 2147483647n;
const maximumUnits = maximumItems * maximumQuantity;
const maximumTotal = maximumUnits * BigInt(LEGACY_MONEY_MAX_RAW);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const fields = {
  selectedItems: count,
  selectedPaths: count,
  missingPaths: count,
  presentPaths: count,
  eligiblePaths: count,
  unknownPaths: count,
  ineligiblePaths: count,
};
const countNames = Object.keys(fields) as (keyof typeof fields)[];
function validCounts(value: Record<keyof typeof fields, number>): boolean {
  return (
    countNames.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0) &&
    BigInt(value.selectedPaths) === BigInt(value.missingPaths) + BigInt(value.presentPaths) &&
    BigInt(value.presentPaths) ===
      BigInt(value.eligiblePaths) + BigInt(value.unknownPaths) + BigInt(value.ineligiblePaths)
  );
}
export const MoneyCoverageSchema = z
  .object(fields)
  .strict()
  .refine(validCounts, "Contradictory monetary coverage");
function integer(maximum: bigint) {
  const max = maximum.toString();
  return z
    .string()
    .max(max.length)
    .regex(/^(0|[1-9][0-9]*)$/u)
    .refine(
      (value) =>
        /^(0|[1-9][0-9]*)$/u.test(value) && value.length <= max.length && BigInt(value) <= maximum,
    );
}
const units = integer(maximumUnits);
export const PurchaseMoneyCoverageSchema = z
  .object({ ...fields, selectedUnits: units, missingUnits: units, presentUnits: units })
  .strict()
  .refine((value) => {
    if (!validCounts(value) || value.selectedPaths !== value.selectedItems) return false;
    if (
      ![value.selectedUnits, value.missingUnits, value.presentUnits].every(
        (v) => /^(0|[1-9][0-9]*)$/u.test(v) && v.length <= maximumUnits.toString().length,
      )
    )
      return false;
    const selected = BigInt(value.selectedUnits),
      missing = BigInt(value.missingUnits),
      present = BigInt(value.presentUnits);
    return (
      selected === missing + present &&
      selected >= BigInt(value.selectedItems) &&
      selected <= BigInt(value.selectedItems) * maximumQuantity &&
      missing >= BigInt(value.missingPaths) &&
      missing <= BigInt(value.missingPaths) * maximumQuantity &&
      present >= BigInt(value.presentPaths) &&
      present <= BigInt(value.presentPaths) * maximumQuantity
    );
  }, "Contradictory quantity-weighted purchase coverage");
export type MoneyCoverage = z.infer<typeof MoneyCoverageSchema>;
export type PurchaseMoneyCoverage = z.infer<typeof PurchaseMoneyCoverageSchema>;
export const PurchaseCostGroupSchema = z
  .object({
    currency: HistoricalCurrencySchema,
    unitKey: z.string().min(1).max(128),
    exponent: LegacyMoneyExponentSchema,
    totalMinor: integer(maximumTotal),
  })
  .strict();
export type PurchaseCostGroup = z.infer<typeof PurchaseCostGroupSchema>;
const groups = z.array(PurchaseCostGroupSchema).min(1).max(1650);
const common = { coverage: PurchaseMoneyCoverageSchema };
export const PurchaseCostResultSchema = z
  .discriminatedUnion("state", [
    z
      .object({
        ...common,
        state: z.literal("UNAVAILABLE"),
        selectionCoverage: z.null(),
        groups: z.null(),
      })
      .strict(),
    z
      .object({
        ...common,
        state: z.literal("EMPTY"),
        selectionCoverage: PurchaseMoneyCoverageSchema,
        groups: z.array(PurchaseCostGroupSchema).max(0),
      })
      .strict(),
    z
      .object({
        ...common,
        state: z.literal("NO_PRICES"),
        selectionCoverage: PurchaseMoneyCoverageSchema,
        groups: z.null(),
      })
      .strict(),
    z
      .object({
        ...common,
        state: z.literal("PARTIAL"),
        selectionCoverage: PurchaseMoneyCoverageSchema,
        groups,
      })
      .strict(),
    z
      .object({
        ...common,
        state: z.literal("COMPLETE"),
        selectionCoverage: PurchaseMoneyCoverageSchema,
        groups,
      })
      .strict(),
  ])
  .refine((value) => {
    // Nested Zod refinements may still run for dirty input. Validate before BigInt.
    if (!PurchaseMoneyCoverageSchema.safeParse(value.coverage).success) return false;
    if (
      value.state !== "UNAVAILABLE" &&
      !PurchaseMoneyCoverageSchema.safeParse(value.selectionCoverage).success
    )
      return false;
    if (
      value.groups &&
      value.groups.some((group) => !PurchaseCostGroupSchema.safeParse(group).success)
    )
      return false;
    const outer = value.coverage;
    if (value.state === "UNAVAILABLE") return outer.unknownPaths > 0 || outer.ineligiblePaths > 0;
    const selected = value.selectionCoverage;
    if (
      outer.unknownPaths ||
      outer.ineligiblePaths ||
      selected.unknownPaths ||
      selected.ineligiblePaths
    )
      return false;
    if (countNames.some((key) => selected[key] > outer[key])) return false;
    // A proper subset must leave at least one unit per excluded item, and
    // at most intmax units per excluded item, separately for each price bucket.
    const quantityBuckets = [
      ["selectedItems", "selectedUnits"],
      ["presentPaths", "presentUnits"],
      ["missingPaths", "missingUnits"],
    ] as const;
    for (const [items, units] of quantityBuckets) {
      const excludedItems = BigInt(outer[items]) - BigInt(selected[items]);
      const excludedUnits = BigInt(outer[units]) - BigInt(selected[units]);
      if (excludedUnits < excludedItems || excludedUnits > excludedItems * maximumQuantity)
        return false;
    }
    if (value.state === "EMPTY") return selected.selectedItems === 0;
    if (value.state === "NO_PRICES")
      return selected.selectedItems > 0 && selected.presentPaths === 0;
    if (
      !selected.selectedItems ||
      !selected.presentPaths ||
      value.groups.length > selected.eligiblePaths
    )
      return false;
    const keys = value.groups.map(
      (group) => `${group.currency}:${group.unitKey}:${group.exponent}`,
    );
    if (new Set(keys).size !== keys.length) return false;
    const combinedRawTotal = value.groups.reduce(
      (total, group) => total + BigInt(group.totalMinor),
      0n,
    );
    // This is a raw-integer integrity bound, not a cross-currency/scale total.
    if (combinedRawTotal > BigInt(LEGACY_MONEY_MAX_RAW) * BigInt(selected.presentUnits))
      return false;
    return value.state === "PARTIAL" ? selected.missingPaths > 0 : selected.missingPaths === 0;
  }, "Purchase cost state does not match its complete coverage");
export type PurchaseCostResult = z.infer<typeof PurchaseCostResultSchema>;
