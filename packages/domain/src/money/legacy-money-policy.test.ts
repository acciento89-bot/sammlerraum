import { describe, expect, it } from "vitest";
import { parseLegacyMoneyAuthoring, formatStoredMoney } from "./legacy-money-policy";
const profileId = "legacy-money-iso-2026-09-17-v1";
const decimal = (currency: string, value: string) => ({
  kind: "DECIMAL",
  profileId,
  currency,
  decimal: value,
});
describe("explicit prospective legacy money policy", () => {
  it("prospective_afn_is_explicit_iso", () => {
    expect(parseLegacyMoneyAuthoring(decimal("AFN", "1"))).toMatchObject({
      schemaVersion: 1,
      profileId,
      raw: { amountMinor: "100", currency: "AFN" },
      exponent: 2,
      unitKey: "iso4217-2026-09-17:AFN",
      normalizedDecimal: "1.00",
    });
    expect(formatStoredMoney({ amountMinor: "1", currency: "AFN" }, 0)).toBe("1");
  });
  it("legacy_comma_dot_without_grouping", () => {
    for (const value of ["1,23", "1.23", " 001.23 "])
      expect(parseLegacyMoneyAuthoring(decimal("EUR", value))).toMatchObject({
        raw: { amountMinor: "123", currency: "EUR" },
        normalizedDecimal: "1.23",
      });
    for (const value of ["1,234.00", "1e2", "-1", "1.234", "1.", ".5", "1 000"])
      expect(() => parseLegacyMoneyAuthoring(decimal("EUR", value))).toThrow(
        /LEGACY_MONEY_INVALID/,
      );
  });
  it("raw_profile_mismatch_rejects", () => {
    const raw = {
      kind: "RAW",
      profileId,
      currency: "AFN",
      amountMinor: "123",
      exponent: 2,
      unitKey: "iso4217-2026-09-17:AFN",
    };
    expect(parseLegacyMoneyAuthoring(raw)).toMatchObject({
      raw: { amountMinor: "123", currency: "AFN" },
      normalizedDecimal: "1.23",
    });
    for (const extra of [
      { exponent: 0 },
      { unitKey: "iso4217-2026-09-17:EUR" },
      { profileId: "today" },
      { amountMinor: "01" },
      { receipt: {} },
    ])
      expect(() => parseLegacyMoneyAuthoring({ ...raw, ...extra })).toThrow(/LEGACY_MONEY_INVALID/);
  });
  it("max_safe_boundary_exact", () => {
    expect(parseLegacyMoneyAuthoring(decimal("EUR", "90071992547409.91"))).toMatchObject({
      raw: { amountMinor: "9007199254740991", currency: "EUR" },
      normalizedDecimal: "90071992547409.91",
    });
    expect(() => parseLegacyMoneyAuthoring(decimal("EUR", "90071992547409.92"))).toThrow(
      /LEGACY_MONEY_INVALID/,
    );
  });
});

import { validateLegacyUnit } from "./legacy-money-policy";
import {
  CURRENCY_AUTHORITY_SHA256,
  CURRENCY_AUTHORITY_VERSION,
  valuationCurrencyCodes,
} from "./currencies";
import { LEGACY_MONEY_AUTHORITY_HASH, LegacyMoneyError } from "@sammlerraum/contracts/legacy-money";
const assertion = "b42572c3-dbf8-4c64-9203-593c5f181a41";
describe("stored-scale and declared-unit policy", () => {
  it("rejects non-UUID assertion identities even for unsupported declarations", () => {
    expect(() =>
      validateLegacyUnit(
        "ZZZ",
        { kind: "UNSUPPORTED", label: "Historic unit" },
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      ),
    ).toThrow(/LEGACY_MONEY_INVALID/);
  });
  it("reuses the existing frozen authority without changing its165 values", () => {
    expect(CURRENCY_AUTHORITY_VERSION).toBe("iso4217-2026-09-17");
    expect(CURRENCY_AUTHORITY_SHA256).toBe(LEGACY_MONEY_AUTHORITY_HASH);
    expect(valuationCurrencyCodes).toHaveLength(165);
    expect(Object.isFrozen(valuationCurrencyCodes)).toBe(true);
  });
  it.each([
    ["JPY", "1", "1", "1", 0],
    ["KWD", "1.234", "1234", "1.234", 3],
    ["CLF", "1,2345", "12345", "1.2345", 4],
    ["UYW", "0.0001", "1", "0.0001", 4],
    ["EUR", "000.0", "0", "0.00", 2],
  ])(
    "authors the pinned explicit %s scale",
    (currency, value, raw, normalizedDecimal, exponent) => {
      expect(parseLegacyMoneyAuthoring(decimal(String(currency), String(value)))).toMatchObject({
        raw: { amountMinor: raw, currency },
        normalizedDecimal,
        exponent,
      });
    },
  );
  it("formats supplied historical scales without a current-list or unit inference", () => {
    expect(formatStoredMoney({ amountMinor: "1", currency: "ZZZ" }, 9)).toBe("0.000000001");
    expect(formatStoredMoney({ amountMinor: "9007199254740991", currency: "ZZZ" }, 9)).toBe(
      "9007199.254740991",
    );
    expect(formatStoredMoney({ amountMinor: "0", currency: "AFN" }, 0)).toBe("0");
    for (const exponent of [-1, 10, 1.1, NaN, Infinity])
      expect(() => formatStoredMoney({ amountMinor: "1", currency: "AFN" }, exponent)).toThrow(
        /LEGACY_MONEY_INTERPRETATION_UNSUPPORTED/,
      );
    expect(() => formatStoredMoney({ amountMinor: "01", currency: "EUR" }, 2)).toThrow(
      /LEGACY_MONEY_INVALID/,
    );
  });
  it("requires deliberate supported-unit declarations and makes unsupported units noncomparable", () => {
    expect(
      validateLegacyUnit(
        "AFN",
        { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
        assertion,
      ),
    ).toEqual({ unitKey: "iso4217-2026-09-17:AFN", eligibility: "ELIGIBLE" });
    expect(
      validateLegacyUnit("ZZZ", { kind: "UNSUPPORTED", label: "Historic unit" }, assertion),
    ).toEqual({ unitKey: `unsupported:${assertion}`, eligibility: "UNIT_UNSUPPORTED" });
    expect(() =>
      validateLegacyUnit(
        "AFN",
        { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:EUR" },
        assertion,
      ),
    ).toThrow(/LEGACY_MONEY_INVALID/);
    expect(() =>
      validateLegacyUnit(
        "ZZZ",
        { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:ZZZ" },
        assertion,
      ),
    ).toThrow(/LEGACY_MONEY_INTERPRETATION_UNSUPPORTED/);
  });
  it("rejects unknown profiles/currencies, oversized inputs and surplus fractions with closed errors", () => {
    for (const input of [
      decimal("ZZZ", "1"),
      { ...decimal("EUR", "1"), profileId: "today" },
      decimal("JPY", "1.0"),
      decimal("KWD", "1.2345"),
      decimal("EUR", "0".repeat(81)),
      {
        kind: "RAW",
        profileId,
        currency: "EUR",
        amountMinor: "9007199254740992",
        exponent: 2,
        unitKey: "iso4217-2026-09-17:EUR",
      },
    ])
      expect(() => parseLegacyMoneyAuthoring(input)).toThrow(LegacyMoneyError);
  });
});
