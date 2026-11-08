import { describe, it, expect, vi } from "vitest";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import { emptyMarketDisplayPolicy } from "../valuations/market-display-policy";
import {
  captureMarketRights,
  listMarketFilterSelectors,
  withMarketRights,
  emptyMarketQueryPolicy,
  marketSelectorKey,
  marketBatchFilterError,
} from "./market-query-policy";
import {
  MarketBatchError,
  type MarketSelector,
  type MarketQueryPolicy,
  type MarketBatchUse,
} from "./market-batch";
const selector: MarketSelector = {
  mode: "CURRENT_ITEM_MAPPING",
  providerId: "fixture",
  identifierNamespace: "fixture",
  identifierType: "product",
  kind: "LAST_SOLD",
  sourceMetric: "sold_item",
  qualifiers: { graded: false, region: "EU" },
  currency: "EUR",
  minorUnitExponent: 2,
};
const actor = "own-market-policy-fixture";
function fixture() {
  const fetch = vi.fn(async () => []);
  const registry = new ProviderRegistry([
    {
      provider: { id: "fixture", fetch },
      identifierNamespace: "fixture",
      identifierType: "product",
    },
  ]);
  const displayPolicy = {
    snapshotForOwner: () => [
      {
        providerId: "fixture",
        identifierNamespace: "fixture",
        identifierType: "product",
        allowHistorical: false,
      },
    ],
  };
  const grants = {
    queryGrants: [{ selector: structuredClone(selector), purposes: ["FILTER"] }],
    aggregateGrants: [],
  };
  const queryPolicy: MarketQueryPolicy = { snapshotForOwner: () => grants as never };
  return { fetch, registry, displayPolicy, queryPolicy, grants };
}
const filter: MarketBatchUse = { purpose: "FILTER" };
describe("independent exact market query capabilities", () => {
  it("defaults to no query or aggregate rights and requires independent display plus registration plus exact query rights", () => {
    const f = fixture();
    expect(emptyMarketQueryPolicy.snapshotForOwner(actor)).toEqual({
      queryGrants: [],
      aggregateGrants: [],
    });
    expect(() =>
      captureMarketRights(actor, [selector], filter, { ...f, queryPolicy: emptyMarketQueryPolicy }),
    ).toThrow(
      expect.objectContaining({
        code: "MARKET_BATCH_UNAVAILABLE",
        reason: "QUERY_RIGHTS_DISABLED",
      }),
    );
    expect(() =>
      captureMarketRights(actor, [selector], filter, {
        ...f,
        displayPolicy: emptyMarketDisplayPolicy,
      }),
    ).toThrow(expect.objectContaining({ reason: "DISPLAY_DISABLED" }));
    const receipt = captureMarketRights(actor, [selector], filter, f);
    expect(receipt.selectors).toEqual([selector]);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("never infers detail or aggregation permission from filter permission", () => {
    const f = fixture();
    expect(() =>
      captureMarketRights(actor, [selector], { purpose: "DASHBOARD_DETAIL" }, f),
    ).toThrow(expect.objectContaining({ reason: "QUERY_RIGHTS_DISABLED" }));
    expect(() =>
      captureMarketRights(
        actor,
        [selector],
        { purpose: "DASHBOARD_AGGREGATE", basis: "ONE_PER_ITEM" },
        f,
      ),
    ).toThrow(expect.objectContaining({ reason: "AGGREGATE_UNSUPPORTED" }));
  });
  it("requires explicit additive semantics and the exact aggregation basis", () => {
    const f = fixture();
    f.grants.aggregateGrants.push({
      selector,
      semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE",
      bases: ["ONE_PER_ITEM"],
    } as never);
    expect(() =>
      captureMarketRights(
        actor,
        [selector],
        { purpose: "DASHBOARD_AGGREGATE", basis: "ONE_PER_ITEM" },
        f,
      ),
    ).not.toThrow();
    expect(() =>
      captureMarketRights(
        actor,
        [selector],
        { purpose: "DASHBOARD_AGGREGATE", basis: "CURRENT_QUANTITY" },
        f,
      ),
    ).toThrow(expect.objectContaining({ reason: "AGGREGATE_UNSUPPORTED" }));
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(["sourceMetric", "kind", "currency", "minorUnitExponent", "qualifiers"] as const)(
    "matches the complete selector without %s fallback",
    (field) => {
      const f = fixture();
      const changed = {
        ...selector,
        [field]:
          field === "qualifiers"
            ? { graded: "false", region: "EU" }
            : field === "minorUnitExponent"
              ? 3
              : field === "kind"
                ? "SOLD_MEDIAN"
                : field === "currency"
                  ? "USD"
                  : "different_metric",
      };
      expect(() => captureMarketRights(actor, [changed] as never, filter, f)).toThrow(
        expect.objectContaining({ reason: "QUERY_RIGHTS_DISABLED" }),
      );
    },
  );
  it("canonicalizes qualifier key order but preserves string-vs-boolean identity and freezes copied selectors", () => {
    const f = fixture(),
      request = structuredClone(selector);
    request.qualifiers = { region: "EU", graded: false };
    expect(marketSelectorKey(request)).toBe(marketSelectorKey(selector));
    const receipt = captureMarketRights(actor, [request, selector], filter, f);
    expect(receipt.selectors).toHaveLength(1);
    request.qualifiers.region = "changed";
    expect(receipt.selectors[0]!.qualifiers).toEqual({ graded: false, region: "EU" });
    expect(Object.isFrozen(receipt.selectors)).toBe(true);
    expect(Object.isFrozen(receipt.selectors[0]!.qualifiers)).toBe(true);
  });
  it.each([
    "duplicate",
    "excess",
    "extra-key",
    "wrong-registration",
    "bad-purpose",
    "bad-selector",
  ])("rejects malformed trusted %s configuration with a closed invariant", (mode) => {
    const f = fixture();
    if (mode === "duplicate") f.grants.queryGrants.push(f.grants.queryGrants[0]!);
    if (mode === "excess")
      f.grants.queryGrants = Array.from({ length: 51 }, () => f.grants.queryGrants[0]!);
    if (mode === "extra-key") Object.assign(f.grants, { privateSentinel: "must-not-leak" });
    if (mode === "wrong-registration") f.grants.queryGrants[0]!.selector.identifierType = "other";
    if (mode === "bad-purpose") f.grants.queryGrants[0]!.purposes = ["FILTER", "FILTER"];
    if (mode === "bad-selector")
      Object.assign(f.grants.queryGrants[0]!.selector, { extra: "privateSentinel" });
    expect(() => captureMarketRights(actor, [selector], filter, f)).toThrow(
      expect.objectContaining({ code: "MARKET_BATCH_INVARIANT" }),
    );
  });
  it("denies unknown/mismatched requested registrations without exposing provider lookup errors", () => {
    const f = fixture();
    for (const changed of [
      { ...selector, providerId: "unknown" },
      { ...selector, identifierNamespace: "other" },
    ])
      expect(() => captureMarketRights(actor, [changed], filter, f)).toThrow(
        expect.objectContaining({
          code: "MARKET_BATCH_UNAVAILABLE",
          reason: "QUERY_RIGHTS_DISABLED",
        }),
      );
  });
  it("closes thrown policy details and maps only intentional unavailable reasons to the filter boundary", () => {
    const f = fixture();
    f.queryPolicy = {
      snapshotForOwner: () => {
        throw Error("private-policy-token-sentinel");
      },
    };
    let observed: unknown;
    try {
      captureMarketRights(actor, [selector], filter, f);
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(MarketBatchError);
    expect(String(observed)).not.toContain("private-policy-token");
    expect(JSON.stringify(observed)).not.toContain("private-policy-token");
    const mapped = marketBatchFilterError(
      new MarketBatchError("MARKET_BATCH_UNAVAILABLE", "QUERY_RIGHTS_DISABLED"),
    );
    expect(mapped).toBeInstanceOf(FilterValidationError);
    expect(mapped).toMatchObject({
      code: "FILTER_UNAVAILABLE",
      reason: "MARKET_QUERY_RIGHTS_DISABLED",
    });
    expect(marketBatchFilterError(new Error("private-driver-sentinel"))).toBeNull();
  });
  it("rechecks rights after an awaited consumer and never returns a revoked result", async () => {
    const f = fixture();
    await expect(
      withMarketRights(actor, [selector], filter, f, async () => {
        await Promise.resolve();
        f.grants.queryGrants = [];
        return "must-not-return";
      }),
    ).rejects.toMatchObject({ code: "MARKET_BATCH_UNAVAILABLE", reason: "QUERY_RIGHTS_DISABLED" });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("captures the requested purpose independently of caller mutation", () => {
    const f = fixture(),
      requested: MarketBatchUse = { purpose: "FILTER" };
    const receipt = captureMarketRights(actor, [selector], requested, f);
    Object.assign(requested, { purpose: "DASHBOARD_DETAIL" });
    expect(() => receipt.assertCurrent()).not.toThrow();
  });
  it("checks revocation of display and aggregate rights after async work", async () => {
    const f = fixture();
    await expect(
      withMarketRights(actor, [selector], filter, f, async () => {
        f.displayPolicy.snapshotForOwner = () => [];
        return 1;
      }),
    ).rejects.toMatchObject({ reason: "DISPLAY_DISABLED" });
    const g = fixture();
    g.grants.aggregateGrants.push({
      selector,
      semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE",
      bases: ["CURRENT_QUANTITY"],
    } as never);
    await expect(
      withMarketRights(
        actor,
        [selector],
        { purpose: "DASHBOARD_AGGREGATE", basis: "CURRENT_QUANTITY" },
        g,
        async () => {
          g.grants.aggregateGrants = [];
          return 1;
        },
      ),
    ).rejects.toMatchObject({ reason: "AGGREGATE_UNSUPPORTED" });
  });
  it("skips policy preparation for no selectors without confusing it with an empty inventory", async () => {
    const f = fixture();
    const probe = vi.fn(f.queryPolicy.snapshotForOwner);
    f.queryPolicy = { snapshotForOwner: probe };
    expect(await withMarketRights(actor, [], filter, f, async (r) => r.selectors.length)).toBe(0);
    expect(probe).not.toHaveBeenCalled();
    await expect(
      withMarketRights(
        actor,
        [selector],
        filter,
        { ...f, queryPolicy: emptyMarketQueryPolicy },
        async () => [],
      ),
    ).rejects.toMatchObject({ reason: "QUERY_RIGHTS_DISABLED" });
  });
  it("preserves independent grant snapshots and validates requested rights even before any candidate query", async () => {
    const f = fixture(),
      consume = vi.fn(async () => "owned result");
    expect(await withMarketRights(actor, [selector], filter, f, consume)).toBe("owned result");
    expect(consume).toHaveBeenCalledTimes(1);
    f.grants.queryGrants = [];
    await expect(withMarketRights(actor, [selector], filter, f, consume)).rejects.toMatchObject({
      reason: "QUERY_RIGHTS_DISABLED",
    });
    expect(consume).toHaveBeenCalledTimes(1);
  });
});

it("discovers only current FILTER selectors admitted by independent display and query rights", () => {
  const f = fixture();
  expect(listMarketFilterSelectors(actor, f)).toEqual([selector]);
  f.grants.queryGrants = [];
  expect(listMarketFilterSelectors(actor, f)).toEqual([]);
  expect(
    listMarketFilterSelectors(actor, { ...f, displayPolicy: emptyMarketDisplayPolicy }),
  ).toEqual([]);
  expect(f.fetch).not.toHaveBeenCalled();
});
