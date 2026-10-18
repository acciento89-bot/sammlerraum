import { describe, expect, it } from "vitest";
import { formatValuationMoney, manualInput, observationTime } from "./valuation-money";
import { displayCatalogMoney } from "../catalog/catalog-money";

describe("stored valuation scale and exact digits", () => {
  it.each([
    ["0", "EUR", 2, "0.00", "0,00"],
    ["100", "AFN", 2, "1.00", "1,00"],
    ["1001", "IQD", 3, "1.001", "1,001"],
    ["1", "CLF", 4, "0.0001", "0,0001"],
    ["1", "UYW", 4, "0.0001", "0,0001"],
    ["9223372036854775807", "JPY", 0, "9,223,372,036,854,775,807", "9.223.372.036.854.775.807"],
    ["9223372036854775807", "EUR", 2, "92,233,720,368,547,758.07", "92.233.720.368.547.758,07"],
    ["9223372036854775807", "KWD", 3, "9,223,372,036,854,775.807", "9.223.372.036.854.775,807"],
    ["9223372036854775807", "CLF", 4, "922,337,203,685,477.5807", "922.337.203.685.477,5807"],
    ["1230", "ANG", 3, "1.230", "1,230"],
    ["100", "EUR", 0, "100", "100"],
  ])(
    "preserves %s %s at stored exponent %s",
    (amountMinor, currency, minorUnitExponent, en, de) => {
      const money = { amountMinor, currency, minorUnitExponent };
      expect(formatValuationMoney(money, "en")).toContain(en);
      expect(formatValuationMoney(money, "de")).toContain(de);
      expect(formatValuationMoney(money, "en")).toContain(currency);
    },
  );
  it("rejects missing/invalid stored facts rather than treating them as zero", () => {
    expect(() =>
      formatValuationMoney({ amountMinor: "1", currency: "EUR" } as never, "en"),
    ).toThrow();
    expect(() =>
      formatValuationMoney(
        { amountMinor: "9223372036854775808", currency: "EUR", minorUnitExponent: 2 },
        "en",
      ),
    ).toThrow();
  });
});

describe("manual draft interpretation", () => {
  const draft = {
    amount: "1.234,50",
    currency: "EUR",
    note: "  private 😀  ",
    earlier: true,
    date: "0001-01-02",
    time: "03:04:05.006",
  };
  it("keeps input locale, UTC year 0001 and trimmed codepoints", () => {
    expect(manualInput(draft, "de")).toEqual({
      amountMinor: "123450",
      currency: "EUR",
      note: "private 😀",
      observedAt: "0001-01-02T03:04:05.006Z",
    });
    expect(() => manualInput(draft, "en")).toThrow();
    expect(
      manualInput({ ...draft, amount: "0", earlier: false, note: "😀".repeat(2000) }, "de").note,
    ).toHaveLength(4000);
  });
  it.each([
    { amount: "" },
    { amount: "1e2" },
    { amount: "-1" },
    { amount: "1,234" },
    { amount: "92.233.720.368.547.758,08" },
    { date: "2025-02-30" },
    { time: "24:00" },
    { note: "😀".repeat(2001) },
    { note: "\uD800" },
    { note: "\0" },
  ])("rejects invalid draft %#", (change) =>
    expect(() => manualInput({ ...draft, ...change }, "de")).toThrow(),
  );
  it("revalidates selected currency without rounding", () => {
    expect(() => manualInput({ ...draft, amount: "1,01", currency: "JPY" }, "de")).toThrow();
    expect(manualInput({ ...draft, amount: "0,0001", currency: "UYW" }, "de").amountMinor).toBe(
      "1",
    );
  });
  it("respects stated observation precision", () => {
    expect(observationTime("2025-01-02T00:00:00.000Z", "DAY", "en")).not.toContain(":");
    expect(observationTime("2025-01-02T03:04:05.006Z", "MILLISECOND", "en")).toContain(".006");
    expect(observationTime("2025-01-02T03:04:05.000Z", "SECOND", "de")).not.toContain(",000");
  });
});

it("catalog display keeps exact safe-number digits with existing legacy scale", () => {
  expect(displayCatalogMoney({ amountMinor: 9007199254740991, currency: "EUR" }, "en")).toBe(
    "90,071,992,547,409.91 EUR",
  );
  expect(displayCatalogMoney({ amountMinor: 9007199254740991, currency: "EUR" }, "de")).toBe(
    "90.071.992.547.409,91 EUR",
  );
  expect(displayCatalogMoney({ amountMinor: 0, currency: "EUR" }, "de")).toBe("0,00 EUR");
});
it("formats a validated manual DTO without rejecting its non-money provenance", () => {
  expect(
    formatValuationMoney(
      {
        amountMinor: "100",
        currency: "EUR",
        minorUnitExponent: 2,
        id: "11111111-1111-4111-8111-111111111111",
      } as never,
      "en",
    ),
  ).toContain("1.00");
});
