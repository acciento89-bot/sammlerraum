import { describe, it, expect } from "vitest";
import { parseWishPrice, formatWishPrice } from "./wish-price";
describe("explicit prospective wish price precision", () => {
  it("formats values above Number safe precision without rounding cents", () => {
    const value = { amountMinor: "9223372036854775807", currency: "EUR", minorUnitExponent: 2 };
    expect(formatWishPrice(value, "de")).toContain("92.233.720.368.547.758,07");
    expect(formatWishPrice(value, "en")).toContain("92,233,720,368,547,758.07");
  });
  it("accepts either local decimal separator and treats an empty field as no target", () => {
    expect(parseWishPrice("19,95", "EUR")).toEqual({
      amountMinor: "1995",
      currency: "EUR",
      minorUnitExponent: 2,
    });
    expect(parseWishPrice("19.95", "USD")?.amountMinor).toBe("1995");
    expect(parseWishPrice("", "EUR")).toBeNull();
  });
  it("rejects ambiguous/grouped amounts, unsupported units and overflow without rounding", () => {
    for (const value of ["1,234.56", "1.234", "-1", "92233720368547758.08"])
      expect(() => parseWishPrice(value, "EUR")).toThrow();
    expect(() => parseWishPrice("5", "JPY")).toThrow();
  });
});
