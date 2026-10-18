import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createMarketDataService } from "./market-data-service";
import { parseBatch } from "./validation";
const registry = new ProviderRegistry([
  {
    provider: { id: "fixture", fetch: async () => [] },
    identifierNamespace: "fixture",
    identifierType: "product",
  },
]);
const context = {
  request: {
    pollId: "00000000-0000-0000-0000-000000000001",
    target: {
      entryId: "00000000-0000-0000-0000-000000000002",
      variantId: null,
      revision: 1,
      identifierId: "00000000-0000-0000-0000-000000000003",
      namespace: "fixture",
      identifierType: "product",
      externalId: "product",
    },
  },
  fetchedAt: "2025-01-01T00:00:00.000Z",
};
const point = (extra: object = {}) => ({
  externalId: "product",
  identity: { mode: "POLL" },
  sourceMetric: "market",
  kind: "SOLD_MEDIAN",
  amountMinor: 0n,
  currency: "EUR",
  qualifiers: {},
  time: { basis: "FETCH", precision: "MILLISECOND" },
  ...extra,
});
describe("market validation boundary", () => {
  it("rejects malformed input before acquiring any database transaction", async () => {
    const service = createMarketDataService(
      {
        $transaction: async () => {
          throw new Error("Database unavailable");
        },
      },
      registry,
    );
    await expect(
      service.recordObservations("fixture", [point({ amountMinor: -1n })], context),
    ).rejects.toMatchObject({ code: "MARKET_INPUT_INVALID" });
  });
  it("captures source qualifier/confidence snapshots before any asynchronous work", () => {
    const qualifiers = { condition: "NM" },
      confidence = { sourceLabel: "source" };
    const row = parseBatch("fixture", [point({ qualifiers, confidence })], context).rows[0]!;
    qualifiers.condition = "Damaged";
    confidence.sourceLabel = "changed";
    expect(row.qualifiers).toEqual({ condition: "NM" });
    expect(row.confidence).toEqual({ sourceLabel: "source" });
  });
  it("uses the exact native JSONB metadata byte budget rather than compact JSON length", () => {
    const qualifiers = {
      a: "x".repeat(128),
      b: "x".repeat(128),
      c: "x".repeat(128),
      d: "x".repeat(128),
      e: "x".repeat(128),
      f: "x".repeat(128),
      g: "x".repeat(128),
    };
    const confidence = { sourceLabel: "x".repeat(128), methodology: "x".repeat(512) };
    // Native JSONB spaces count: this metadata is 4097 bytes but compact JSON is 4074.
    const row = point({
      qualifiers,
      confidence,
      sourceReference: "x".repeat(512),
      sourceUrl: "https://example.org/" + "x".repeat(1856),
    });
    expect(() => parseBatch("fixture", [row], context)).toThrow();
    expect(() =>
      parseBatch(
        "fixture",
        [{ ...row, sourceUrl: "https://example.org/" + "x".repeat(1855) }],
        context,
      ),
    ).not.toThrow();
  });
  it("bounds qualifiers using UTF-8 JSONB bytes and the whole serialized batch", () => {
    const qualifiers = {
      a: "x".repeat(128),
      b: "x".repeat(128),
      c: "x".repeat(128),
      d: "x".repeat(128),
      e: "x".repeat(128),
      f: "x".repeat(128),
      g: "x".repeat(128),
      h: "x".repeat(56),
    };
    expect(() => parseBatch("fixture", [point({ qualifiers })], context)).not.toThrow();
    expect(() =>
      parseBatch("fixture", [point({ qualifiers: { ...qualifiers, h: "x".repeat(57) } })], context),
    ).toThrow();
    const row = point({ qualifiers, sourceUrl: "https://example.org/" + "x".repeat(1900) });
    expect(() =>
      parseBatch(
        "fixture",
        Array.from({ length: 100 }, () => row),
        context,
      ),
    ).toThrow();
    expect(() =>
      parseBatch("fixture", [point({ qualifiers: { label: "😀" } })], context),
    ).not.toThrow();
  });
});
