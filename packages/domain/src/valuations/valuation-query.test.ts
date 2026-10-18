import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createCatalogMaintenanceService } from "../catalog/catalog-service";
import { createCategoryTemplateMaintenanceService } from "../catalog/category-template-service";
import { createItemService } from "../items/item-service";
import { createMarketDataService } from "../market-data/market-data-service";
import { createValuationService } from "./valuation-service";
import { createValuationQuery, type ValuationQueryDatabase } from "./valuation-query";
import { encodeValuationToken } from "./valuation-cursors";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `Comparison_${randomUUID()}`;
const entries: string[] = [];
let collectionId: string, categoryId: string;
let fetchCount = 0;
const registry = new ProviderRegistry([
  {
    provider: {
      id: "fixture",
      fetch: async () => {
        fetchCount++;
        return [];
      },
    },
    identifierNamespace: "fixture",
    identifierType: "product",
  },
]);
const policy = {
  snapshotForOwner: () => [
    {
      providerId: "fixture",
      identifierNamespace: "fixture",
      identifierType: "product",
      allowHistorical: true,
    },
  ],
};
const query = () => createValuationQuery(db!, policy, registry);
const catalog = () => createCatalogMaintenanceService(db!);
const market = () => createMarketDataService(db!, registry);
const items = () => createItemService(db!, ownerId);
async function fixture() {
  const entry = await catalog().createCatalogEntry({
    categoryTemplateId: categoryId,
    text: { language: "en", title: "Comparison" },
  });
  const entryId = entry.state.id;
  entries.push(entryId);
  const identifier = await catalog().addExternalIdentifier(entryId, 1, {
    namespace: "fixture",
    type: "product",
    value: "product-1",
  });
  const item = await items().createItem({ collectionId, title: "Private item", quantity: 3 });
  await items().linkItemToCatalog(item.id, entryId);
  const request = await market().prepareFetchRequest("fixture", {
    entryId,
    variantId: null,
    identifierId: identifier.id,
    pollId: randomUUID(),
  });
  return { itemId: item.id, entryId, identifierId: identifier.id, request };
}
const point = (extra: object = {}) => ({
  externalId: "product-1",
  identity: { mode: "POLL" },
  sourceMetric: "market",
  kind: "SOLD_MEDIAN",
  amountMinor: 9007199254740993n,
  currency: "EUR",
  qualifiers: { flag: false },
  time: { basis: "FETCH", precision: "MILLISECOND" },
  ...extra,
});
async function record(f: Awaited<ReturnType<typeof fixture>>, rows = [point()]) {
  await market().recordObservations("fixture", rows, {
    request: { ...f.request, pollId: randomUUID() },
    fetchedAt: "2025-02-01T00:00:00.000Z",
  });
}
describe.runIf(enabled)("owner valuation comparison PostgreSQL", () => {
  beforeAll(async () => {
    const [guard] = await db!.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() AS name,current_setting('server_version') AS version`;
    expect(guard!.name.endsWith("_test")).toBe(true);
    expect(guard!.version.startsWith("17.")).toBe(true);
    await db!.user.create({
      data: { id: ownerId, name: "Comparison", email: `${ownerId}@example.invalid` },
    });
    collectionId = (await db!.collection.create({ data: { ownerId, name: "Comparison" } })).id;
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: `comparison_${randomUUID().replaceAll("-", "")}`,
        labels: { de: "Vergleich", en: "Comparison" },
      })
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.delete({ where: { id: ownerId } });
    await db.$executeRaw`DELETE FROM "MarketObservation" WHERE "entryId"=ANY(${entries}::uuid[])`;
    await db.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: entries } } });
    await db.catalogVariant.deleteMany({ where: { entryId: { in: entries } } });
    await db.catalogRevision.deleteMany({ where: { entryId: { in: entries } } });
    await db.catalogEntry.deleteMany({ where: { id: { in: entries } } });
    if (categoryId) await db.categoryTemplate.delete({ where: { id: categoryId } });
    await db.$disconnect();
  });
  it("does not calculate a combined total across mixed currencies, including groups outside the first page", async () => {
    const f = await fixture();
    await record(f, [point(), point({ kind: "DEALER_PRICE", currency: "USD" })]);
    await createValuationService(db!, ownerId).addManualValuation(f.itemId, {
      amountMinor: 0n,
      currency: "EUR",
    });
    const s = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { groupLimit: 1 },
    );
    expect(s.aggregate).toBeNull();
    expect(s.currencyConflict).toBe(true);
    expect(s.external.groups).toHaveLength(1);
    expect(s.external.nextGroupCursor).not.toBeNull();
    expect(s.manual.latest).toMatchObject({ amountMinor: "0", basis: "PER_UNIT" });
    expect(s.external.groups[0]!.history.records[0]).toMatchObject({
      price: { type: "POINT", amountMinor: "9007199254740993" },
      qualifiers: { flag: false },
    });
    expect(fetchCount).toBe(0);
  });
  it("keeps all same-currency kinds separate, preserving zero ranges and source metadata", async () => {
    const f = await fixture();
    await record(
      f,
      [
        point(),
        point({ kind: "ASKING_PRICE", amountMinor: 0n }),
        point({
          kind: "PRICE_RANGE",
          amountMinor: undefined,
          lowMinor: 0n,
          highMinor: 9223372036854775807n,
        }),
      ].map((p) =>
        Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
      ) as ReturnType<typeof point>[],
    );
    const s = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(s.currencyConflict).toBe(false);
    expect(s.aggregate).toBeNull();
    expect(s.external.groups).toHaveLength(3);
    expect(
      s.external.groups.find((g) => g.key.kind === "PRICE_RANGE")!.history.records[0],
    ).toMatchObject({ price: { type: "RANGE", lowMinor: "0", highMinor: "9223372036854775807" } });
  });
  it("refreshes latest independently of old manual pages and never multiplies by quantity", async () => {
    const f = await fixture(),
      service = createValuationService(db!, ownerId);
    await service.addManualValuation(f.itemId, {
      amountMinor: 10n,
      currency: "USD",
      observedAt: "0001-01-01T00:00:00.000Z",
    });
    const latest = await service.addManualValuation(f.itemId, {
      amountMinor: 9007199254740993n,
      currency: "EUR",
      observedAt: "2025-01-01T00:00:00.000Z",
    });
    const first = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { manualLimit: 1 },
    );
    const second = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { manualLimit: 1, manualCursor: first.manual.history.nextCursor! },
    );
    expect(second.manual.latest).toMatchObject({ id: latest.id, amountMinor: "9007199254740993" });
    expect(second.manual.history.records[0]).toMatchObject({
      amountMinor: "10",
      observedAt: "0001-01-01T00:00:00.000Z",
    });
    expect(second.currencyConflict).toBe(false);
    expect(second.quantity).toBe(3);
  });
  it("pages source histories with timestamp ties and retains availability beyond the last group", async () => {
    const f = await fixture();
    for (let n = 0; n < 8; n++) await record(f);
    const s = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { groupLimit: 1 },
    );
    const g = s.external.groups[0]!;
    expect(g.history.records).toHaveLength(5);
    expect(g.history.nextCursor).not.toBeNull();
    const tail = await query().getItemValuationSourceHistory(
      f.itemId,
      { userId: ownerId },
      { view: "source-history", source: g.source, cursor: g.history.nextCursor! },
    );
    expect(tail.history.records).toHaveLength(3);
    expect(new Set([...g.history.records, ...tail.history.records].map((r) => r.id)).size).toBe(8);
    expect(tail.history.nextCursor).toBeNull();
  });
  it("keeps current semantic mapping across title edits and identifier replacement, with original provenance", async () => {
    const f = await fixture();
    await record(f);
    await catalog().updateCatalogEntry(f.entryId, 2, {
      text: { language: "en", title: "Edited title" },
    });
    let s = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(s.external.groups[0]!.history.records[0]!.catalogMatch).toMatchObject({
      observedRevision: 2,
      currentRevision: 3,
      revisionChanged: true,
      identifierRecordChanged: false,
    });
    await catalog().removeExternalIdentifier(f.entryId, 3, f.identifierId);
    const replacement = await catalog().addExternalIdentifier(f.entryId, 4, {
      namespace: "fixture",
      type: "product",
      value: "product-1",
    });
    s = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(s.external.groups[0]!.history.records[0]!.catalogMatch).toMatchObject({
      observedIdentifierId: f.identifierId,
      currentIdentifierId: replacement.id,
      identifierRecordChanged: true,
      identifierActive: true,
    });
  });
  it("excludes changed mappings from current scope and shows explicitly permitted historical provenance", async () => {
    const f = await fixture();
    await record(f);
    await catalog().updateExternalIdentifier(f.entryId, 2, f.identifierId, {
      namespace: "fixture",
      type: "product",
      value: "product-2",
    });
    const current = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(current.external.groups).toEqual([]);
    const historical = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { scope: "HISTORICAL_MAPPING" },
    );
    expect(historical.external.groups[0]!.history.records[0]!.catalogMatch).toMatchObject({
      identifierActive: false,
      currentIdentifierId: null,
    });
    const restricted = createValuationQuery(
      db!,
      {
        snapshotForOwner: () =>
          policy.snapshotForOwner().map((g) => ({ ...g, allowHistorical: false })),
      },
      registry,
    );
    expect(
      (
        await restricted.getItemValuationSummary(
          f.itemId,
          { userId: ownerId },
          { scope: "HISTORICAL_MAPPING" },
        )
      ).external.groups,
    ).toEqual([]);
  });
  it("keeps entry-only and exact variants isolated; retired variant history is explicit", async () => {
    const f = await fixture();
    await record(f);
    const variant = await catalog().addCatalogVariant(f.entryId, 2, {
      text: { language: "en", title: "Variant" },
    });
    const identifier = await catalog().addExternalIdentifier(f.entryId, 3, {
      variantId: variant.id,
      namespace: "fixture",
      type: "product",
      value: "variant-1",
    });
    const request = await market().prepareFetchRequest("fixture", {
      entryId: f.entryId,
      variantId: variant.id,
      identifierId: identifier.id,
      pollId: randomUUID(),
    });
    await market().recordObservations(
      "fixture",
      [point({ externalId: "variant-1", currency: "USD" })],
      { request, fetchedAt: "2025-02-01T00:00:00.000Z" },
    );
    expect(
      (await query().getItemValuationSummary(f.itemId, { userId: ownerId })).currencyConflict,
    ).toBe(false);
    await items().linkItemToCatalog(f.itemId, f.entryId, variant.id);
    let s = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(s.external.groups.map((g) => g.key.externalId)).toEqual(["variant-1"]);
    await catalog().rollbackCatalogEntry(f.entryId, 4, 2);
    s = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(s.external.availability).toBe("INACTIVE_VARIANT");
    expect(s.external.groups).toEqual([]);
    const h = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { scope: "HISTORICAL_MAPPING" },
    );
    expect(h.external.groups[0]!.history.records[0]!.catalogMatch.variantActive).toBe(false);
  });
  it("never leaks stored external existence under the default empty policy, including history", async () => {
    const f = await fixture();
    await record(f);
    const visible = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    const empty = createValuationQuery(db!);
    const s = await empty.getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(s.external).toMatchObject({
      availability: "DISPLAY_DISABLED",
      groups: [],
      nextGroupCursor: null,
    });
    expect(s.currencyConflict).toBe(false);
    await expect(
      empty.getItemValuationSourceHistory(
        f.itemId,
        { userId: ownerId },
        { view: "source-history", source: visible.external.groups[0]!.source },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
  });
  it("hides foreign/deleted-parent items but permits archived and disposed reads", async () => {
    const f = await fixture();
    await expect(
      query().getItemValuationSummary(f.itemId, { userId: ownerId.toLowerCase() }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    await items().archiveItem(f.itemId);
    expect((await query().getItemValuationSummary(f.itemId, { userId: ownerId })).lifecycle).toBe(
      "ARCHIVED",
    );
    await db!.collectibleItem.update({ where: { id: f.itemId }, data: { disposedAt: new Date() } });
    expect((await query().getItemValuationSummary(f.itemId, { userId: ownerId })).lifecycle).toBe(
      "DISPOSED",
    );
    await db!.collection.update({ where: { id: collectionId }, data: { deletedAt: new Date() } });
    try {
      await expect(
        query().getItemValuationSummary(f.itemId, { userId: ownerId }),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    } finally {
      await db!.collection.update({ where: { id: collectionId }, data: { deletedAt: null } });
    }
  });
  it("invalidates source selectors after catalog edits or relinking and rejects cross-item cursors", async () => {
    const f = await fixture();
    await record(f);
    const s = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    const source = s.external.groups[0]!.source;
    const other = await fixture();
    await expect(
      query().getItemValuationSourceHistory(
        other.itemId,
        { userId: ownerId },
        { view: "source-history", source },
      ),
    ).rejects.toMatchObject({ code: "VALUATION_INVALID" });
    await catalog().updateCatalogEntry(f.entryId, 2, { text: { language: "en", title: "New" } });
    await expect(
      query().getItemValuationSourceHistory(
        f.itemId,
        { userId: ownerId },
        { view: "source-history", source },
      ),
    ).rejects.toMatchObject({ code: "VALUATION_CURSOR_STALE" });
    await items().unlinkItemFromCatalog(f.itemId);
    await expect(
      query().getItemValuationSourceHistory(
        f.itemId,
        { userId: ownerId },
        { view: "source-history", source },
      ),
    ).rejects.toMatchObject({ code: "VALUATION_CURSOR_STALE" });
  });

  it("reports source availability independently of a group cursor beyond the final group", async () => {
    const f = await fixture();
    await record(f);
    await createValuationService(db!, ownerId).addManualValuation(f.itemId, {
      amountMinor: 1n,
      currency: "EUR",
    });
    const first = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    const token = encodeValuationToken({
      v: 1,
      context: { itemId: f.itemId, entryId: f.entryId, variantId: null, revision: 2 },
      scope: "CURRENT_MAPPING",
      after: first.external.groups[0]!.key,
    });
    const last = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { groupCursor: token },
    );
    expect(last.external.groups).toEqual([]);
    expect(last.external.availability).toBe("AVAILABLE");
  });
  it("validates hidden historical candidates before allowing them to affect currency diversity", async () => {
    const f = await fixture();
    await record(f, [point({ currency: "USD" })]);
    await catalog().updateCatalogEntry(f.entryId, 2, {
      text: { language: "en", title: "Current" },
    });
    await createValuationService(db!, ownerId).addManualValuation(f.itemId, {
      amountMinor: 1n,
      currency: "EUR",
    });
    const corrupt: ValuationQueryDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(q: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
                const rows = await tx.$queryRaw<T>(q, ...values);
                // Simulate a maintenance-corrupted retained snapshot only at the persistence boundary.
                if (
                  q.join("").includes('SELECT snapshot FROM "CatalogRevision"') &&
                  values[1] === 2
                )
                  return [{ snapshot: { schemaVersion: 1, id: f.entryId, identifiers: [] } }] as T;
                return rows;
              },
            }),
          options,
        ),
    };
    const s = await createValuationQuery(corrupt, policy, registry).getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { scope: "HISTORICAL_MAPPING" },
    );
    expect(s.currencyConflict).toBe(false);
    expect(s.external.groups).toEqual([]);
  });
  it("retains one MVCC view while an independent catalog edit and ingestion commit between reads", async () => {
    const f = await fixture();
    await record(f);
    let changed = false;
    const boundary: ValuationQueryDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(q: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
                const rows = await tx.$queryRaw<T>(q, ...values);
                if (
                  !changed &&
                  q.join("").includes('SELECT revision,"categoryTemplateId" FROM "CatalogEntry"')
                ) {
                  changed = true;
                  await catalog().updateCatalogEntry(f.entryId, 2, {
                    text: { language: "en", title: "Concurrent" },
                  });
                  const request = await market().prepareFetchRequest("fixture", {
                    entryId: f.entryId,
                    variantId: null,
                    identifierId: f.identifierId,
                    pollId: randomUUID(),
                  });
                  await market().recordObservations("fixture", [point({ currency: "USD" })], {
                    request,
                    fetchedAt: "2025-03-01T00:00:00.000Z",
                  });
                }
                return rows;
              },
            }),
          options,
        ),
    };
    const s = await createValuationQuery(boundary, policy, registry).getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
    );
    expect(changed).toBe(true);
    expect(s.catalog!.revision).toBe(2);
    expect(s.currencyConflict).toBe(false);
    expect(s.external.groups).toHaveLength(1);
    const after = await query().getItemValuationSummary(f.itemId, { userId: ownerId });
    expect(after.catalog!.revision).toBe(3);
    expect(after.currencyConflict).toBe(true);
  });

  it("serves representative populated reads with index-seeking plans", async () => {
    const f = await fixture();
    const identifiers = [{ id: f.identifierId, value: "product-1" }];
    for (let n = 2; n <= 8; n++) {
      const i = await catalog().addExternalIdentifier(f.entryId, n, {
        namespace: "fixture",
        type: "product",
        value: `product-${n}`,
      });
      identifiers.push({ id: i.id, value: `product-${n}` });
    }
    for (const identifier of identifiers) {
      const request = await market().prepareFetchRequest("fixture", {
        entryId: f.entryId,
        variantId: null,
        identifierId: identifier.id,
        pollId: randomUUID(),
      });
      await market().recordObservations("fixture", [point({ externalId: identifier.value })], {
        request,
        fetchedAt: "2025-02-01T00:00:00.000Z",
      });
    }
    await db!
      .$executeRaw`INSERT INTO "MarketObservation" (id,"providerId","externalId","identityMode","eventId","pollId","sourceMetric",kind,"entryId","variantId","catalogRevision","identifierId","identifierNamespace","identifierType",qualifiers,currency,"minorUnitExponent","amountMinor","lowMinor","highMinor","observedAt","fetchedAt","createdAt","observedBasis","observedPrecision","sourceUrl","sourceReference",confidence)
      SELECT gen_random_uuid(),"providerId","externalId","identityMode","eventId",gen_random_uuid(),"sourceMetric",kind,"entryId","variantId","catalogRevision","identifierId","identifierNamespace","identifierType",qualifiers,currency,"minorUnitExponent","amountMinor","lowMinor","highMinor","observedAt","fetchedAt",date_trunc('milliseconds',clock_timestamp()),"observedBasis","observedPrecision","sourceUrl","sourceReference",confidence FROM "MarketObservation" CROSS JOIN generate_series(1,1000) WHERE "entryId"=${f.entryId}::uuid`;
    await db!.$executeRaw`ANALYZE "MarketObservation"`;
    const plans: Array<{ sql: string; plan: unknown }> = [];
    const seen = new Map<string, number>();
    const measured: ValuationQueryDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(q: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
                const result = await tx.$queryRaw<T>(q, ...values),
                  sql = q.join("?"),
                  signature = sql + JSON.stringify(values.filter((v) => typeof v === "boolean"));
                if (sql.includes('FROM "MarketObservation"') && (seen.get(signature) ?? 0) < 2) {
                  seen.set(signature, (seen.get(signature) ?? 0) + 1);
                  const parts = [...q];
                  parts[0] = "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + parts[0];
                  const explain = Object.assign(parts, {
                    raw: [...parts],
                  }) as unknown as TemplateStringsArray;
                  plans.push({ sql, plan: await tx.$queryRaw(explain, ...values) });
                }
                return result;
              },
            }),
          options,
        ),
    };
    const s = await createValuationQuery(measured, policy, registry).getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { groupLimit: 4 },
    );
    expect(s.external.groups).toHaveLength(4);
    expect(s.external.nextGroupCursor).not.toBeNull();
    expect(s.currencyConflict).toBe(false);
    console.log("TASK4_QUERY_PLANS", JSON.stringify(plans));
    expect(plans.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(plans)).toContain("MarketObservation_source_history_idx");
    expect(JSON.stringify(plans)).not.toContain('\"Node Type\":\"Sort\"');
    expect(JSON.stringify(plans)).not.toContain('\"Node Type\":\"Seq Scan\"');
  });

  it("holds parent/item locks while append waits and returns a coherent pre-append view", async () => {
    const f = await fixture();
    await createValuationService(db!, ownerId).addManualValuation(f.itemId, {
      amountMinor: 1n,
      currency: "EUR",
    });
    let release!: () => void,
      locked!: () => void,
      writerPid = 0;
    const gate = new Promise<void>((r) => (release = r)),
      ready = new Promise<void>((r) => (locked = r));
    const gated: ValuationQueryDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(q: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
                const result = await tx.$queryRaw<T>(q, ...values);
                if (q.join("").includes("SELECT quantity,") && q.join("").includes("FOR SHARE")) {
                  locked();
                  await gate;
                }
                return result;
              },
            }),
          options,
        ),
    };
    const reading = createValuationQuery(gated, policy, registry).getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
    );
    await ready;
    const writing = createValuationService(
      {
        $transaction: (work, options) =>
          db!.$transaction(async (tx) => {
            const [pid] = await tx.$queryRaw<
              Array<{ pid: number }>
            >`SELECT pg_backend_pid() AS pid`;
            writerPid = pid!.pid;
            return work(tx);
          }, options),
      },
      ownerId,
    ).addManualValuation(f.itemId, { amountMinor: 2n, currency: "USD" });
    let blocked = false;
    try {
      const until = performance.now() + 2000;
      while (performance.now() < until) {
        if (writerPid) {
          const [state] = await db!.$queryRaw<
            Array<{ blocked: boolean }>
          >`SELECT cardinality(pg_blocking_pids(${writerPid}))>0 AS blocked`;
          if (state!.blocked) {
            blocked = true;
            break;
          }
        }
        await new Promise<void>((r) => setImmediate(r));
      }
      expect(blocked).toBe(true);
    } finally {
      release();
    }
    const before = await reading;
    await writing;
    expect(before.manual.latest!.amountMinor).toBe("1");
    expect(before.manual.history.records).toHaveLength(1);
    expect(
      (await query().getItemValuationSummary(f.itemId, { userId: ownerId })).manual.latest!
        .amountMinor,
    ).toBe("2");
  });
  it("fails a real lock-budget timeout as unavailability rather than empty data", async () => {
    const f = await fixture();
    let release!: () => void, held!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      ready = new Promise<void>((r) => (held = r));
    const blocking = db!.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Collection" WHERE id=${collectionId}::uuid FOR UPDATE`;
      held();
      await gate;
    });
    await ready;
    try {
      await expect(
        query().getItemValuationSummary(f.itemId, { userId: ownerId }),
      ).rejects.toMatchObject({ code: "VALUATION_UNAVAILABLE" });
    } finally {
      release();
      await blocking;
    }
  });
  it("retries only serialization failures with a fresh complete transaction and stops after three", async () => {
    const f = await fixture();
    let calls = 0;
    const retry: ValuationQueryDatabase = {
      $transaction: async (work, options) => {
        calls++;
        if (calls < 3) throw { code: "P2010", meta: { code: "40001" } };
        return db!.$transaction(work, options);
      },
    };
    expect(
      (await createValuationQuery(retry).getItemValuationSummary(f.itemId, { userId: ownerId }))
        .itemId,
    ).toBe(f.itemId);
    expect(calls).toBe(3);
    calls = 0;
    const exhausted: ValuationQueryDatabase = {
      $transaction: async () => {
        calls++;
        throw { code: "P2010", meta: { code: "40001" } };
      },
    };
    await expect(
      createValuationQuery(exhausted).getItemValuationSummary(f.itemId, { userId: ownerId }),
    ).rejects.toMatchObject({ code: "VALUATION_UNAVAILABLE" });
    expect(calls).toBe(3);
    calls = 0;
    const timeout: ValuationQueryDatabase = {
      $transaction: async () => {
        calls++;
        throw { code: "P2010", meta: { code: "57014" } };
      },
    };
    await expect(
      createValuationQuery(timeout).getItemValuationSummary(f.itemId, { userId: ownerId }),
    ).rejects.toMatchObject({ code: "VALUATION_UNAVAILABLE" });
    expect(calls).toBe(1);
  });
  it("restores session timezone and preserves year0001 native manual and external instants", async () => {
    const f = await fixture();
    await createValuationService(db!, ownerId).addManualValuation(f.itemId, {
      amountMinor: 1n,
      currency: "EUR",
      observedAt: "0001-01-01T00:00:00.000Z",
    });
    await record(f, [
      point({ time: { basis: "SOURCE", precision: "SECOND", value: "0001-01-01T00:00:00.000Z" } }),
    ]);
    const connection = createTestDatabaseClient();
    let duringPid = 0;
    try {
      await connection.$queryRaw`SELECT set_config('TimeZone','Europe/Berlin',false)`;
      const [before] = await connection.$queryRaw<
        Array<{ zone: string; pid: number }>
      >`SELECT current_setting('TimeZone') AS zone,pg_backend_pid() AS pid`;
      const zoned: ValuationQueryDatabase = {
        $transaction: (work, options) =>
          connection.$transaction(async (tx) => {
            const result = await work(tx);
            const [during] = await tx.$queryRaw<
              Array<{ zone: string; pid: number }>
            >`SELECT current_setting('TimeZone') AS zone,pg_backend_pid() AS pid`;
            expect(during!.zone).toBe("UTC");
            duringPid = during!.pid;
            return result;
          }, options),
      };
      const s = await createValuationQuery(zoned, policy, registry).getItemValuationSummary(
        f.itemId,
        { userId: ownerId },
      );
      expect(s.manual.latest!.observedAt).toBe("0001-01-01T00:00:00.000Z");
      expect(s.external.groups[0]!.history.records[0]!.observedAt).toBe("0001-01-01T00:00:00.000Z");
      const [after] = await connection.$queryRaw<
        Array<{ zone: string; pid: number }>
      >`SELECT current_setting('TimeZone') AS zone,pg_backend_pid() AS pid`;
      expect(after!.zone).toBe("Europe/Berlin");
      expect([before!.pid, duringPid, after!.pid]).toEqual([before!.pid, before!.pid, before!.pid]);
    } finally {
      await connection.$disconnect();
    }
  });
  it("rejects malformed/cross-context tokens and inconsistent display grants before database acquisition", async () => {
    let acquisitions = 0;
    const unreachable: ValuationQueryDatabase = {
      $transaction: async () => {
        acquisitions++;
        throw new Error("unexpected acquisition");
      },
    };
    const itemId = randomUUID(),
      q = createValuationQuery(unreachable);
    for (const manualCursor of [
      "=",
      Buffer.from('{"v":1,"v":1}').toString("base64url"),
      "_w",
      encodeValuationToken({
        v: 1,
        itemId: randomUUID(),
        after: {
          observedAt: "2025-01-01T00:00:00.000Z",
          createdAt: "2025-01-02T00:00:00.000Z",
          id: randomUUID(),
        },
      }),
    ])
      await expect(
        q.getItemValuationSummary(itemId, { userId: ownerId }, { manualCursor }),
      ).rejects.toMatchObject({ code: "VALUATION_INVALID" });
    for (const grants of [
      [
        {
          providerId: "fixture",
          identifierNamespace: "wrong",
          identifierType: "product",
          allowHistorical: true,
        },
      ],
      Array.from({ length: 9 }, () => policy.snapshotForOwner()[0]!),
    ])
      await expect(
        createValuationQuery(
          unreachable,
          { snapshotForOwner: () => grants },
          registry,
        ).getItemValuationSummary(itemId, { userId: ownerId }),
      ).rejects.toThrow();
    expect(acquisitions).toBe(0);
  });
  it("fits maximum manual and source-group pages with escaped notes and large metadata", async () => {
    const f = await fixture();
    const note = "\u0001".repeat(2000);
    await db!
      .$executeRaw`INSERT INTO "Valuation" (id,"itemId","ownerId","actorUserId","amountMinor",currency,"minorUnitExponent",note,"observedAt","createdAt") SELECT gen_random_uuid(),${f.itemId}::uuid,${ownerId},${ownerId},9223372036854775807,'EUR',2,${note},'2025-01-01T00:00:00Z'::timestamptz,'2025-01-01T00:00:00Z'::timestamptz FROM generate_series(1,101)`;
    const metadata = {
      qualifiers: Object.fromEntries(
        Array.from({ length: 6 }, (_, n) => [`detail${n}`, "x".repeat(128)]),
      ),
      sourceUrl: "https://example.invalid/" + "a".repeat(1024),
      sourceReference: "r".repeat(512),
      confidence: { methodology: "\n".repeat(512), sampleSize: 0 },
    };
    const kinds = [
      "LAST_SOLD",
      "SOLD_AVERAGE",
      "SOLD_MEDIAN",
      "ASKING_PRICE",
      "CATALOG_VALUE",
      "DEALER_PRICE",
    ];
    const points = [
      ...kinds.map((kind) => point({ ...metadata, kind })),
      point({ ...metadata, kind: "LAST_SOLD", currency: "USD" }),
      point({ ...metadata, kind: "DEALER_PRICE", currency: "USD" }),
    ];
    for (let n = 0; n < 6; n++) await record(f, points);
    const s = await query().getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { manualLimit: 100, groupLimit: 8 },
    );
    expect(s.external.groups).toHaveLength(8);
    expect(s.external.groups.every((g) => g.history.records.length === 5)).toBe(true);
    expect(s.manual.history.records).toHaveLength(100);
    expect(s.manual.history.nextCursor).not.toBeNull();
    expect(s.manual.latest!.note).toBe(note);
    const bytes = Buffer.byteLength(JSON.stringify({ summary: s }));
    expect(bytes).toBeGreaterThan(1200000);
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
    console.log("TASK4_MAX_SUMMARY_RESPONSE_BYTES", bytes);
  });

  it("fails closed on structurally valid but incoherent historical identifier snapshots", async () => {
    const f = await fixture();
    await record(f, [point({ currency: "USD" })]);
    await catalog().updateCatalogEntry(f.entryId, 2, { text: { language: "en", title: "New" } });
    await createValuationService(db!, ownerId).addManualValuation(f.itemId, {
      amountMinor: 1n,
      currency: "EUR",
    });
    const bad: ValuationQueryDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(q: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
                const rows = await tx.$queryRaw<T>(q, ...values);
                if (
                  q.join("").includes('SELECT snapshot FROM "CatalogRevision"') &&
                  values[1] === 2
                ) {
                  const [row] = rows as Array<{ snapshot: { identifiers: unknown[] } }>;
                  row!.snapshot.identifiers.push(row!.snapshot.identifiers[0]!);
                }
                return rows;
              },
            }),
          options,
        ),
    };
    const result = await createValuationQuery(bad, policy, registry).getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
      { scope: "HISTORICAL_MAPPING" },
    );
    expect(result.external.groups).toEqual([]);
    expect(result.currencyConflict).toBe(false);
  });

  it("retries a real item-move serialization race with a fresh parent and snapshot", async () => {
    const f = await fixture(),
      parent = await db!.collection.create({ data: { ownerId, name: "Moved comparison" } });
    let attempts = 0;
    const moving: ValuationQueryDatabase = {
      $transaction: (work, options) => {
        attempts++;
        return db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(q: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
                const result = await tx.$queryRaw<T>(q, ...values);
                if (attempts === 1 && q.join("").includes('SELECT i."collectionId"'))
                  await db!.collectibleItem.update({
                    where: { id: f.itemId },
                    data: { collectionId: parent.id, quantity: 4 },
                  });
                return result;
              },
            }),
          options,
        );
      },
    };
    const result = await createValuationQuery(moving, policy, registry).getItemValuationSummary(
      f.itemId,
      { userId: ownerId },
    );
    expect(attempts).toBe(2);
    expect(result.quantity).toBe(4);
  });
  it("retries a committed parent deletion race then hides the deleted item", async () => {
    const parent = await db!.collection.create({ data: { ownerId, name: "Deleted comparison" } }),
      target = await items().createItem({ collectionId: parent.id, title: "Parent deletion" });
    let attempts = 0;
    const deleting: ValuationQueryDatabase = {
      $transaction: (work, options) => {
        attempts++;
        return db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(q: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
                const result = await tx.$queryRaw<T>(q, ...values);
                if (attempts === 1 && q.join("").includes('SELECT i."collectionId"'))
                  await db!.collection.update({
                    where: { id: parent.id },
                    data: { deletedAt: new Date() },
                  });
                return result;
              },
            }),
          options,
        );
      },
    };
    await expect(
      createValuationQuery(deleting).getItemValuationSummary(target.id, { userId: ownerId }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    expect(attempts).toBe(2);
  });
});
