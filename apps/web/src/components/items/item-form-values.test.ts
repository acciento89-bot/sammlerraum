import { describe, expect, it } from "vitest";

import { majorUnits, minorUnits } from "./item-form-values";

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
});
