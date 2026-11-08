import { describe, expect, it } from "vitest";
import {
  ManualValuationInputSchema,
  ManualValuationSchema,
  ValuationQuerySchema,
  AmountMinorSchema,
  MarketObservationSchema,
} from "./valuations";

describe("valuation wire contracts", () => {
  it("accepts exact decimal-string money including zero and PostgreSQL bigint maximum", () => {
    for (const amountMinor of ["0", "9007199254740993", "9223372036854775807"])
      expect(ManualValuationInputSchema.parse({ amountMinor, currency: "EUR" })).toMatchObject({
        amountMinor,
      });
  });
  it("rejects lossy numbers, noncanonical decimals, overflow and authored private fields", () => {
    for (const amountMinor of [
      0,
      9007199254740992,
      "-1",
      "+1",
      "01",
      "1.0",
      "1e3",
      " 1",
      "9223372036854775808",
    ])
      expect(AmountMinorSchema.safeParse(amountMinor).success).toBe(false);
    expect(
      ManualValuationInputSchema.safeParse({
        amountMinor: "1",
        currency: "EUR",
        ownerId: "foreign",
      }).success,
    ).toBe(false);
  });
  it("counts trimmed Unicode codepoints and rejects NUL and lone surrogates without normalizing text", () => {
    expect(
      ManualValuationInputSchema.parse({
        amountMinor: "1",
        currency: "EUR",
        note: `  ${"😀".repeat(2000)}  `,
      }),
    ).toMatchObject({ note: "😀".repeat(2000) });
    expect(
      ManualValuationInputSchema.parse({ amountMinor: "1", currency: "EUR", note: " e\u0301 " }),
    ).toMatchObject({ note: "e\u0301" });
    for (const note of ["😀".repeat(2001), "\0", "\ud800", "\udfff"])
      expect(
        ManualValuationInputSchema.safeParse({ amountMinor: "1", currency: "EUR", note }).success,
      ).toBe(false);
  });
  it("keeps historical scale and currency and excludes owner/actor identifiers from DTOs", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      type: "MANUAL",
      basis: "PER_UNIT",
      amountMinor: "9007199254740993",
      currency: "XXX",
      minorUnitExponent: 4,
      note: null,
      observedAt: "0001-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    expect(ManualValuationSchema.parse(row)).toEqual(row);
    expect(ManualValuationSchema.safeParse({ ...row, ownerId: "secret" }).success).toBe(false);
    expect(
      ManualValuationSchema.safeParse({ ...row, observedAt: "2025-02-30T00:00:00.000Z" }).success,
    ).toBe(false);
  });
  it("discriminates bounded summary and source-history queries strictly", () => {
    expect(ValuationQuerySchema.parse({})).toMatchObject({
      view: "summary",
      scope: "CURRENT_MAPPING",
      manualLimit: 20,
      groupLimit: 4,
    });
    for (const q of [
      { manualLimit: "1.0" },
      { manualLimit: "+1" },
      { groupLimit: "9" },
      { limit: "1" },
      { view: "source-history" },
      { view: "summary", source: "x" },
    ])
      expect(ValuationQuerySchema.safeParse(q).success).toBe(false);
  });
  it("rejects malformed/reversed range money without throwing outside validation", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      source: {
        providerId: "fixture",
        identifierNamespace: "fixture",
        identifierType: "product",
        externalId: "1",
        kind: "PRICE_RANGE",
        currency: "EUR",
      },
      sourceMetric: "median",
      qualifiers: { flag: false },
      minorUnitExponent: 2,
      price: { type: "RANGE", lowMinor: "0", highMinor: "9223372036854775807" },
      observedAt: "2025-01-01T00:00:00.000Z",
      observedBasis: "SOURCE",
      observedPrecision: "DAY",
      fetchedAt: "2025-01-02T00:00:00.000Z",
      recordedAt: "2025-01-03T00:00:00.000Z",
      sourceUrl: null,
      sourceReference: null,
      confidence: { sampleSize: 0 },
      catalogMatch: {
        observedRevision: 1,
        currentRevision: 2,
        observedIdentifierId: "00000000-0000-0000-0000-000000000002",
        currentIdentifierId: null,
        revisionChanged: true,
        identifierRecordChanged: true,
        identifierActive: false,
        variantActive: true,
      },
    };
    expect(MarketObservationSchema.parse(row)).toMatchObject({
      confidence: { sampleSize: 0 },
      qualifiers: { flag: false },
    });
    for (const price of [
      { type: "RANGE", lowMinor: "bogus", highMinor: "1" },
      { type: "RANGE", lowMinor: "2", highMinor: "1" },
      { type: "POINT", amountMinor: "1" },
    ])
      expect(MarketObservationSchema.safeParse({ ...row, price }).success).toBe(false);
    expect(
      MarketObservationSchema.safeParse({ ...row, observedAt: "2025-01-01T12:00:00.000Z" }).success,
    ).toBe(false);
    expect(
      MarketObservationSchema.safeParse({
        ...row,
        observedBasis: "FETCH",
        observedPrecision: "MILLISECOND",
      }).success,
    ).toBe(false);
  });
});
