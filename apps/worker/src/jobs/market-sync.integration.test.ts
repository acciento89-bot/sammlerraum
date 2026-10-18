import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import {
  createMarketDataService,
  type MarketDatabase,
} from "@sammlerraum/domain/market-data/market-data-service";
import { createMarketSyncRepository } from "./market-sync-repository";
import { createPgBossServices, ensureExclusiveQueue } from "@sammlerraum/queue";
import { composeMarketSync } from "./market-sync-runtime";
import { createMarketSyncDispatcher } from "./market-sync-dispatcher";
import { createMarketSyncHandler } from "./sync-market-data";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const queues = enabled ? createPgBossServices(process.env.DATABASE_URL!) : undefined;
let originalCursor: Record<string, unknown> | undefined;
const providerId = `sync_${randomUUID().replaceAll("-", "")}`;
const fetch = vi.fn(async () => [] as ReturnType<typeof point>[]);
const registry = new ProviderRegistry([
  {
    provider: { id: providerId, fetch },
    identifierNamespace: "sync_fixture",
    identifierType: "product",
  },
]);
const catalog = () => createCatalogMaintenanceService(db!);
const ids: string[] = [];
let categoryId: string;
const repository = () => createMarketSyncRepository(db!, registry);
function point() {
  return {
    externalId: "sale-123",
    identity: { mode: "POLL" as const },
    sourceMetric: "guide",
    kind: "CATALOG_VALUE" as const,
    amountMinor: 9007199254740993n,
    currency: "EUR",
    qualifiers: {},
    time: { basis: "FETCH" as const, precision: "MILLISECOND" as const },
  };
}
async function fixture() {
  const e = await catalog().createCatalogEntry({
    categoryTemplateId: categoryId,
    text: { language: "en", title: "Sync fixture" },
  });
  ids.push(e.state.id);
  const i = await catalog().addExternalIdentifier(e.state.id, 1, {
    namespace: "sync_fixture",
    type: "product",
    value: "sale-123",
  });
  return {
    providerId,
    ...(await createMarketDataService(db!, registry).prepareFetchRequest(providerId, {
      entryId: e.state.id,
      variantId: null,
      identifierId: i.id,
      pollId: randomUUID(),
    })),
  };
}
describe.runIf(enabled)("market sync PostgreSQL", () => {
  beforeAll(async () => {
    const [g] = await db!.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() name,current_setting('server_version') version`;
    expect(g!.name.endsWith("_test")).toBe(true);
    expect(g!.version.startsWith("17.")).toBe(true);
    await queues!.runtime.start();
    await ensureExclusiveQueue(queues!.producerBackend as never, "market.sync");
    originalCursor = (
      await queues!.producerBackend
        .getDb()
        .executeSql(`SELECT * FROM "MarketSyncDispatchState" WHERE id='market.sync'`)
    ).rows[0];
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: `sync_${randomUUID().replaceAll("-", "")}`,
        labels: { en: "Sync", de: "Sync" },
      })
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    await queues!.producerBackend
      .getDb()
      .executeSql(`DELETE FROM pgboss.job WHERE name='market.sync' AND data->>'providerId'=$1`, [
        providerId,
      ]);
    if (originalCursor)
      await queues!.producerBackend
        .getDb()
        .executeSql(
          `UPDATE "MarketSyncDispatchState" SET "cursorProviderId"=$1,"cursorIdentifierId"=$2,"nextDispatchAt"=$3 WHERE id='market.sync'`,
          [
            originalCursor.cursorProviderId,
            originalCursor.cursorIdentifierId,
            originalCursor.nextDispatchAt,
          ],
        );
    await queues!.runtime.stop();
    const [t] = await db.$queryRaw<
      Array<{ exists: boolean }>
    >`SELECT to_regclass('"MarketSyncReceipt"') IS NOT NULL AS exists`;
    if (t!.exists)
      await db.$executeRaw`DELETE FROM "MarketSyncReceipt" WHERE "providerId"=${providerId}`;
    await db.$executeRaw`DELETE FROM "MarketObservation" WHERE "providerId"=${providerId}`;
    await db.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogRevision.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogEntry.deleteMany({ where: { id: { in: ids } } });
    if (categoryId) await db.categoryTemplate.delete({ where: { id: categoryId } });
    await db.$disconnect();
  });
  it("atomically receipts exact bigint observations and skips committed retry before catalog validation", async () => {
    const p = await fixture();
    fetch.mockResolvedValue([point()]);
    fetch.mockClear();
    const repo = repository();
    const handler = createMarketSyncHandler({
      registry,
      repository: repo,
      enabled: () => true,
      logger: { error: vi.fn() },
    });
    await handler(p, { signal: new AbortController().signal });
    await catalog().updateCatalogEntry(p.target.entryId, p.target.revision, {
      text: { language: "en", title: "Changed" },
    });
    await handler(p, { signal: new AbortController().signal });
    expect(fetch).toHaveBeenCalledTimes(1);
    const rows = await db!.$queryRaw<
      Array<{ amountMinor: bigint }>
    >`SELECT "amountMinor" FROM "MarketObservation" WHERE "providerId"=${providerId} AND "pollId"=${p.pollId}::uuid`;
    expect(rows).toEqual([{ amountMinor: 9007199254740993n }]);
  });
  it("receipts empty success and rejects divergent same-poll request", async () => {
    const p = await fixture(),
      repo = repository();
    await repo.commit(p, [], new Date().toISOString());
    expect(await repo.find(p)).toEqual({ request: p });
    await expect(
      repo.commit(
        { ...p, target: { ...p.target, revision: p.target.revision + 1 } },
        [],
        new Date().toISOString(),
      ),
    ).rejects.toThrow("MARKET_SYNC_IDENTITY_CONFLICT");
  });
  it("counts empty success as zero and reused unique events once in a later receipt", async () => {
    const p = await fixture(),
      repo = repository();
    await repo.commit(p, [], new Date().toISOString());
    const next = { ...p, pollId: randomUUID() },
      later = { ...p, pollId: randomUUID() },
      event = { ...point(), identity: { mode: "EVENT" as const, eventId: "stable-sale" } };
    await repo.commit(next, [event, event], new Date().toISOString());
    await repo.commit(later, [event], new Date().toISOString());
    const rows = await db!.$queryRaw<
      Array<{ pollId: string; observationCount: number }>
    >`SELECT "pollId","observationCount" FROM "MarketSyncReceipt" WHERE "providerId"=${providerId} AND "pollId"=ANY(${[p.pollId, next.pollId, later.pollId]}::uuid[])`;
    expect(new Map(rows.map((row) => [row.pollId, row.observationCount]))).toEqual(
      new Map([
        [p.pollId, 0],
        [next.pollId, 1],
        [later.pollId, 1],
      ]),
    );
  });
  it("serializes equal concurrent polls to one receipt and one observation", async () => {
    const p = await fixture(),
      repo = repository();
    await Promise.all([
      repo.commit(p, [point()], new Date().toISOString()),
      repo.commit(p, [point()], new Date().toISOString()),
    ]);
    const [r] = await db!.$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int count FROM "MarketObservation" WHERE "providerId"=${providerId} AND "pollId"=${p.pollId}::uuid`;
    expect(r!.count).toBe(1);
  });
  it("rolls back newly ingested observations when receipt insertion fails", async () => {
    const p = await fixture();
    const failing: MarketDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async (query, ...values) => {
                if (query.join("").includes('INSERT INTO "MarketSyncReceipt"'))
                  throw new Error("injected receipt failure");
                return tx.$queryRaw(query, ...values);
              },
            }),
          options,
        ),
    };
    await expect(
      createMarketSyncRepository(failing, registry).commit(p, [point()], new Date().toISOString()),
    ).rejects.toThrow("injected");
    expect(await repository().find(p)).toBeNull();
    const [r] = await db!.$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int count FROM "MarketObservation" WHERE "providerId"=${providerId} AND "pollId"=${p.pollId}::uuid`;
    expect(r!.count).toBe(0);
  });
  it("rejects native UPDATE and malformed receipt while allowing scoped fixture deletion", async () => {
    const p = await fixture();
    await repository().commit(p, [], new Date().toISOString());
    await expect(
      db!
        .$executeRaw`UPDATE "MarketSyncReceipt" SET "observationCount"="observationCount" WHERE "providerId"=${providerId} AND "pollId"=${p.pollId}::uuid`,
    ).rejects.toThrow();
    await expect(
      db!
        .$executeRaw`INSERT INTO "MarketSyncReceipt" ("providerId","pollId",request,"fetchedAt","recordedAt","observationCount") VALUES (${providerId},${randomUUID()}::uuid,${JSON.stringify({ ...p, privateItem: "secret" })}::jsonb,now(),now(),0)`,
    ).rejects.toThrow();
    expect(
      await db!
        .$executeRaw`DELETE FROM "MarketSyncReceipt" WHERE "providerId"=${providerId} AND "pollId"=${p.pollId}::uuid`,
    ).toBe(1);
  });

  it("terminally skips a stale uncommitted request before fetching, including empty results", async () => {
    const p = await fixture();
    await catalog().updateCatalogEntry(p.target.entryId, p.target.revision, {
      text: { language: "en", title: "New revision" },
    });
    fetch.mockClear();
    fetch.mockResolvedValue([]);
    const logger = { error: vi.fn() };
    await createMarketSyncHandler({
      registry,
      repository: repository(),
      enabled: () => true,
      logger,
    })(p, { signal: new AbortController().signal });
    expect(fetch).not.toHaveBeenCalled();
    expect(await repository().find(p)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Market sync skipped: MARKET_CATALOG_STALE");
  });
  it("waits on real advisory serialization and permits only one conflicting request", async () => {
    const first = await fixture(),
      second = { ...(await fixture()), pollId: first.pollId };
    let unlock!: () => void, locked!: () => void;
    const release = new Promise<void>((r) => (unlock = r)),
      ready = new Promise<void>((r) => (locked = r));
    let blockerPid = 0;
    const blocking = db!.$transaction(
      async (tx) => {
        const [pid] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
        blockerPid = pid!.pid;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`market.sync:${providerId}:${first.pollId}`},0))::text`;
        locked();
        await release;
      },
      { timeout: 10000 },
    );
    await ready;
    const outcomes = Promise.allSettled([
      repository().commit(first, [], new Date().toISOString()),
      repository().commit(second, [], new Date().toISOString()),
    ]);
    try {
      await vi.waitFor(
        async () => {
          const [r] = await db!.$queryRaw<
            Array<{ count: number }>
          >`SELECT count(*)::int count FROM pg_stat_activity WHERE ${blockerPid}=ANY(pg_blocking_pids(pid))`;
          expect(r!.count).toBe(2);
        },
        { timeout: 2000, interval: 20 },
      );
    } finally {
      unlock();
      await blocking;
    }
    const result = await outcomes;
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected").map((r) => String(r.reason))).toEqual([
      "Error: MARKET_SYNC_IDENTITY_CONFLICT",
    ]);
  });
  it("rejects native missing/private keys, invalid time/count, and PK/request disagreement", async () => {
    const p = await fixture();
    const mutations = [
      (v: typeof p) => ({ ...v, privateItem: "x" }),
      (v: typeof p) => ({ ...v, pollId: randomUUID() }),
      (v: typeof p) => ({ ...v, target: { ...v.target, variantId: undefined } }),
      (v: typeof p) => ({ ...v, target: { ...v.target, revision: 0 } }),
      (v: typeof p) => ({ ...v, target: { ...v.target, externalId: "x".repeat(257) } }),
    ];
    for (const mutate of mutations) {
      const v = { ...p, pollId: randomUUID() };
      await expect(
        db!
          .$executeRaw`INSERT INTO "MarketSyncReceipt" ("providerId","pollId",request,"fetchedAt","recordedAt","observationCount") VALUES (${providerId},${v.pollId}::uuid,${JSON.stringify(mutate(v))}::jsonb,now(),now(),0)`,
      ).rejects.toThrow();
    }
    for (const count of [-1, 101]) {
      const v = { ...p, pollId: randomUUID() };
      await expect(
        db!
          .$executeRaw`INSERT INTO "MarketSyncReceipt" ("providerId","pollId",request,"fetchedAt","recordedAt","observationCount") VALUES (${providerId},${v.pollId}::uuid,${JSON.stringify(v)}::jsonb,now(),now(),${count})`,
      ).rejects.toThrow();
    }
    const v = { ...p, pollId: randomUUID() };
    await expect(
      db!
        .$executeRaw`INSERT INTO "MarketSyncReceipt" ("providerId","pollId",request,"fetchedAt","recordedAt","observationCount") VALUES (${providerId},${v.pollId}::uuid,${JSON.stringify(v)}::jsonb,'infinity'::timestamptz,now(),0)`,
    ).rejects.toThrow();
  });
  it("keeps receipt UTC local on a dedicated backend and preserves year0001", async () => {
    const p = await fixture(),
      dedicated = createTestDatabaseClient();
    try {
      await dedicated.$queryRaw`SELECT set_config('TimeZone','Europe/Berlin',false)`;
      const [before] = await dedicated.$queryRaw<
        Array<{ pid: number; zone: string }>
      >`SELECT pg_backend_pid() pid,current_setting('TimeZone') zone`;
      let inside: { pid: number; zone: string } | undefined;
      const wrapped: MarketDatabase = {
        $transaction: (work, options) =>
          dedicated.$transaction(async (tx) => {
            const result = await work(tx);
            [inside] = await tx.$queryRaw<
              Array<{ pid: number; zone: string }>
            >`SELECT pg_backend_pid() pid,current_setting('TimeZone') zone`;
            return result;
          }, options),
      };
      await createMarketSyncRepository(wrapped, registry).commit(p, [], "0001-01-01T00:00:00.000Z");
      const [after] = await dedicated.$queryRaw<
        Array<{ pid: number; zone: string; stamp: string }>
      >`SELECT pg_backend_pid() pid,current_setting('TimeZone') zone,to_char("fetchedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') stamp FROM "MarketSyncReceipt" WHERE "providerId"=${providerId} AND "pollId"=${p.pollId}::uuid`;
      expect([before!.pid, inside!.pid, after!.pid]).toEqual([
        before!.pid,
        before!.pid,
        before!.pid,
      ]);
      expect([before!.zone, inside!.zone, after!.zone]).toEqual([
        "Europe/Berlin",
        "UTC",
        "Europe/Berlin",
      ]);
      expect(after!.stamp).toBe("0001-01-01T00:00:00.000Z");
    } finally {
      await dedicated.$disconnect();
    }
  });
  async function resetDispatch() {
    await queues!.producerBackend
      .getDb()
      .executeSql(`DELETE FROM pgboss.job WHERE name='market.sync' AND data->>'providerId'=$1`, [
        providerId,
      ]);
    await queues!.producerBackend
      .getDb()
      .executeSql(
        `UPDATE "MarketSyncDispatchState" SET "cursorProviderId"=NULL,"cursorIdentifierId"=NULL,"nextDispatchAt"='0001-01-01Z' WHERE id='market.sync'`,
      );
  }
  const dispatcher = (extra: Partial<Parameters<typeof createMarketSyncDispatcher>[0]> = {}) =>
    createMarketSyncDispatcher({
      backend: queues!.producerBackend,
      database: db!,
      registry,
      providerIds: [providerId],
      enabled: true,
      logger: { error: vi.fn() },
      ...extra,
    });
  const jobs = async () =>
    (
      await queues!.producerBackend
        .getDb()
        .executeSql(
          `SELECT id,data,state,retry_limit,retry_delay,retry_backoff,retry_delay_max,expire_seconds,deletion_seconds,keep_until,created_on FROM pgboss.job WHERE name='market.sync' AND data->>'providerId'=$1`,
          [providerId],
        )
    ).rows;
  it("enforces shared admission cap including active work and preserves retry policy", async () => {
    await resetDispatch();
    await Promise.all([
      dispatcher({ maxPending: 1 }).dispatchOnce(),
      dispatcher({ maxPending: 1 }).dispatchOnce(),
    ]);
    const rows = await jobs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      retry_limit: 2,
      retry_delay: 30,
      retry_backoff: true,
      retry_delay_max: 300,
      expire_seconds: 120,
      deletion_seconds: 604800,
    });
    expect(new Date(rows[0].keep_until).getTime() - new Date(rows[0].created_on).getTime()).toBe(
      86400000,
    );
    await queues!.producerBackend
      .getDb()
      .executeSql(`UPDATE pgboss.job SET state='active' WHERE name='market.sync' AND id=$1`, [
        rows[0].id,
      ]);
    await queues!.producerBackend
      .getDb()
      .executeSql(
        `UPDATE "MarketSyncDispatchState" SET "nextDispatchAt"='0001-01-01Z' WHERE id='market.sync'`,
      );
    await dispatcher({ maxPending: 1 }).dispatchOnce();
    expect(await jobs()).toHaveLength(1);
  });
  it("rolls back queue insertion with cursor when send fails after inserting", async () => {
    await resetDispatch();
    const backend = queues!.producerBackend;
    const broken = {
      getDb: () => backend.getDb(),
      send: async (...args: Parameters<typeof backend.send>) => {
        await backend.send(...args);
        throw new Error("injected send failure");
      },
    };
    await expect(dispatcher({ backend: broken }).dispatchOnce()).rejects.toThrow("injected");
    expect(await jobs()).toHaveLength(0);
    const [state] = (
      await backend
        .getDb()
        .executeSql(
          `SELECT "cursorIdentifierId" FROM "MarketSyncDispatchState" WHERE id='market.sync'`,
        )
    ).rows;
    expect(state.cursorIdentifierId).toBeNull();
  });
  it("keeps hourly suppression after completion and resumes persisted cursor after restart", async () => {
    await resetDispatch();
    await dispatcher({ batchSize: 1 }).dispatchOnce();
    const [first] = await jobs();
    await queues!.producerBackend
      .getDb()
      .executeSql(
        `UPDATE pgboss.job SET state='completed',completed_on=clock_timestamp() WHERE name='market.sync' AND id=$1`,
        [first.id],
      );
    await queues!.producerBackend
      .getDb()
      .executeSql(
        `UPDATE "MarketSyncDispatchState" SET "cursorProviderId"=NULL,"cursorIdentifierId"=NULL,"nextDispatchAt"='0001-01-01Z' WHERE id='market.sync'`,
      );
    await dispatcher({ batchSize: 1 }).dispatchOnce();
    expect(await jobs()).toHaveLength(1);
    await queues!.producerBackend
      .getDb()
      .executeSql(
        `UPDATE "MarketSyncDispatchState" SET "nextDispatchAt"='0001-01-01Z' WHERE id='market.sync'`,
      );
    await dispatcher({ batchSize: 1 }).dispatchOnce();
    const rows = await jobs();
    expect(rows).toHaveLength(2);
    expect(rows[0].data.pollId).not.toBe(rows[1].data.pollId);
    expect(rows[0].data.target.identifierId).not.toBe(rows[1].data.target.identifierId);
  });
  it("retries persisted queue data after ACK failure without refetching committed observations", async () => {
    await resetDispatch();
    fetch.mockClear();
    fetch.mockResolvedValue([point()]);
    await dispatcher({ batchSize: 1 }).dispatchOnce();
    const [job] = await jobs();
    const worker = createPgBossServices(process.env.DATABASE_URL!);
    const handled: string[] = [];
    const handler = createMarketSyncHandler({
      registry,
      repository: repository(),
      enabled: () => true,
      logger: { error: vi.fn() },
    });
    worker.registry.registerCancellable("market.sync", async (p, context) => {
      handled.push((p as { pollId: string }).pollId);
      await handler(p, context);
      if (handled.length === 1) throw new Error("simulated ACK failure");
    });
    try {
      await worker.runtime.start();
      await vi.waitFor(async () => expect((await jobs())[0].state).toBe("retry"), {
        timeout: 10000,
        interval: 50,
      });
      // Fixture-only clock acceleration: preserve real retry data/count/options, make its delay due.
      await queues!.producerBackend
        .getDb()
        .executeSql(
          `UPDATE pgboss.job SET start_after=clock_timestamp() WHERE name='market.sync' AND id=$1`,
          [job.id],
        );
      await vi.waitFor(async () => expect((await jobs())[0].state).toBe("completed"), {
        timeout: 10000,
        interval: 50,
      });
      expect(handled).toEqual([job.data.pollId, job.data.pollId]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(await repository().find(job.data)).not.toBeNull();
    } finally {
      await worker.runtime.stop();
    }
  }, 25000);

  it("runs the composed producer and cancels an in-flight fake provider before teardown without catalog HTTP locks", async () => {
    await resetDispatch();
    const worker = createPgBossServices(process.env.DATABASE_URL!);
    let entered!: (value: {
      pollId: string;
      target: { entryId: string; revision: number };
    }) => void;
    const ready = new Promise<{ pollId: string; target: { entryId: string; revision: number } }>(
      (r) => (entered = r),
    );
    let observedSignal: AbortSignal | undefined;
    const pendingFetch = vi.fn(
      async (request, context) =>
        new Promise<never>((_resolve, reject) => {
          observedSignal = context.signal;
          entered(request);
          context.signal.addEventListener(
            "abort",
            () => reject(new Error("secret transport abort")),
            { once: true },
          );
        }),
    );
    const market = composeMarketSync({
      database: db!,
      backend: worker.producerBackend,
      workers: worker.registry,
      enabled: true,
      batchSize: 1,
      logger: { error: vi.fn() },
      registrations: [
        {
          provider: { id: providerId, fetch: pendingFetch },
          identifierNamespace: "sync_fixture",
          identifierType: "product",
        },
      ],
    });
    try {
      await worker.runtime.start();
      market.start();
      const request = await ready;
      await catalog().updateCatalogEntry(request.target.entryId, request.target.revision, {
        text: { language: "en", title: "No HTTP lock" },
      });
      const first = market.stop();
      expect(market.stop()).toBe(first);
      await first;
      expect(observedSignal!.aborted).toBe(true);
      expect(
        await repository().find({
          providerId,
          pollId: request.pollId,
          target: (await jobs())[0].data.target,
        }),
      ).toBeNull();
    } finally {
      await market.stop();
      await worker.runtime.stop();
    }
  }, 15000);
});

it.runIf(enabled)(
  "forwards pg-boss active-expiry cancellation through the real runtime",
  async () => {
    const worker = createPgBossServices(process.env.DATABASE_URL!);
    const name = `market-signal-${randomUUID()}`;
    let aborted!: () => void;
    const seen = new Promise<void>((r) => (aborted = r));
    worker.registry.registerCancellable(
      name,
      async (_payload, { signal }) =>
        new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              expect(signal.aborted).toBe(true);
              aborted();
              resolve();
            },
            { once: true },
          );
        }),
    );
    try {
      await worker.runtime.start();
      await worker.producerBackend.send(
        name,
        { fixture: true },
        { expireInSeconds: 1, retryLimit: 0, singletonKey: randomUUID() },
      );
      await seen;
    } finally {
      await worker.runtime.stop();
      const cleanup = createPgBossServices(process.env.DATABASE_URL!);
      await cleanup.runtime.start();
      try {
        await (
          cleanup.producerBackend as unknown as { deleteQueue(name: string): Promise<void> }
        ).deleteQueue(name);
      } finally {
        await cleanup.runtime.stop();
      }
    }
  },
  10000,
);
