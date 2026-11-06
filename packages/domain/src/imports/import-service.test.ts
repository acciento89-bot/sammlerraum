import { expect, it } from "vitest";
import { LEGACY_MONEY_PROFILE_ID } from "@sammlerraum/contracts/legacy-money";
import { previewImportRow } from "./import-service";
const existing = "00000000-0000-4000-8000-000000000001";
const context = { rowKey: "job:1", matchingItemIds: [] as string[], duplicateInSource: false };
const mapping = {
  schemaVersion: 1,
  locale: "de",
  columns: {
    title: 0,
    quantity: 1,
    identifier: { column: 2, type: "ISBN" },
    purchaseMoney: {
      amountColumn: 3,
      fixedCurrency: "EUR",
      sourceKind: "DECIMAL",
      profileId: LEGACY_MONEY_PROFILE_ID,
    },
    acquiredOn: { column: 4, format: "DD.MM.YYYY" },
  },
};
it("requires an explicit duplicate decision and never treats a matching item as an automatic overwrite", () => {
  const result = previewImportRow(
    ["Imported title", "2", "978-1 234", "1,25", "29.02.2024"],
    mapping,
    { ...context, matchingItemIds: [existing] },
  );
  expect(result).toMatchObject({
    status: "CONFLICT",
    matchingItemIds: [existing],
    allowedActions: ["SKIP", "MERGE", "CREATE_SEPARATE"],
    decision: null,
  });
});
it("maps exact values with the existing identifier and pinned money policies", () => {
  const result = previewImportRow(
    ["  Imported title  ", "2", "978-1 234", "1,25", "29.02.2024"],
    mapping,
    context,
  );
  expect(result).toMatchObject({
    status: "READY",
    allowedActions: ["CREATE", "SKIP"],
    values: {
      title: "Imported title",
      quantity: 2,
      identifier: { type: "ISBN", value: "978-1 234", normalizedValue: "9781234" },
      acquiredOn: "2024-02-29",
      purchaseMoney: {
        kind: "CANONICAL",
        receipt: { raw: { amountMinor: "125", currency: "EUR" }, exponent: 2 },
      },
    },
  });
});
it.each([
  { cells: ["Title", "1.5", "9781234", "1,25", "29.02.2024"], field: "quantity" },
  { cells: ["Title", "1", "9781234", "1.234,56", "29.02.2024"], field: "purchaseMoney" },
  { cells: ["Title", "1", "9781234", "1,25", "29.02.2023"], field: "acquiredOn" },
  { cells: ["", "1", "9781234", "1,25", "29.02.2024"], field: "title" },
])("keeps invalid $field as a row error without coercion or write actions", ({ cells, field }) => {
  const result = previewImportRow(cells, mapping, context);
  expect(result.status).toBe("INVALID");
  expect(result.allowedActions).toEqual(["SKIP"]);
  expect(result.errors).toContainEqual({ field, code: "INVALID_VALUE" });
  expect(result.decision).toBeNull();
});
it("does not invent a merge target when duplicates occur only inside the source", () => {
  const result = previewImportRow(["Title", "1", "9781234", "0", "01.01.2026"], mapping, {
    ...context,
    duplicateInSource: true,
  });
  expect(result).toMatchObject({
    status: "CONFLICT",
    matchingItemIds: [],
    allowedActions: ["SKIP", "CREATE_SEPARATE"],
    decision: null,
  });
});
it("canonicalizes UUID input aliases before persisting profile identity", async () => {
  const { ImportPreviewInputSchema } = await import("@sammlerraum/contracts/imports");
  const profile = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  expect(
    ImportPreviewInputSchema.parse({
      jobId: existing,
      expectedRevision: 1,
      mappingProfileId: profile.toUpperCase(),
      expectedProfileRevision: 1,
    }).mappingProfileId,
  ).toBe(profile);
});
it("keeps explicit raw historical imports UNKNOWN and requires declared canonical scale columns", () => {
  const legacy = {
    schemaVersion: 1,
    locale: "de",
    columns: {
      title: 0,
      purchaseMoney: {
        amountColumn: 1,
        currencyColumn: 2,
        sourceKind: "RAW",
        profileId: null,
        sourceContract: "LEGACY_UNKNOWN_RAW_V1",
      },
    },
  };
  const unknown = previewImportRow(["Title", "0", "ZZZ"], legacy, context);
  expect(unknown).toMatchObject({
    status: "READY",
    values: {
      purchaseMoney: { kind: "LEGACY_UNKNOWN", raw: { amountMinor: "0", currency: "ZZZ" } },
    },
  });
  expect(unknown.values?.purchaseMoney).not.toHaveProperty("receipt");
  const canonical = {
    schemaVersion: 1,
    locale: "de",
    columns: {
      title: 0,
      purchaseMoney: {
        amountColumn: 1,
        currencyColumn: 2,
        sourceKind: "RAW",
        profileId: LEGACY_MONEY_PROFILE_ID,
        sourceContract: "CANONICAL_MINOR_UNITS_V1",
        exponentColumn: 3,
        unitKeyColumn: 4,
      },
    },
  };
  expect(
    previewImportRow(["Title", "100", "AFN", "2", "iso4217-2026-09-17:AFN"], canonical, context),
  ).toMatchObject({
    status: "READY",
    values: {
      purchaseMoney: {
        kind: "CANONICAL",
        receipt: { raw: { amountMinor: "100", currency: "AFN" }, exponent: 2 },
      },
    },
  });
  expect(
    previewImportRow(["Title", "100", "AFN", "0", "iso4217-2026-09-17:AFN"], canonical, context)
      .status,
  ).toBe("INVALID");
});
it("treats an absent optional amount as no value while preserving explicit zero", () => {
  const none = previewImportRow(["Title", "1", "one", "", "01.01.2026"], mapping, context);
  expect(none.values?.purchaseMoney).toBeNull();
  const zero = previewImportRow(["Title", "1", "one", "0", "01.01.2026"], mapping, context);
  expect(zero.values?.purchaseMoney).toMatchObject({
    kind: "CANONICAL",
    receipt: { raw: { amountMinor: "0" } },
  });
});
