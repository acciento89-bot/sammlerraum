import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { inspect } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { parseServerEnv } from "@sammlerraum/config/server";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { credentialKey } from "@sammlerraum/market-data/provider-http";
import { makePriceChartingProvider } from "@sammlerraum/market-data/pricecharting-provider";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createMarketDataService } from "@sammlerraum/domain/market-data/market-data-service";
import { createPgBossServices, WorkerRegistry } from "@sammlerraum/queue";
import { createProductionMarketProviders, domainMoney } from "./market-provider-composition";
import { createMarketRequestPermit, createPostgresMarketGate } from "./market-request-permit";
import { createMarketSyncRepository } from "./market-sync-repository";
import { createMarketSyncHandler } from "./sync-market-data";
import { composeMarketSync } from "./market-sync-runtime";
import { startWorker } from "../main";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const q = enabled ? createPgBossServices(process.env.DATABASE_URL!) : undefined;
const token = `fixture-${randomUUID()}`,
  key = credentialKey("pricecharting", token),
  ids: string[] = [],
  polls: string[] = [],
  keys = [key];
let categoryId: string;
const http = vi.fn(
  async () =>
    new Response(
      '{"status":"success","id":"1234","console-name":"Pokemon Base Set","loose-price":9007199254740993,"manual-only-price":0}',
    ),
);
let providers: ReturnType<typeof createProductionMarketProviders>;
let registry: ProviderRegistry;
const catalog = () => createCatalogMaintenanceService(db!);
async function fixture() {
  const entry = await catalog().createCatalogEntry({
    categoryTemplateId: categoryId,
    text: { language: "en", title: "Production fake HTTP fixture" },
  });
  ids.push(entry.state.id);
  const identifier = await catalog().addExternalIdentifier(entry.state.id, 1, {
    namespace: "pricecharting",
    type: "product_category",
    value: '["v1","cards","1234","Pokemon Base Set"]',
  });
  const pollId = randomUUID();
  polls.push(pollId);
  return {
    providerId: "pricecharting",
    ...(await createMarketDataService(db!, registry).prepareFetchRequest("pricecharting", {
      entryId: entry.state.id,
      variantId: null,
      identifierId: identifier.id,
      pollId,
    })),
  };
}
describe.runIf(enabled)("real production composition with fake HTTP and PostgreSQL", () => {
  beforeAll(async () => {
    const [r] = await db!.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() name,current_setting('server_version') version`;
    expect(r!.name.endsWith("_test")).toBe(true);
    expect(r!.version.startsWith("17.")).toBe(true);
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: `production_${randomUUID().replaceAll("-", "")}`,
        labels: { en: "Production", de: "Production" },
      })
    ).id;
    const config = parseServerEnv({
      ...process.env,
      MARKET_SYNC_ENABLED: "true",
      PRICECHARTING_ENABLED: "true",
      PRICECHARTING_POLICY_APPROVED: "true",
      PRICECHARTING_API_TOKEN: token,
      PRICECHARTING_HOURLY_CALL_BUDGET: "20",
      PRICECHARTING_DAILY_CALL_BUDGET: "20",
    });
    providers = createProductionMarketProviders({ config, database: db!, fetch: http });
    registry = new ProviderRegistry(providers.registrations);
  });
  afterAll(async () => {
    await providers?.requestLifecycle.stop();
    if (q) {
      await q.runtime.stop();
    }
    for (const poll of polls) {
      await db!
        .$executeRaw`DELETE FROM "MarketSyncReceipt" WHERE "providerId"='pricecharting' AND "pollId"=${poll}::uuid`;
      await db!
        .$executeRaw`DELETE FROM "MarketObservation" WHERE "providerId"='pricecharting' AND "pollId"=${poll}::uuid`;
      await db!
        .$executeRaw`DELETE FROM pgboss.job WHERE name='market.sync' AND data->>'pollId'=${poll}`;
    }
    for (const k of keys)
      await db!.$executeRaw`DELETE FROM "MarketRequestGate" WHERE "credentialKey"=${k}`;
    await db!.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: ids } } });
    await db!.catalogRevision.deleteMany({ where: { entryId: { in: ids } } });
    await db!.catalogEntry.deleteMany({ where: { id: { in: ids } } });
    if (categoryId) await db!.categoryTemplate.delete({ where: { id: categoryId } });
    await db!.$disconnect();
  });
  it("actual composed handler ingests exact zero/bigint with receipt time before cooldown and skips same-poll replay", async () => {
    const workers = new WorkerRegistry();
    const market = composeMarketSync({
      database: db!,
      backend: q!.producerBackend,
      workers,
      enabled: true,
      logger: { error: vi.fn() },
      ...providers,
    });
    const payload = await fixture();
    const handler = workers.entries()[0]!.cancellable!;
    const count = http.mock.calls.length;
    await handler(payload, { signal: new AbortController().signal });
    const completed = Date.now();
    await handler(payload, { signal: new AbortController().signal });
    expect(http.mock.calls.length - count).toBe(1);
    const rows = await db!.$queryRaw<
      Array<{
        amountMinor: bigint;
        observedAt: Date;
        fetchedAt: Date;
        fetchedMillis: bigint;
        observedBasis: string;
      }>
    >`SELECT "amountMinor","observedAt","fetchedAt",(extract(epoch FROM "fetchedAt")*1000)::bigint AS "fetchedMillis","observedBasis" FROM "MarketObservation" WHERE "pollId"=${payload.pollId}::uuid ORDER BY "amountMinor"`;
    expect(rows.map((r) => r.amountMinor)).toEqual([0n, 9007199254740993n]);
    expect(
      rows.every(
        (r) => r.observedBasis === "FETCH" && r.observedAt.getTime() === r.fetchedAt.getTime(),
      ),
    ).toBe(true);
    expect(completed - Number(rows[0]!.fetchedMillis)).toBeGreaterThanOrEqual(1000);
    // Do not stop this shared permit until the queue proof below finishes.
    expect(market).toHaveProperty("stop");
  });
  it("real pg-boss retry reuses receipt; raw provider errors never reach persisted broker output", async () => {
    const repo = createMarketSyncRepository(db!, registry),
      logger = { error: vi.fn() };
    const handle = createMarketSyncHandler({
      registry,
      repository: repo,
      enabled: () => true,
      logger,
    });
    let deliveries = 0;
    let failAck = true;
    q!.registry.registerCancellable("market.sync", async (p, c) => {
      deliveries++;
      await handle(p, c);
      if (failAck) {
        failAck = false;
        throw Error("ACK fixture");
      }
    });
    await q!.runtime.start();
    const payload = await fixture();
    const before = http.mock.calls.length;
    const id = await q!.producerBackend.send("market.sync", payload, {
      retryLimit: 2,
      retryDelay: 30,
      singletonKey: randomUUID(),
    });
    const job = async () =>
      (
        await q!.producerBackend
          .getDb()
          .executeSql("SELECT state,output FROM pgboss.job WHERE name='market.sync' AND id=$1", [
            id,
          ])
      ).rows[0]!;
    await vi.waitFor(async () => expect((await job()).state).toBe("retry"), {
      timeout: 10000,
      interval: 30,
    });
    await q!.producerBackend
      .getDb()
      .executeSql(
        "UPDATE pgboss.job SET start_after=clock_timestamp() WHERE name='market.sync' AND id=$1",
        [id],
      );
    await vi.waitFor(async () => expect((await job()).state).toBe("completed"), {
      timeout: 10000,
      interval: 30,
    });
    expect(deliveries).toBe(2);
    expect(http.mock.calls.length - before).toBe(1);
    const bad = await fixture();
    http.mockRejectedValueOnce(
      new Error("https://private.invalid?t=synthetic-secret", {
        cause: new Error("private raw body"),
      }),
    );
    const badId = await q!.producerBackend.send("market.sync", bad, {
      retryLimit: 0,
      singletonKey: randomUUID(),
    });
    let output: unknown;
    await vi.waitFor(
      async () => {
        const r = (
          await q!.producerBackend
            .getDb()
            .executeSql("SELECT state,output FROM pgboss.job WHERE name='market.sync' AND id=$1", [
              badId,
            ])
        ).rows[0]!;
        expect(r.state).toBe("failed");
        output = r.output;
      },
      { timeout: 10000, interval: 30 },
    );
    expect(inspect(output, { showHidden: true, depth: 10 })).toContain("MARKET_SYNC_RETRY");
    expect(
      inspect(output, { showHidden: true, depth: 10 }) + inspect(logger.error.mock.calls),
    ).not.toMatch(/synthetic-secret|private raw body|private.invalid/);
    expect(await repo.find(bad)).toBeNull();
    const retryPayload = await fixture(),
      retryBefore = http.mock.calls.length;
    http.mockResolvedValueOnce(new Response("private 503 body", { status: 503 }));
    const retryId = await q!.producerBackend.send("market.sync", retryPayload, {
      retryLimit: 1,
      retryDelay: 30,
      singletonKey: randomUUID(),
    });
    const retryState = async () =>
      (
        await q!.producerBackend
          .getDb()
          .executeSql("SELECT state FROM pgboss.job WHERE name='market.sync' AND id=$1", [retryId])
      ).rows[0]!.state;
    await vi.waitFor(async () => expect(await retryState()).toBe("retry"), {
      timeout: 10000,
      interval: 30,
    });
    await q!.producerBackend
      .getDb()
      .executeSql(
        "UPDATE pgboss.job SET start_after=clock_timestamp() WHERE name='market.sync' AND id=$1",
        [retryId],
      );
    await vi.waitFor(async () => expect(await retryState()).toBe("completed"), {
      timeout: 10000,
      interval: 30,
    });
    expect(http.mock.calls.length - retryBefore).toBe(2);
    expect(await repo.find(retryPayload)).not.toBeNull();
    const [budget] = await db!.$queryRaw<
      Array<{ dayCount: number }>
    >`SELECT "dayCount" FROM "MarketRequestGate" WHERE "credentialKey"=${key}`;
    expect(budget!.dayCount).toBe(5);
  }, 25000);
  it("earlier completed handler cleanup failure remains latched through real composition/main shutdown", async () => {
    const t = `fixture-${randomUUID()}`,
      k = credentialKey("pricecharting", t);
    keys.push(k);
    const store = createPostgresMarketGate(db!, [
      { credentialKey: k, service: "pricecharting", hourly: 2, daily: 2 },
    ]);
    const permit = createMarketRequestPermit({
      store: {
        ...store,
        clear: async () => {
          throw Error("private DB cleanup");
        },
      },
    });
    const registration = {
      provider: makePriceChartingProvider({
        token: t,
        enabled: true,
        permit,
        money: domainMoney,
        fetch: http,
      }),
      identifierNamespace: "pricecharting",
      identifierType: "product_category",
    };
    const workers = new WorkerRegistry(),
      market = composeMarketSync({
        database: db!,
        backend: q!.producerBackend,
        workers,
        enabled: true,
        logger: { error: vi.fn() },
        registrations: [registration],
        requestLifecycle: permit,
      });
    const payload = await fixture();
    await expect(
      workers.entries()[0]!.cancellable!(payload, { signal: new AbortController().signal }),
    ).rejects.toThrow("MARKET_SYNC_RETRY");
    // Handler has settled and left the pending set before main asks the lifecycle to stop.
    const disconnect = vi.fn();
    const queue = Object.assign(new EventEmitter(), {
      start: async () => {},
      stop: async () => {},
      isReady: () => true,
    });
    const worker = await startWorker({
      queue,
      marketSync: { start: () => {}, stop: () => market.stop() },
      databaseHealth: async () => ({ ok: true }),
      disconnectDatabase: disconnect,
      startHealth: async () => ({ close: async () => {}, port: 1, host: "127.0.0.1" }),
      healthPort: 1,
      logger: { info: vi.fn(), error: vi.fn() },
      installSignals: false,
    });
    await expect(worker.stop()).rejects.toThrow("Worker shutdown failed");
    expect(disconnect).not.toHaveBeenCalled();
    expect(await createMarketSyncRepository(db!, registry).find(payload)).toBeNull();
  });
  it("standalone permit stop reaches the real adapter body signal and releases only after settlement/cooldown", async () => {
    const t = `fixture-${randomUUID()}`,
      k = credentialKey("pricecharting", t);
    keys.push(k);
    const permit = createMarketRequestPermit({
      store: createPostgresMarketGate(db!, [
        { credentialKey: k, service: "pricecharting", hourly: 2, daily: 2 },
      ]),
    });
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    let abortedAt = 0;
    const fetcher: typeof fetch = async (_url, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            init!.signal!.addEventListener(
              "abort",
              () => {
                abortedAt = performance.now();
                controller.error(new Error("synthetic body abort"));
              },
              { once: true },
            );
            entered();
          },
        }),
      );
    const provider = makePriceChartingProvider({
      token: t,
      enabled: true,
      permit,
      money: domainMoney,
      fetch: fetcher,
    });
    const payload = await fixture();
    const task = provider.fetch({ pollId: payload.pollId, target: payload.target });
    const outcome = expect(task).rejects.toMatchObject({ code: "INTERRUPTED" });
    await ready;
    const stopped = permit.stop();
    await outcome;
    await stopped;
    expect(performance.now() - abortedAt).toBeGreaterThanOrEqual(1000);
    const [r] = await db!.$queryRaw<
      Array<{ activeAttempt: string | null }>
    >`SELECT "activeAttempt" FROM "MarketRequestGate" WHERE "credentialKey"=${k}`;
    expect(r!.activeAttempt).toBeNull();
  });
});
