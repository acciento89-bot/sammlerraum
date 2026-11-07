import { describe, it, expect, vi } from "vitest";
import { WorkerRegistry } from "@sammlerraum/queue";
import { composeMarketSync } from "./jobs/market-sync-runtime";
import { MARKET_SYNC_JOB } from "./jobs/sync-market-data";
describe("production market composition", () => {
  it("registers actual market handler before queue lock and default-off performs no DB/queue/provider calls", async () => {
    const database = { $transaction: vi.fn() },
      backend = { getDb: vi.fn(), send: vi.fn() },
      workers = new WorkerRegistry(),
      fetch = vi.fn();
    const market = composeMarketSync({
      database,
      backend,
      workers,
      enabled: false,
      logger: { error: vi.fn() },
      registrations: [
        {
          provider: { id: "fixture", fetch },
          identifierNamespace: "fixture",
          identifierType: "product",
        },
      ],
    });
    expect(workers.entries().map((r) => r.name)).toEqual([MARKET_SYNC_JOB]);
    workers.lock();
    market.start();
    await market.stop();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(backend.getDb).not.toHaveBeenCalled();
    expect(backend.send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not activate adapters merely by enabling the empty production registry", async () => {
    const database = { $transaction: vi.fn() },
      backend = { getDb: vi.fn(), send: vi.fn() };
    const market = composeMarketSync({
      database,
      backend,
      workers: new WorkerRegistry(),
      enabled: true,
      logger: { error: vi.fn() },
    });
    market.start();
    await market.stop();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(backend.getDb).not.toHaveBeenCalled();
  });
});
it("fails closed when enabled provider admission lacks caller-owned transactions", async () => {
  const { createMarketSyncDispatcher } = await import("./jobs/market-sync-dispatcher");
  const { ProviderRegistry } = await import("@sammlerraum/market-data/provider-registry");
  const backend = { getDb: () => ({ executeSql: vi.fn() }), send: vi.fn() },
    registry = new ProviderRegistry([
      {
        provider: { id: "fixture", fetch: async () => [] },
        identifierNamespace: "fixture",
        identifierType: "product",
      },
    ]);
  const dispatcher = createMarketSyncDispatcher({
    database: { $transaction: vi.fn() },
    backend,
    registry,
    providerIds: ["fixture"],
    enabled: true,
    logger: { error: vi.fn() },
  });
  await expect(dispatcher.dispatchOnce()).rejects.toThrow("transaction unavailable");
  expect(backend.send).not.toHaveBeenCalled();
});
