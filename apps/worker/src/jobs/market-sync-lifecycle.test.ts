import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { WorkerRegistry } from "@sammlerraum/queue";
import { composeMarketSync } from "./market-sync-runtime";
import { startWorker } from "../main";
function setup(stop: () => Promise<void>) {
  return composeMarketSync({
    database: { $transaction: vi.fn() },
    backend: {} as never,
    workers: new WorkerRegistry(),
    enabled: false,
    logger: { error: vi.fn() },
    requestLifecycle: { stop },
  });
}
describe("composed provider lifecycle", () => {
  it("closes request admission synchronously and shares stop completion", async () => {
    let closed = false;
    const market = setup(async () => {
      closed = true;
    });
    const stop = market.stop();
    expect(closed).toBe(true);
    expect(market.stop()).toBe(stop);
    await stop;
  });
  it("does not forget earlier cleanup failure after all handler promises settled", async () => {
    const market = setup(async () => {
      throw Error("private cleanup detail");
    });
    await expect(market.stop()).rejects.toThrow("Market shutdown failed");
  });
  it("real main keeps database connected after lifecycle uncertainty", async () => {
    const market = setup(async () => {
      throw Error("private cleanup detail");
    });
    const disconnect = vi.fn(),
      logger = { info: vi.fn(), error: vi.fn() };
    const queue = Object.assign(new EventEmitter(), {
      start: async () => {},
      stop: async () => {},
      isReady: () => true,
    });
    const worker = await startWorker({
      queue,
      marketSync: market,
      databaseHealth: async () => ({ ok: true }),
      disconnectDatabase: disconnect,
      startHealth: async () => ({ close: async () => {}, port: 1, host: "127.0.0.1" }),
      healthPort: 1,
      logger,
      installSignals: false,
    });
    await expect(worker.stop()).rejects.toThrow("Worker shutdown failed");
    expect(disconnect).not.toHaveBeenCalled();
    expect(logger.error.mock.calls.flat().join(" ")).not.toContain("private cleanup detail");
  });
  it("treats the watchdog as failure while an ignored-abort lifecycle is still pending", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const settled = new Promise<void>((r) => (release = r));
    try {
      const market = setup(() => settled);
      const stop = market.stop();
      const outcome = expect(stop).rejects.toThrow("Market work did not settle");
      await vi.advanceTimersByTimeAsync(15000);
      await outcome;
      release();
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});
