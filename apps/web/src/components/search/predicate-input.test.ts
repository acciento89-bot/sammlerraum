import { expect, it } from "vitest";
import { fromUtcControl, toUtcControl } from "./predicate-input";
it.each([
  ["2025-01-02T03:04", "2025-01-02T03:04:00.000Z"],
  ["2025-01-02T03:04:05", "2025-01-02T03:04:05.000Z"],
  ["2025-01-02T03:04:05.1", "2025-01-02T03:04:05.100Z"],
  ["", ""],
])("keeps explicit UTC without local timezone conversion: %s", (input, want) => {
  expect(fromUtcControl(input)).toBe(want);
});
it("restores milliseconds in a native UTC datetime control", () => {
  expect(toUtcControl("2025-01-02T03:04:05.123Z")).toBe("2025-01-02T03:04:05.123");
});
