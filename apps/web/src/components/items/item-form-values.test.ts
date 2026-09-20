import { describe, expect, it } from "vitest";

import {
  displayCustomFieldValue,
  integerCustomFieldValue,
  itemCurrencyOptions,
  majorUnits,
  minorUnits,
  tagsFromInput,
  tagsInputValue,
} from "./item-form-values";

describe("item form money conversion", () => {
  it.each([
    [Number.MAX_SAFE_INTEGER - 1, "90071992547409.90"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91"],
  ])("round-trips safe minor-unit boundary %s without changing a cent", (minor, major) => {
    expect(majorUnits(minor)).toBe(major);
    expect(minorUnits(major)).toBe(minor);
  });

  it("rejects the first amount beyond the safe minor-unit contract", () => {
    expect(() => minorUnits("90071992547409.92")).toThrow("money");
  });

  it("uses zero fractional digits for JPY minor units", () => {
    expect(minorUnits("123", "JPY")).toBe(123);
    expect(majorUnits(123, "JPY")).toBe("123");
  });

  it("uses three fractional digits for KWD minor units", () => {
    expect(minorUnits("1.234", "KWD")).toBe(1234);
    expect(majorUnits(1234, "KWD")).toBe("1.234");
  });
});

describe("item form canonical value preservation", () => {
  it("offers an API-valid saved currency outside the original defaults", () => {
    expect(Intl.supportedValuesOf("currency")).toContain("JPY");
    expect(itemCurrencyOptions).toContain("JPY");
  });

  it.each([
    ["1e3", 1000],
    ["-2e2", -200],
  ])("parses the complete integral exponent spelling %s", (input, expected) => {
    expect(integerCustomFieldValue(input)).toBe(expected);
  });

  it("round-trips comma-containing tags alongside ordinary tags", () => {
    const tags = ["Washington, D.C.", "postal history"];
    expect(tagsFromInput(tagsInputValue(tags))).toEqual(tags);
  });
});

describe("saved custom-field display", () => {
  it("localizes canonical dates without changing the input value", () => {
    expect(displayCustomFieldValue("2026-09-20", "DATE", "de")).toBe("20.09.2026");
    expect(displayCustomFieldValue("2026-09-20", "DATE", "en")).toBe("9/20/2026");
  });

  it("localizes high-precision decimals without losing digits", () => {
    const value = "1234.500000000000000001";
    expect(displayCustomFieldValue(value, "DECIMAL", "de")).toBe("1.234,500000000000000001");
    expect(displayCustomFieldValue(value, "DECIMAL", "en")).toBe("1,234.500000000000000001");
  });

  it("localizes maximum-safe-cent money without losing cents", () => {
    const value = { amountMinor: Number.MAX_SAFE_INTEGER, currency: "EUR" };
    expect(displayCustomFieldValue(value, "MONEY", "de")).toBe("90.071.992.547.409,91 EUR");
    expect(displayCustomFieldValue(value, "MONEY", "en")).toBe("90,071,992,547,409.91 EUR");
  });
});
