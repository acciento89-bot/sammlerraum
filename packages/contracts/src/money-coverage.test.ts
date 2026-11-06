import { expect, it } from "vitest";
import { PurchaseMoneyCoverageSchema, PurchaseCostResultSchema } from "./money-coverage";
const coverage = {
  selectedItems: 3,
  selectedPaths: 3,
  missingPaths: 1,
  presentPaths: 2,
  eligiblePaths: 2,
  unknownPaths: 0,
  ineligiblePaths: 0,
  selectedUnits: "7",
  missingUnits: "3",
  presentUnits: "4",
};
const empty = {
  selectedItems: 0,
  selectedPaths: 0,
  missingPaths: 0,
  presentPaths: 0,
  eligiblePaths: 0,
  unknownPaths: 0,
  ineligiblePaths: 0,
  selectedUnits: "0",
  missingUnits: "0",
  presentUnits: "0",
};
const group = { currency: "AFN", unitKey: "iso4217-2026-09-17:AFN", exponent: 0, totalMinor: "0" };
it("preserves exact separately weighted unit coverage and counts", () => {
  expect(PurchaseMoneyCoverageSchema.parse(coverage)).toEqual(coverage);
});
it.each([
  { missingPaths: 0 },
  { unknownPaths: 1 },
  { selectedPaths: 4 },
  { presentUnits: "5" },
  { selectedUnits: "07" },
  { selectedItems: Number.MAX_SAFE_INTEGER + 1 },
  { missingPaths: -1 },
  { selectedUnits: "99999999999999999999999999999999999999999" },
  { reason: "private evidence must not be added" },
])("refuses contradictory or unbounded coverage %#", (change) => {
  expect(PurchaseMoneyCoverageSchema.safeParse({ ...coverage, ...change }).success).toBe(false);
});
it("never represents a known zero price as missing or an incomplete subtotal as COMPLETE", () => {
  expect(
    PurchaseCostResultSchema.parse({
      state: "PARTIAL",
      coverage,
      selectionCoverage: coverage,
      groups: [group],
    }),
  ).toMatchObject({ groups: [{ totalMinor: "0" }] });
  expect(
    PurchaseCostResultSchema.safeParse({
      state: "COMPLETE",
      coverage,
      selectionCoverage: coverage,
      groups: [group],
    }).success,
  ).toBe(false);
});
it("distinguishes no inventory, no prices, and unavailable interpretation", () => {
  expect(
    PurchaseCostResultSchema.parse({
      state: "EMPTY",
      coverage: empty,
      selectionCoverage: empty,
      groups: [],
    }).state,
  ).toBe("EMPTY");
  const missing = {
    ...empty,
    selectedItems: 1,
    selectedPaths: 1,
    missingPaths: 1,
    selectedUnits: "3",
    missingUnits: "3",
  };
  expect(
    PurchaseCostResultSchema.parse({
      state: "NO_PRICES",
      coverage: missing,
      selectionCoverage: missing,
      groups: null,
    }).state,
  ).toBe("NO_PRICES");
  const unknown = { ...coverage, eligiblePaths: 1, unknownPaths: 1 };
  expect(
    PurchaseCostResultSchema.parse({
      state: "UNAVAILABLE",
      coverage: unknown,
      selectionCoverage: null,
      groups: null,
    }).state,
  ).toBe("UNAVAILABLE");
  expect(
    PurchaseCostResultSchema.safeParse({
      state: "UNAVAILABLE",
      coverage: unknown,
      selectionCoverage: coverage,
      groups: [group],
    }).success,
  ).toBe(false);
});

it.each([
  { coverage: { ...coverage, selectedUnits: "not-an-integer" } },
  { selectionCoverage: { ...coverage, presentUnits: "not-an-integer" } },
  { groups: [{ ...group, totalMinor: "not-an-integer" }] },
  { groups: [{ ...group, totalMinor: "9".repeat(1000) }] },
])(
  "closed result decoding rejects invalid nested numeric strings without throwing %#",
  (change) => {
    let accepted = true;
    expect(() => {
      accepted = PurchaseCostResultSchema.safeParse({
        state: "PARTIAL",
        coverage,
        selectionCoverage: coverage,
        groups: [group],
        ...change,
      }).success;
    }).not.toThrow();
    expect(accepted).toBe(false);
  },
);

it("rejects subtotals that reuse all quantities while excluding an owned item", () => {
  const outer = {
    ...empty,
    selectedItems: 2,
    selectedPaths: 2,
    presentPaths: 2,
    eligiblePaths: 2,
    selectedUnits: "4",
    presentUnits: "4",
  };
  const impossibleSubset = {
    ...outer,
    selectedItems: 1,
    selectedPaths: 1,
    presentPaths: 1,
    eligiblePaths: 1,
  };
  expect(PurchaseMoneyCoverageSchema.safeParse(impossibleSubset).success).toBe(true);
  expect(
    PurchaseCostResultSchema.safeParse({
      state: "COMPLETE",
      coverage: outer,
      selectionCoverage: impossibleSubset,
      groups: [group],
    }).success,
  ).toBe(false);
});
it("rejects separately plausible groups whose combined raw totals exceed all priced quantities", () => {
  const outer = {
    ...empty,
    selectedItems: 2,
    selectedPaths: 2,
    presentPaths: 2,
    eligiblePaths: 2,
    selectedUnits: "2",
    presentUnits: "2",
  };
  const totalMinor = (9007199254740991n * 2n).toString();
  expect(
    PurchaseCostResultSchema.safeParse({
      state: "COMPLETE",
      coverage: outer,
      selectionCoverage: outer,
      groups: [
        { ...group, totalMinor },
        { ...group, exponent: 2, totalMinor },
      ],
    }).success,
  ).toBe(false);
});
