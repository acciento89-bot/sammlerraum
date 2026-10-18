import { describe, expect, it } from "vitest";
import { parseLocalizedMoney } from "./money";

describe("canonical localized money", () => {
  it.each([
    ["de", "1.234,56", "EUR", 123456n],
    ["en", "1,234.56", "EUR", 123456n],
    ["de", "00,50", "EUR", 50n],
    ["en", "001.00", "EUR", 100n],
    ["de", "  0  ", "EUR", 0n],
    ["en", "12.3", "EUR", 1230n],
    ["de", "1.234", "JPY", 1234n],
    ["en", "1,234", "UYI", 1234n],
    ["de", "1.234,567", "KWD", 1234567n],
    ["en", "1,234.5678", "CLF", 12345678n],
    ["de", "0,0001", "UYW", 1n],
    ["en", "1.00", "AFN", 100n],
    ["en", "90,071,992,547,409.93", "EUR", 9007199254740993n],
    ["en", "92,233,720,368,547,758.07", "EUR", 9223372036854775807n],
    ["de", "9223372036854775807", "JPY", 9223372036854775807n],
  ])("parses %s %s %s exactly", (locale, input, currency, expected) => {
    expect(parseLocalizedMoney(input, locale as "de" | "en", currency)).toEqual({
      amountMinor: expected,
      currency,
    });
  });
  it.each([
    ["", "en", "EUR"],
    ["1.234,56", "en", "EUR"],
    ["1,234.56", "de", "EUR"],
    ["12,34.56", "en", "EUR"],
    ["01,234.56", "en", "EUR"],
    ["0,000", "en", "EUR"],
    ["1,234,", "en", "EUR"],
    ["1234,567.89", "en", "EUR"],
    ["1..234", "de", "EUR"],
    ["1 234,56", "de", "EUR"],
    ["1\u00a0234,56", "de", "EUR"],
    ["1\u202f234,56", "de", "EUR"],
    ["€1", "en", "EUR"],
    ["+1", "en", "EUR"],
    ["-0", "en", "EUR"],
    ["1e2", "en", "EUR"],
    ["NaN", "en", "EUR"],
    ["Infinity", "en", "EUR"],
    [".5", "en", "EUR"],
    ["1.", "en", "EUR"],
    ["1.000", "en", "EUR"],
    ["1.0", "en", "JPY"],
    ["1.0000", "en", "KWD"],
    ["1.00000", "en", "CLF"],
    ["92233720368547758.08", "en", "EUR"],
    ["9223372036854775808", "en", "JPY"],
    ["1", "en", "eur"],
    ["1", "en", "XXX"],
    ["1", "en", "XAU"],
    ["1", "en", "ZZZ"],
    ["1", "en", "HRK"],
    ["1", "fr", "EUR"],
    ["１", "en", "EUR"],
    ["1\n2", "en", "EUR"],
    [" ".repeat(80) + "1", "en", "EUR"],
  ])("rejects malformed/range/scale input %s %s %s", (input, locale, currency) => {
    expect(() => parseLocalizedMoney(input, locale as "de" | "en", currency)).toThrow();
  });
});
