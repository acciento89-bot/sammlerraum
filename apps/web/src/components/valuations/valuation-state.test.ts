import { describe, expect, it } from "vitest";
import type { ManualValuationDto, ValuationSummaryDto } from "@sammlerraum/contracts/valuations";
import {
  ValuationController,
  ValuationHttpError,
  type ValuationTransport,
} from "./valuation-state";
const row: ManualValuationDto = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "MANUAL",
  basis: "PER_UNIT",
  amountMinor: "0",
  currency: "EUR",
  minorUnitExponent: 2,
  observedAt: "2025-01-01T00:00:00.000Z",
  createdAt: "2025-01-02T00:00:00.000Z",
  note: "private",
};
const summary: ValuationSummaryDto = {
  itemId: row.id,
  quantity: 3,
  lifecycle: "ACTIVE",
  manualBasis: "PER_UNIT",
  readAt: row.createdAt,
  catalog: null,
  manual: { latest: null, history: { records: [], nextCursor: null } },
  external: {
    scope: "CURRENT_MAPPING",
    availability: "UNLINKED",
    groups: [],
    nextGroupCursor: null,
  },
  aggregate: null,
  currencyConflict: false,
  currencyConflictScope: "LATEST_MANUAL_AND_ALL_ELIGIBLE_EXTERNAL_GROUPS",
};
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function fixture(overrides: Partial<ValuationTransport> = {}) {
  const transport: ValuationTransport = {
    summary: async () => summary,
    source: async () => {
      throw new Error("not expected");
    },
    append: async () => row,
    ...overrides,
  };
  return new ValuationController(transport);
}
const input = { amountMinor: "0", currency: "EUR", note: null };
describe("valuation request authority", () => {
  it("ignores an old GET after append acknowledgement and sends a double click only once", async () => {
    const old = deferred<ValuationSummaryDto>(),
      post = deferred<ManualValuationDto>();
    let gets = 0,
      posts = 0;
    const c = fixture({
      summary: async () =>
        ++gets === 1
          ? old.promise
          : { ...summary, manual: { latest: row, history: { records: [row], nextCursor: null } } },
      append: async () => {
        posts++;
        return post.promise;
      },
    });
    const reading = c.load();
    const saving = c.append(input);
    await c.append(input);
    expect(posts).toBe(1);
    post.resolve(row);
    await saving;
    old.resolve(summary);
    await reading;
    expect(c.state.summary?.manual.latest?.id).toBe(row.id);
    expect(c.state.mutation).toBe("saved");
  });
  it("retains a confirmed row when refresh fails, and retries only GET", async () => {
    let posts = 0;
    const c = fixture({
      summary: async () => {
        throw new Error("offline");
      },
      append: async () => {
        posts++;
        return row;
      },
    });
    await c.append(input);
    expect(c.state.ack?.id).toBe(row.id);
    expect(c.state.mutation).toBe("saved");
    expect(c.state.error).toBe("refreshAfterSave");
    await c.load();
    expect(posts).toBe(1);
    expect(c.state.ack?.id).toBe(row.id);
  });
  it("holds an unknown POST outcome across refresh and requires explicit new-entry action", async () => {
    let posts = 0;
    const c = fixture({
      append: async () => {
        posts++;
        throw new Error("lost response");
      },
    });
    await c.append(input);
    await c.load();
    await c.append(input);
    expect(posts).toBe(1);
    expect(c.state.mutation).toBe("unknown");
    expect(c.state.error).toBe("unknown");
    c.newEntry();
    await c.append(input);
    expect(posts).toBe(2);
  });
  it("makes an inactive rejection authoritative over an earlier ACTIVE read", async () => {
    const old = deferred<ValuationSummaryDto>();
    let gets = 0;
    const c = fixture({
      summary: async () => (++gets === 1 ? old.promise : { ...summary, lifecycle: "ARCHIVED" }),
      append: async () => {
        throw new ValuationHttpError(409, "ITEM_INACTIVE");
      },
    });
    const reading = c.load();
    await c.append(input);
    old.resolve(summary);
    await reading;
    expect(c.state.summary?.lifecycle).toBe("ARCHIVED");
    expect(c.canAppend).toBe(false);
  });
  it("bounds stale-cursor recovery to one fresh summary", async () => {
    let gets = 0;
    const c = fixture({
      summary: async () => {
        gets++;
        throw new ValuationHttpError(409, "VALUATION_CURSOR_STALE");
      },
    });
    await c.load({ manualCursor: "old" });
    expect(gets).toBe(2);
    expect(c.state.error).toBe("mappingChanged");
  });
  it("clears private facts on summary 404, but checks source 404 with a fresh owner summary", async () => {
    let gone = false,
      gets = 0;
    const c = fixture({
      summary: async () => {
        gets++;
        if (gone) throw new ValuationHttpError(404, "NOT_FOUND");
        return summary;
      },
      source: async () => {
        throw new ValuationHttpError(404, "NOT_FOUND");
      },
    });
    await c.load();
    await c.source("selector");
    expect(gets).toBe(2);
    expect(c.state.summary?.itemId).toBe(row.id);
    expect(c.state.source).toBeNull();
    gone = true;
    await c.load();
    expect(c.state.summary).toBeNull();
    expect(c.state.access).toBe("missing");
    expect(c.state.ack).toBeNull();
  });
  it("does not let a previous scope or source overwrite a newer selection", async () => {
    const old = deferred<ValuationSummaryDto>();
    let gets = 0;
    const c = fixture({
      summary: async (options) =>
        ++gets === 1
          ? old.promise
          : { ...summary, external: { ...summary.external, scope: options.scope! } },
    });
    const read = c.load();
    await c.scope("HISTORICAL_MAPPING");
    old.resolve(summary);
    await read;
    expect(c.state.summary?.external.scope).toBe("HISTORICAL_MAPPING");
  });
});
it("allows manual estimates on ACTIVE items despite an inactive catalog variant", async () => {
  const c = fixture({
    summary: async () => ({
      ...summary,
      catalog: { entryId: row.id, variantId: row.id, revision: 2, variantActive: false },
      external: { ...summary.external, availability: "INACTIVE_VARIANT" },
    }),
  });
  await c.load();
  expect(c.canAppend).toBe(true);
  await c.append(input);
  expect(c.state.mutation).toBe("saved");
});
it("a superseded stale-cursor recovery cannot attach its error to a newer successful read", async () => {
  const recovery = deferred<ValuationSummaryDto>(),
    started = deferred<void>();
  let reads = 0;
  const c = fixture({
    summary: async () => {
      reads++;
      if (reads === 1) throw new ValuationHttpError(409, "VALUATION_CURSOR_STALE");
      if (reads === 2) {
        started.resolve();
        return recovery.promise;
      }
      return summary;
    },
  });
  const old = c.load({ manualCursor: "stale" });
  await started.promise;
  await c.load();
  recovery.resolve(summary);
  await old;
  expect(c.state.error).toBe("");
});
it("rejects a source response belonging to a different source key", async () => {
  const key = {
    providerId: "fixture",
    identifierNamespace: "fixture",
    identifierType: "product",
    externalId: "product-1",
    kind: "ASKING_PRICE" as const,
    currency: "EUR",
  };
  const catalog = { entryId: row.id, variantId: null, revision: 2, variantActive: true };
  const c = fixture({
    summary: async () => ({
      ...summary,
      catalog,
      external: {
        ...summary.external,
        availability: "AVAILABLE",
        groups: [{ key, source: "selector", history: { records: [], nextCursor: null } }],
      },
    }),
    source: async () => ({
      itemId: row.id,
      readAt: row.createdAt,
      catalog,
      scope: "CURRENT_MAPPING",
      key: { ...key, externalId: "wrong-product" },
      history: { records: [], nextCursor: null },
    }),
  });
  await c.load();
  await c.source("selector");
  expect(c.state.source).toBeNull();
  expect(c.state.error).toBe("readError");
});
it("retains the mounted manual context while a new external scope loads", async () => {
  const pending = deferred<ValuationSummaryDto>();
  let reads = 0;
  const c = fixture({ summary: async () => (++reads === 1 ? summary : pending.promise) });
  await c.load();
  const changing = c.scope("HISTORICAL_MAPPING");
  expect(c.state.summary?.itemId).toBe(row.id);
  expect(c.state.options.scope).toBe("HISTORICAL_MAPPING");
  expect(c.canAppend).toBe(true);
  pending.resolve({ ...summary, external: { ...summary.external, scope: "HISTORICAL_MAPPING" } });
  await changing;
});
it("reports a later read failure as a read error once a save has been reconciled", async () => {
  let fails = false;
  const c = fixture({
    summary: async () => {
      if (fails) throw new Error("offline");
      return { ...summary, manual: { latest: row, history: { records: [row], nextCursor: null } } };
    },
  });
  await c.append(input);
  expect(c.state.ack).toBeNull();
  fails = true;
  await c.load();
  expect(c.state.error).toBe("readError");
  expect(c.state.mutation).toBe("saved");
});
it("invalidates populated external facts throughout a deferred failed source-404 recheck, then restores only on fresh success", async () => {
  const key = {
    providerId: "fixture",
    identifierNamespace: "fixture",
    identifierType: "product",
    externalId: "product-1",
    kind: "ASKING_PRICE" as const,
    currency: "EUR",
  };
  const catalog = { entryId: row.id, variantId: null, revision: 2, variantActive: true };
  const populated: ValuationSummaryDto = {
    ...summary,
    catalog,
    manual: { latest: row, history: { records: [row], nextCursor: null } },
    currencyConflict: true,
    external: {
      ...summary.external,
      availability: "AVAILABLE",
      groups: [
        {
          key,
          source: "selector",
          history: {
            records: [
              {
                id: row.id,
                source: key,
                sourceMetric: "asking",
                qualifiers: { flag: false },
                minorUnitExponent: 2,
                price: { type: "POINT", amountMinor: "123" },
                observedAt: row.observedAt,
                observedBasis: "SOURCE",
                observedPrecision: "DAY",
                fetchedAt: row.createdAt,
                recordedAt: row.createdAt,
                sourceUrl: null,
                sourceReference: "Synthetic asking",
                confidence: null,
                catalogMatch: {
                  observedRevision: 2,
                  currentRevision: 2,
                  observedIdentifierId: row.id,
                  currentIdentifierId: row.id,
                  revisionChanged: false,
                  identifierRecordChanged: false,
                  identifierActive: true,
                  variantActive: true,
                },
              },
            ],
            nextCursor: null,
          },
        },
      ],
      nextGroupCursor: "next-directory",
    },
  };
  const recheck = deferred<ValuationSummaryDto>(),
    started = deferred<void>();
  let gets = 0,
    sources = 0;
  const c = fixture({
    summary: async () => {
      if (++gets === 2) {
        started.resolve();
        return recheck.promise;
      }
      return populated;
    },
    source: async () => {
      sources++;
      throw new ValuationHttpError(404, "NOT_FOUND");
    },
  });
  await c.load();
  const draftVersion = c.state.draftVersion;
  expect(c.state.summary?.external.groups[0]?.history.records).toHaveLength(1);
  expect(c.state.summary?.currencyConflict).toBe(true);
  const reading = c.source("selector");
  await started.promise;
  expect(c.state.externalInvalidated).toBe(true);
  expect(c.state.summary?.manual.latest?.id).toBe(row.id);
  expect(c.state.draftVersion).toBe(draftVersion);
  expect(c.state.access).toBe("");
  recheck.reject(new Error("offline"));
  await reading;
  expect(c.state.externalInvalidated).toBe(true);
  expect(c.state.error).toBe("mappingChanged");
  expect(c.state.summary?.manual.history.records[0]?.id).toBe(row.id);
  expect(c.state.draftVersion).toBe(draftVersion);
  expect(gets).toBe(2);
  await c.source("selector");
  expect(sources).toBe(1);
  await c.load();
  expect(c.state.externalInvalidated).toBe(false);
  expect(c.state.summary?.external.groups[0]?.history.records[0]?.price).toEqual({
    type: "POINT",
    amountMinor: "123",
  });
  expect(c.state.summary?.currencyConflict).toBe(true);
  expect(c.state.draftVersion).toBe(draftVersion);
  expect(gets).toBe(3);
});
