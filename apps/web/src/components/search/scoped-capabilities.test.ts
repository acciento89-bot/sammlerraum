import { describe, expect, it } from "vitest";
import { parseItemFilter } from "@sammlerraum/contracts/search";
import { scopedFilterAvailable } from "./scoped-capabilities";
const basic = {
  scope: "SHARE" as const,
  reference: { kind: "SHARE" as const, shareId: "00000000-0000-4000-8000-000000000001" },
  families: [],
  mediaKinds: [],
  receiptCategories: false,
  canonicalMoneyEnabled: false,
};
describe("scope field capability repair", () => {
  it("rejects a retained unavailable false predicate without dropping or changing it", () => {
    const filter = parseItemFilter({
      version: 1,
      root: { kind: "not", child: { kind: "duplicate", value: false } },
    });
    const before = JSON.stringify(filter);
    expect(scopedFilterAvailable(filter, basic)).toBe(false);
    expect(JSON.stringify(filter)).toBe(before);
    expect(scopedFilterAvailable(null, basic)).toBe(true);
  });
  it("does not mistake one media grant for another or for receipt access", () => {
    const caps = { ...basic, families: ["media" as const], mediaKinds: ["DOCUMENT" as const] };
    const filter = (mediaKind: string, documentCategory?: string) =>
      parseItemFilter({
        version: 1,
        root: {
          kind: "media",
          mediaKind,
          ...(documentCategory ? { documentCategory } : {}),
          test: { op: "missing" },
        },
      });
    expect(scopedFilterAvailable(filter("DOCUMENT"), caps)).toBe(true);
    expect(scopedFilterAvailable(filter("IMAGE"), caps)).toBe(false);
    expect(scopedFilterAvailable(filter("DOCUMENT", "PURCHASE_RECEIPT"), caps)).toBe(false);
  });
});
