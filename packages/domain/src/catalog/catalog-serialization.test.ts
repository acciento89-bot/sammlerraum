import { describe, expect, it } from "vitest";
import { serializeCatalogSnapshot } from "./catalog-service";
describe("immutable catalog serialization compatibility", () => {
  it("retains the established bytes for nested values, Unicode, omitted fields and exact integers", () => {
    expect(
      serializeCatalogSnapshot({
        z: [9007199254740991, { β: "é", a: null }],
        omitted: undefined,
        a: "\u0000",
      }),
    ).toBe('{"a":"\\u0000","z":[9007199254740991,{"a":null,"β":"é"}]}');
  });
  it("preserves the canonical service error for undefined array members", () => {
    expect(() => serializeCatalogSnapshot([undefined])).toThrow("CATALOG_INPUT_INVALID");
  });
});
