import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import {
  createCatalogMaintenanceService,
  createCatalogMutationService,
} from "../catalog/catalog-service";
import { createCategoryTemplateMaintenanceService } from "../catalog/category-template-service";
import { createMarketDataService, type MarketDatabase } from "./market-data-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const registry = new ProviderRegistry([
  {
    provider: { id: "fixture", fetch: async () => [] },
    identifierNamespace: "fixture",
    identifierType: "product",
  },
]);
const service = () => createMarketDataService(db!, registry);
const catalog = () => createCatalogMaintenanceService(db!);
let categoryId: string;
const ids: string[] = [];
const point = (extra: object = {}) => ({
  externalId: "product-1",
  identity: { mode: "POLL" },
  sourceMetric: "market",
  kind: "SOLD_MEDIAN",
  amountMinor: 42000n,
  currency: "EUR",
  qualifiers: {},
  time: { basis: "FETCH", precision: "MILLISECOND" },
  ...extra,
});
async function fixture() {
  const entry = await catalog().createCatalogEntry({
    categoryTemplateId: categoryId,
    text: { language: "en", title: "Market fixture" },
  });
  ids.push(entry.state.id);
  const variant = await catalog().addCatalogVariant(entry.state.id, 1, {
    text: { language: "en", title: "Variant" },
  });
  const identifier = await catalog().addExternalIdentifier(entry.state.id, 2, {
    namespace: "fixture",
    type: "product",
    value: "product-1",
    variantId: variant.id,
  });
  const request = await service().prepareFetchRequest("fixture", {
    entryId: entry.state.id,
    variantId: variant.id,
    identifierId: identifier.id,
    pollId: randomUUID(),
  });
  return { request, fetchedAt: "2025-02-01T00:00:00.000Z" };
}
describe.runIf(enabled)("global market observations PostgreSQL", () => {
  beforeAll(async () => {
    const [guard] = await db!.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() AS name,current_setting('server_version') AS version`;
    expect(guard!.name.endsWith("_test")).toBe(true);
    expect(guard!.version.startsWith("17.")).toBe(true);
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: `market_${randomUUID().replaceAll("-", "")}`,
        labels: { de: "Markt", en: "Market" },
      })
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    const [table] = await db.$queryRaw<
      Array<{ exists: boolean }>
    >`SELECT to_regclass('"MarketObservation"') IS NOT NULL AS exists`;
    if (table!.exists)
      await db.$executeRaw`DELETE FROM "MarketObservation" WHERE "entryId"=ANY(${ids}::uuid[])`;
    await db.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogVariant.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogRevision.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogEntry.deleteMany({ where: { id: { in: ids } } });
    await db.categoryTemplate.delete({ where: { id: categoryId } });
    await db.$disconnect();
  });
  it("preserves sold median separately from asking price with exact native bigint values", async () => {
    const context = await fixture();
    await service().recordObservations(
      "fixture",
      [point(), point({ kind: "ASKING_PRICE", amountMinor: 9007199254740993n })],
      context,
    );
    const page = await service().listObservations({
      entryId: context.request.target.entryId,
      variantId: context.request.target.variantId,
      providerId: "fixture",
    });
    expect(page.records.map((row) => [row.kind, row.amountMinor])).toEqual(
      expect.arrayContaining([
        ["SOLD_MEDIAN", 42000n],
        ["ASKING_PRICE", 9007199254740993n],
      ]),
    );
    expect(page.records.every((row) => row.minorUnitExponent === 2)).toBe(true);
  });
  it("preserves all seven kinds, zero ranges, source precision, source qualifiers and ISO scales", async () => {
    const context = await fixture();
    const rows = [
      point({
        kind: "LAST_SOLD",
        currency: "JPY",
        amountMinor: 0n,
        time: { basis: "SOURCE", precision: "DAY", value: "2025-01-01" },
      }),
      point({
        kind: "SOLD_AVERAGE",
        currency: "KWD",
        time: { basis: "SOURCE", precision: "SECOND", value: "2025-01-01T01:00:00.000Z" },
      }),
      point(),
      point({ kind: "ASKING_PRICE" }),
      {
        externalId: "product-1",
        identity: { mode: "POLL" },
        sourceMetric: "range",
        kind: "PRICE_RANGE",
        currency: "CLF",
        lowMinor: 0n,
        highMinor: 9223372036854775807n,
        qualifiers: {},
        time: { basis: "FETCH", precision: "MILLISECOND" },
      },
      point({ kind: "CATALOG_VALUE" }),
      point({
        kind: "DEALER_PRICE",
        qualifiers: { "grading.company": "PSA", "grading.grade": "10", "flag.firstEdition": false },
        confidence: { sampleSize: 0, methodology: "Source\nmethod" },
        sourceUrl: "https://example.org/product/1",
      }),
    ];
    expect(await service().recordObservations("fixture", rows, context)).toMatchObject({
      inserted: 7,
      reused: 0,
    });
    const { records } = await service().listObservations({
      entryId: context.request.target.entryId,
      variantId: context.request.target.variantId,
      providerId: "fixture",
    });
    expect(records).toHaveLength(7);
    expect(records.find((r) => r.kind === "PRICE_RANGE")).toMatchObject({
      amountMinor: null,
      lowMinor: 0n,
      highMinor: 9223372036854775807n,
      minorUnitExponent: 4,
    });
    expect(records.find((r) => r.kind === "LAST_SOLD")).toMatchObject({
      observedBasis: "SOURCE",
      observedPrecision: "DAY",
      minorUnitExponent: 0,
    });
    expect(records.find((r) => r.kind === "SOLD_AVERAGE")).toMatchObject({
      observedPrecision: "SECOND",
      minorUnitExponent: 3,
    });
    expect(records.find((r) => r.kind === "DEALER_PRICE")!.qualifiers).toEqual({
      "flag.firstEdition": false,
      "grading.company": "PSA",
      "grading.grade": "10",
    });
  });
  it("reuses equal poll content and first retrieval time but retains future polls", async () => {
    const context = await fixture();
    const first = await service().recordObservations(
      "fixture",
      [point({ qualifiers: { condition: "NM", flag: false } })],
      context,
    );
    const retry = await service().recordObservations(
      "fixture",
      [point({ qualifiers: { flag: false, condition: "NM" } })],
      { request: context.request, fetchedAt: "2025-03-01T00:00:00.000Z" },
    );
    expect(retry).toEqual({ ids: first.ids, inserted: 0, reused: 1 });
    await service().recordObservations(
      "fixture",
      [point({ qualifiers: { condition: "NM", flag: false } })],
      {
        request: { ...context.request, pollId: randomUUID() },
        fetchedAt: "2025-03-01T00:00:00.000Z",
      },
    );
    const { records } = await service().listObservations({
      entryId: context.request.target.entryId,
      variantId: context.request.target.variantId,
      providerId: "fixture",
    });
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.fetchedAt.toISOString())).toEqual([
      "2025-03-01T00:00:00.000Z",
      "2025-02-01T00:00:00.000Z",
    ]);
  });
  it("preserves event provenance after an unrelated revision and equivalent identifier re-add", async () => {
    const context = await fixture();
    const event = point({
      identity: { mode: "EVENT", eventId: "sale-A" },
      time: { basis: "SOURCE", precision: "MILLISECOND", value: "2025-01-01T01:02:03.456Z" },
    });
    const first = await service().recordObservations("fixture", [event], context);
    await catalog().removeExternalIdentifier(
      context.request.target.entryId,
      3,
      context.request.target.identifierId,
    );
    const added = await catalog().addExternalIdentifier(context.request.target.entryId, 4, {
      namespace: "fixture",
      type: "product",
      value: "product-1",
      variantId: context.request.target.variantId,
    });
    const request = await service().prepareFetchRequest("fixture", {
      entryId: context.request.target.entryId,
      variantId: context.request.target.variantId,
      identifierId: added.id,
      pollId: randomUUID(),
    });
    const retry = await service().recordObservations("fixture", [event], {
      request,
      fetchedAt: context.fetchedAt,
    });
    expect(retry).toEqual({ ids: first.ids, inserted: 0, reused: 1 });
    const { records } = await service().listObservations({
      entryId: context.request.target.entryId,
      variantId: context.request.target.variantId,
      providerId: "fixture",
    });
    expect(records[0]).toMatchObject({
      catalogRevision: 3,
      identifierId: context.request.target.identifierId,
    });
    await expect(
      service().recordObservations("fixture", [{ ...event, amountMinor: 1n }], {
        request,
        fetchedAt: context.fetchedAt,
      }),
    ).rejects.toMatchObject({ code: "MARKET_OBSERVATION_CONFLICT" });
  });
  it("deduplicates equal batch rows and rolls back all rows on a divergent existing identity", async () => {
    const context = await fixture();
    expect(
      await service().recordObservations("fixture", [point(), point()], context),
    ).toMatchObject({ inserted: 1, reused: 0 });
    await expect(
      service().recordObservations(
        "fixture",
        [point({ kind: "ASKING_PRICE" }), point({ amountMinor: 1n })],
        context,
      ),
    ).rejects.toMatchObject({ code: "MARKET_OBSERVATION_CONFLICT" });
    expect(
      (
        await service().listObservations({
          entryId: context.request.target.entryId,
          variantId: context.request.target.variantId,
          providerId: "fixture",
        })
      ).records,
    ).toHaveLength(1);
    await expect(
      service().recordObservations(
        "fixture",
        [point({ kind: "CATALOG_VALUE" }), point({ kind: "CATALOG_VALUE", amountMinor: 2n })],
        context,
      ),
    ).rejects.toMatchObject({ code: "MARKET_OBSERVATION_CONFLICT" });
  });
  it("rejects malformed/private/oversized input atomically and permits an empty result", async () => {
    const context = await fixture();
    for (const bad of [
      { amountMinor: -1n },
      { amountMinor: 9223372036854775808n },
      { amountMinor: 1 },
      { currency: "XDR" },
      { currency: "eur" },
      { kind: "PRICE_RANGE" },
      { kind: "NO_PRICE" },
      { lowMinor: 1n },
      { ownerId: "private" },
      { itemId: randomUUID() },
      { sourceUrl: "https://example.org/api?t=secret" },
      { sourceUrl: "https://user:secret@example.org/" },
      { sourceReference: undefined },
      { externalId: "different" },
      { sourceMetric: "BadMetric" },
      { qualifiers: { condition: "x\n" } },
      { qualifiers: { "condition\n": "NM" } },
      { qualifiers: { value: "\ud800" } },
      { qualifiers: { amount: 10 } },
      { qualifiers: Object.create({ private: true }) },
      { qualifiers: { value: "é".repeat(65) } },
      { confidence: { probability: 0.99 } },
      { confidence: { sampleSize: -1 } },
      { time: { basis: "SOURCE", precision: "DAY", value: "2025-02-30" } },
      { time: { basis: "SOURCE", precision: "DAY", value: "2025-03-01" } },
      { time: { basis: "SOURCE", precision: "SECOND", value: "2025-01-01T00:00:00.001Z" } },
      { time: { basis: "FETCH", precision: "DAY" } },
    ])
      await expect(
        service().recordObservations(
          "fixture",
          [point({ kind: "ASKING_PRICE" }), point(bad)],
          context,
        ),
      ).rejects.toThrow();
    await expect(
      service().recordObservations(
        "fixture",
        Array.from({ length: 101 }, () => point()),
        context,
      ),
    ).rejects.toThrow();
    await expect(service().recordObservations("unknown", [], context)).rejects.toThrow();
    expect(await service().recordObservations("fixture", [], context)).toEqual({
      ids: [],
      inserted: 0,
      reused: 0,
    });
    expect(
      (
        await service().listObservations({
          entryId: context.request.target.entryId,
          variantId: context.request.target.variantId,
          providerId: "fixture",
        })
      ).records,
    ).toEqual([]);
  });
  it("rejects stale revisions and entry-to-variant inference and preserves historical rows after retirement", async () => {
    const context = await fixture();
    await service().recordObservations("fixture", [point()], context);
    await catalog().updateCatalogEntry(context.request.target.entryId, 3, {
      text: { language: "en", title: "Changed" },
    });
    await expect(service().recordObservations("fixture", [point()], context)).rejects.toMatchObject(
      { code: "MARKET_CATALOG_STALE" },
    );
    await expect(service().recordObservations("fixture", [], context)).rejects.toMatchObject({
      code: "MARKET_CATALOG_STALE",
    });
    const entryIdentifier = await catalog().addExternalIdentifier(
      context.request.target.entryId,
      4,
      { namespace: "fixture", type: "product", value: "entry-product" },
    );
    await expect(
      service().prepareFetchRequest("fixture", {
        entryId: context.request.target.entryId,
        variantId: context.request.target.variantId,
        identifierId: entryIdentifier.id,
        pollId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "MARKET_CATALOG_MISMATCH" });
    await catalog().removeExternalIdentifier(
      context.request.target.entryId,
      5,
      context.request.target.identifierId,
    );
    await expect(
      service().prepareFetchRequest("fixture", {
        entryId: context.request.target.entryId,
        variantId: context.request.target.variantId,
        identifierId: context.request.target.identifierId,
        pollId: randomUUID(),
      }),
    ).rejects.toThrow();
    expect(
      (
        await service().listObservations({
          entryId: context.request.target.entryId,
          variantId: context.request.target.variantId,
          providerId: "fixture",
        })
      ).records,
    ).toHaveLength(1);
  });
  it("serializes equal and conflicting concurrent observations without overwriting", async () => {
    const context = await fixture();
    const equal = await Promise.all([
      service().recordObservations("fixture", [point(), point({ kind: "ASKING_PRICE" })], context),
      service().recordObservations("fixture", [point({ kind: "ASKING_PRICE" }), point()], context),
    ]);
    expect(equal.map((r) => r.inserted).sort()).toEqual([0, 2]);
    const next = {
      request: { ...context.request, pollId: randomUUID() },
      fetchedAt: context.fetchedAt,
    };
    const conflict = await Promise.allSettled([
      service().recordObservations("fixture", [point()], next),
      service().recordObservations("fixture", [point({ amountMinor: 123n })], next),
    ]);
    expect(conflict.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(conflict.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "MARKET_OBSERVATION_CONFLICT" },
    });
  });
  it("belongs to its enclosing transaction and pages by exact stable timestamp/id order", async () => {
    const context = await fixture();
    await expect(
      db!.$transaction(async (tx) => {
        await service().recordObservationsInTransaction(tx, "fixture", [point()], context);
        throw new Error("caller rollback");
      }),
    ).rejects.toThrow("caller rollback");
    expect(
      (
        await service().listObservations({
          entryId: context.request.target.entryId,
          variantId: context.request.target.variantId,
          providerId: "fixture",
        })
      ).records,
    ).toHaveLength(0);
    await service().recordObservations(
      "fixture",
      [point(), point({ kind: "ASKING_PRICE" }), point({ kind: "CATALOG_VALUE" })],
      context,
    );
    const filter = {
      entryId: context.request.target.entryId,
      variantId: context.request.target.variantId,
      providerId: "fixture",
      limit: 2,
    };
    const first = await service().listObservations(filter);
    const last = await service().listObservations({ ...filter, cursor: first.nextCursor });
    expect(first.records).toHaveLength(2);
    expect(last.records).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
    expect(new Set([...first.records, ...last.records].map((r) => r.id)).size).toBe(3);
    await expect(service().listObservations({ ...filter, limit: 101 })).rejects.toThrow();
  });

  it("enforces native constraints and identity uniqueness even when service validation is bypassed", async () => {
    const context = await fixture();
    const result = await service().recordObservations(
      "fixture",
      [point({ qualifiers: { condition: "NM", flag: false } })],
      context,
    );
    const [original] = await db!.$queryRaw<
      Array<Record<string, unknown>>
    >`SELECT to_jsonb(o) AS value FROM "MarketObservation" o WHERE id=${result.ids[0]}::uuid`;
    const base = original!.value as Record<string, unknown>;
    const insert = (overrides: Record<string, unknown>) =>
      db!
        .$executeRaw`INSERT INTO "MarketObservation" SELECT * FROM jsonb_populate_record(NULL::"MarketObservation",${JSON.stringify({ ...base, id: randomUUID(), pollId: randomUUID(), ...overrides })}::jsonb)`;
    // A real valid direct insertion must succeed, so a missing table/fixture cannot make rejection tests pass.
    await insert({});
    for (const bad of [
      { amountMinor: "-1" },
      { amountMinor: null },
      { lowMinor: "1" },
      { kind: "PRICE_RANGE" },
      { kind: "PRICE_RANGE", amountMinor: null, lowMinor: "2", highMinor: "1" },
      { currency: "EUR", minorUnitExponent: 3 },
      { currency: "XDR", minorUnitExponent: 2 },
      { observedAt: "infinity" },
      { createdAt: "10000-01-01T00:00:00Z" },
      { fetchedAt: "2024-01-01T00:00:00Z" },
      { observedPrecision: "DAY" },
      { observedBasis: "SOURCE", observedPrecision: "DAY", observedAt: "2025-01-01T01:00:00Z" },
      {
        observedBasis: "SOURCE",
        observedPrecision: "SECOND",
        observedAt: "2025-01-01T00:00:00.001Z",
      },
      { identityMode: "EVENT", eventId: null },
      { eventId: "unexpected" },
      { providerId: "Bad Provider" },
      { externalId: "different" },
      { sourceMetric: "BadMetric" },
      { qualifiers: [] },
      { qualifiers: { condition: "x\n" } },
      { qualifiers: { "condition\n": "NM" } },
      { qualifiers: { value: "\ud800" } },
      { qualifiers: { grade: 1 } },
      { confidence: { probability: 0.99 } },
      { confidence: { sampleSize: -1 } },
      { sourceUrl: "https://example.org/?token=secret" },
      { catalogRevision: 99 },
      { identifierId: randomUUID() },
      { variantId: randomUUID() },
    ])
      await expect(insert(bad)).rejects.toThrow();
    await expect(
      insert({ pollId: base.pollId, qualifiers: { flag: false, condition: "NM" } }),
    ).rejects.toThrow();
    await expect(
      db!
        .$executeRaw`UPDATE "MarketObservation" SET "amountMinor"="amountMinor" WHERE id=${result.ids[0]}::uuid`,
    ).rejects.toThrow();
    await db!
      .$executeRaw`DELETE FROM "MarketObservation" WHERE id=${result.ids[0]}::uuid AND "providerId"='fixture'`;
    await catalog().removeExternalIdentifier(
      context.request.target.entryId,
      3,
      context.request.target.identifierId,
    );
    await expect(insert({})).rejects.toThrow();
  });
  it("uses one backend for UTC-local isolation and year0001 timestamp round trips", async () => {
    const context = await fixture();
    const connection = createTestDatabaseClient();
    try {
      await connection.$queryRaw`SELECT set_config('TimeZone','Europe/Berlin',false)`;
      let duringPid: number | undefined;
      const zoned: MarketDatabase = {
        $transaction: (work, options) =>
          connection.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('TimeZone','Europe/Berlin',true)`;
            const result = await work(tx);
            const [during] = await tx.$queryRaw<
              Array<{ zone: string; pid: number }>
            >`SELECT current_setting('TimeZone') AS zone,pg_backend_pid() AS pid`;
            expect(during!.zone).toBe("UTC");
            duringPid = during!.pid;
            return result;
          }, options),
      };
      const [before] = await connection.$queryRaw<
        Array<{ zone: string; pid: number }>
      >`SELECT current_setting('TimeZone') AS zone,pg_backend_pid() AS pid`;
      const local = createMarketDataService(zoned, registry);
      await local.recordObservations(
        "fixture",
        [
          point({
            time: { basis: "SOURCE", precision: "MILLISECOND", value: "0001-01-01T00:00:00.000Z" },
          }),
        ],
        context,
      );
      const [after] = await connection.$queryRaw<
        Array<{ zone: string; pid: number }>
      >`SELECT current_setting('TimeZone') AS zone,pg_backend_pid() AS pid`;
      expect(before!.zone).toBe("Europe/Berlin");
      expect(after).toEqual(before);
      expect(duringPid).toBe(before!.pid);
      const { records } = await local.listObservations({
        entryId: context.request.target.entryId,
        variantId: context.request.target.variantId,
        providerId: "fixture",
      });
      expect(records[0]!.observedAt.toISOString()).toBe("0001-01-01T00:00:00.000Z");
      expect(records[0]!.fetchedAt.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    } finally {
      await connection.$disconnect();
    }
  });
  it("waits for a catalog writer then rejects its stale fetched result", async () => {
    const context = await fixture();
    const gate = barrier();
    const writer = db!.$transaction(async (tx) => {
      await createCatalogMutationService(tx).updateCatalogEntry(context.request.target.entryId, 3, {
        text: { language: "en", title: "Concurrent edit" },
      });
      gate.reached();
      await gate.held;
    });
    await gate.locked;
    const ingestion = service()
      .recordObservations("fixture", [point()], context)
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await expectCatalogWait();
    } finally {
      gate.release();
    }
    await writer;
    expect(await ingestion).toMatchObject({ error: { code: "MARKET_CATALOG_STALE" } });
    expect(
      await db!.marketObservation.count({ where: { entryId: context.request.target.entryId } }),
    ).toBe(0);
  });
  it("holds catalog parents through insertion while retirement waits, retaining coherent history", async () => {
    const context = await fixture();
    const gate = barrier();
    const paused: MarketDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              async $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
                const result = await tx.$queryRaw<T>(query, ...values);
                if (query.join("").includes('INSERT INTO "MarketObservation"')) {
                  gate.reached();
                  await gate.held;
                }
                return result;
              },
            }),
          options,
        ),
    };
    const ingestion = createMarketDataService(paused, registry).recordObservations(
      "fixture",
      [point()],
      context,
    );
    await gate.locked;
    const retirement = catalog()
      .rollbackCatalogEntry(context.request.target.entryId, 3, 1)
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await expectCatalogWait();
    } finally {
      gate.release();
    }
    await ingestion;
    expect(await retirement).toHaveProperty("value");
    const [row] = await db!.marketObservation.findMany({
      where: { entryId: context.request.target.entryId },
    });
    expect(row).toMatchObject({ catalogRevision: 3, variantId: context.request.target.variantId });
    expect(
      await db!.catalogVariant.findUnique({ where: { id: context.request.target.variantId! } }),
    ).toMatchObject({ active: false });
    await expect(service().recordObservations("fixture", [point()], context)).rejects.toThrow();
  });
});

function barrier() {
  let release!: () => void, reached!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    reached = resolve;
  });
  return { release, reached, held, locked };
}
async function expectCatalogWait() {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [r] = await db!.$queryRaw<
      Array<{ waiting: boolean }>
    >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%CatalogEntry%') AS waiting`;
    if (r!.waiting) return;
  }
  throw new Error("Expected a real PostgreSQL catalog lock wait");
}
