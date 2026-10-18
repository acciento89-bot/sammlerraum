import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDashboardQuery, type DashboardData } from "@sammlerraum/contracts/dashboard";
import { createDashboardService } from "./dashboard-service";
import { finalizeDashboard } from "./dashboard-result";
import type { SearchDatabase } from "../search/search-read";
const timestamp = "2025-01-01T00:00:00.000Z",
  id = "00000000-0000-4000-8000-000000000001";
const pair = { itemCount: 0, unitCount: "0" };
function empty(): DashboardData {
  return {
    version: 1,
    scope: "OWNED",
    lifecycle: "ACTIVE",
    readAt: timestamp,
    selection: { ...pair, matchedCollectionCount: 0 },
    collections: { ownedLiveCount: 0 },
    trade: ["NOT_FOR_TRADE", "OPEN_TO_TRADE", "FOR_SALE", "RESERVED"].map((tradeStatus) => ({
      ...pair,
      tradeStatus: tradeStatus as DashboardData["trade"][number]["tradeStatus"],
    })),
    tradeReady: pair,
    missing: {
      category: pair,
      condition: pair,
      acquisitionDate: pair,
      purchaseAmount: pair,
      ownEstimate: pair,
      grading: pair,
      catalogLink: pair,
      image: pair,
      document: pair,
    },
    manualValues: {
      state: "EMPTY",
      quantityBasis: "CURRENT_QUANTITY",
      contributors: pair,
      missing: pair,
      groups: [],
    },
    manualChange: {
      state: "EMPTY",
      mode: "LATEST_VS_PREVIOUS_OBSERVATION",
      quantityBasis: "CURRENT_QUANTITY",
      comparable: pair,
      excluded: { NO_ESTIMATE: pair, INSUFFICIENT_HISTORY: pair, NONCOMPARABLE_DENOMINATION: pair },
      groups: [],
    },
    condition: { missing: pair, groups: [] },
    grading: { gradedItemCount: 0, gradingRecordCount: 0, groups: [] },
    topCollections: {
      basis: "SELECTED_PHYSICAL_UNITS",
      limit: 10,
      eligibleCount: 0,
      hasMore: false,
      items: [],
    },
    recentAdditions: {
      basis: "INVENTORY_CREATED_AT",
      limit: 10,
      eligibleCount: 0,
      hasMore: false,
      items: [],
    },
    purchaseTotals: {
      state: "UNAVAILABLE",
      reason: "LEGACY_MONEY_INTERPRETATION_UNAVAILABLE",
      groups: null,
    },
    marketValues: { state: "UNAVAILABLE", reason: "MARKET_AGGREGATION_UNAVAILABLE", groups: null },
    duplicates: { state: "UNAVAILABLE", reason: "DUPLICATE_NOT_IMPLEMENTED", count: null },
    wishlist: { state: "UNAVAILABLE", reason: "WISHLIST_NOT_IMPLEMENTED", count: null },
  };
}
afterEach(() => vi.restoreAllMocks());
describe("dashboard request and result bounds", () => {
  it("normalizes exactly the shared query fields and rejects pagination/owner overrides before acquiring DB", async () => {
    expect(parseDashboardQuery({ text: " Ｗatch ", filter: null })).toEqual({
      text: "Watch",
      filter: null,
      lifecycle: "ACTIVE",
    });
    const database: SearchDatabase = {
      $transaction: async () => {
        throw Error("must not acquire");
      },
    };
    for (const input of [
      { limit: 1 },
      { cursor: "abc" },
      { ownerId: "foreign" },
      { scope: "OWNED" },
      { text: "x".repeat(201) },
      { text: "\ud800" },
      { text: "\0" },
      { lifecycle: "TRASH" },
      null,
    ])
      await expect(
        createDashboardService(database).getDashboard({ userId: "owner" }, input),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
    await expect(
      createDashboardService(database).getDashboard({ userId: "" }, {}),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
  });
  it("rejects numeric output overflow as unavailable and malformed/rounded driver values as invariant", () => {
    const data = empty();
    data.selection.unitCount = "9".repeat(78);
    expect(finalizeDashboard(data, () => {}).selection.unitCount).toHaveLength(78);
    data.selection.unitCount = "9".repeat(79);
    expect(() => finalizeDashboard(data, () => {})).toThrow("SEARCH_UNAVAILABLE");
    for (const units of ["01", "-0", "1e3", "NaN", "x".repeat(79)]) {
      data.selection.unitCount = units;
      expect(() => finalizeDashboard(data, () => {})).toThrow("SEARCH_INVARIANT");
    }
    data.selection.unitCount = "0";
    data.selection.itemCount = 9007199254740992;
    expect(() => finalizeDashboard(data, () => {})).toThrow("SEARCH_INVARIANT");
  });
  it("bounds complete monetary groups at 256 without treating oversized output as partial", () => {
    const data = large();
    expect(finalizeDashboard(data, () => {}).manualValues.groups).toHaveLength(256);
    data.manualValues.groups!.push(data.manualValues.groups![0]!);
    expect(() => finalizeDashboard(data, () => {})).toThrow("SEARCH_UNAVAILABLE");
  });
  it("accepts exactly 1MiB and rejects one byte more, including UTF8 content", () => {
    const data = large();
    let remaining = 1048576 - Buffer.byteLength(JSON.stringify(data));
    expect(remaining).toBeGreaterThan(0);
    for (const group of data.manualValues.groups!)
      for (const item of group.topItems.items) {
        const add = Math.min(599, remaining);
        const bytes = add + 1;
        item.title =
          "界".repeat(Math.floor(bytes / 3)) + (bytes % 3 === 2 ? "é" : bytes % 3 === 1 ? "x" : "");
        remaining -= add;
      }
    expect(remaining).toBe(0);
    expect(Buffer.byteLength(JSON.stringify(data))).toBe(1048576);
    expect(finalizeDashboard(data, () => {})).toBeDefined();
    const last = data.manualValues.groups!.at(-1)!.topItems.items.at(-1)!;
    last.title += "x";
    expect(Buffer.byteLength(JSON.stringify(data))).toBe(1048577);
    expect(() => finalizeDashboard(data, () => {})).toThrow("SEARCH_UNAVAILABLE");
  });
  it("checks CPU budget after validation and serialization rather than returning late output", () => {
    let checks = 0;
    expect(() =>
      finalizeDashboard(empty(), () => {
        if (++checks === 4) throw Error("expired");
      }),
    ).toThrow("expired");
    expect(checks).toBe(4);
  });
});
function large(): DashboardData {
  const data = empty();
  data.manualValues.groups = Array.from({ length: 256 }, (_, n) => ({
    source: "MANUAL",
    basis: "PER_UNIT",
    currency: `A${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + (n % 26))}`,
    minorUnitExponent: 2,
    totalMinor: "10",
    contributors: { itemCount: 10, unitCount: "10" },
    otherDenomination: { itemCount: 2550, unitCount: "2550" },
    observedAtFrom: timestamp,
    observedAtTo: timestamp,
    topItems: {
      limit: 10,
      eligibleCount: 10,
      hasMore: false,
      quantityBasis: "CURRENT_QUANTITY",
      items: Array.from({ length: 10 }, () => ({
        id,
        title: "x",
        collectionId: id,
        quantity: 1,
        valuationId: id,
        perUnitMinor: "1",
        weightedMinor: "1",
        observedAt: timestamp,
      })),
    },
  }));
  return data;
}
