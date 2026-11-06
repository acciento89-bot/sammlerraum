import { describe, it, expect } from "vitest";
import { digestCatalogMoneyPatch } from "./catalog-money-envelope";
const id = "b42572c3-dbf8-4c64-9203-593c5f181a41";
const patch = {
  kind: "UPDATE_ENTRY",
  input: { attributes: [{ definitionId: id, value: { amountMinor: 1, currency: "ZZZ" } }] },
};
describe("catalog money canonical patch binding foundation", () => {
  it("uses stable existing serialization while binding the actual raw patch", () => {
    const first = digestCatalogMoneyPatch(patch);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      digestCatalogMoneyPatch({
        input: { attributes: [{ value: { currency: "ZZZ", amountMinor: 1 }, definitionId: id }] },
        kind: "UPDATE_ENTRY",
      }),
    ).toBe(first);
    expect(
      digestCatalogMoneyPatch({
        ...patch,
        input: { attributes: [{ definitionId: id, value: { amountMinor: 2, currency: "ZZZ" } }] },
      }),
    ).not.toBe(first);
  });
  it("rejects malformed or oversized patches instead of hashing an unbounded payload", () => {
    for (const input of [
      { kind: "UNKNOWN" },
      { ...patch, input: { attributes: [{ definitionId: id, value: "x".repeat(65537) }] } },
    ])
      expect(() => digestCatalogMoneyPatch(input)).toThrow("LEGACY_MONEY_INVALID");
  });
});
