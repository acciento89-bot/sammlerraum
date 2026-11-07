import { describe, expect, it } from "vitest";
import { formatDashboardInteger, formatDashboardMoney } from "./dashboard-format";
for (const locale of ["de", "en"] as const) {
  describe(`${locale} exact stored-unit formatting`, () => {
    it("keeps integers beyond safe-number and bigint record ranges exact", () => {
      const value = "1844674407370955161400000000";
      expect(formatDashboardInteger(value, locale)).toBe(
        locale === "de"
          ? "1.844.674.407.370.955.161.400.000.000"
          : "1,844,674,407,370,955,161,400,000,000",
      );
      expect(formatDashboardMoney(value, 2, locale)).toBe(
        locale === "de"
          ? "18.446.744.073.709.551.614.000.000,00"
          : "18,446,744,073,709,551,614,000,000.00",
      );
    });
    it("preserves negative fractional signs and actual zero", () => {
      expect(formatDashboardMoney("-1", 3, locale)).toBe(locale === "de" ? "-0,001" : "-0.001");
      expect(formatDashboardMoney("0", 3, locale)).toBe(locale === "de" ? "0,000" : "0.000");
      expect(formatDashboardInteger("0", locale)).toBe("0");
    });
    it("uses the stored exponent rather than a currency default", () => {
      expect(formatDashboardMoney("1234567", 0, locale)).toBe(
        locale === "de" ? "1.234.567" : "1,234,567",
      );
      expect(formatDashboardMoney("1234567", 3, locale)).toBe(
        locale === "de" ? "1.234,567" : "1,234.567",
      );
      // Exponent4 is formatter capacity only, not a fabricated producer denomination.
      expect(formatDashboardMoney("1234567", 4, locale)).toBe(
        locale === "de" ? "123,4567" : "123.4567",
      );
    });
    it("accepts the bounded 78-digit aggregate capacity", () => {
      const result = formatDashboardMoney("9".repeat(78), 9, locale);
      expect(
        result.replaceAll(locale === "de" ? "." : ",", "").replace(locale === "de" ? "," : ".", ""),
      ).toBe("9".repeat(78));
    });
  });
}
for (const value of ["", "01", "-0", "+1", "1.2", " 1", "1 ", "NaN", "1e8", "１２", "9".repeat(79)])
  it(`rejects noncanonical/beyond-capacity amount ${value.slice(0, 12)}`, () => {
    expect(() => formatDashboardMoney(value, 2, "de")).toThrow();
  });
for (const exponent of [-1, 0.5, 10, NaN, Infinity])
  it(`rejects unsupported stored exponent ${String(exponent)}`, () => {
    expect(() => formatDashboardMoney("1", exponent, "en")).toThrow();
  });
it("does not accept negative physical-unit counts or unsupported locales", () => {
  expect(() => formatDashboardInteger("-1", "en")).toThrow();
  expect(() => formatDashboardMoney("1", 2, "fr" as "en")).toThrow();
});
