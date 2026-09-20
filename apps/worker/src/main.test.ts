import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { runWorkerMain, startWorker } from "./main";

describe("startWorker", () => {
  it("installs the queue error listener before startup and keeps an emitted error unhealthy", async () => {
    const calls: string[] = [];
    const queue = new EventEmitter();
    Object.assign(queue, {
      start: vi.fn(async () => {
        calls.push("start");
        queue.emit("error", new Error("postgresql://admin:secret@database/prod"));
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      isReady: vi.fn().mockReturnValue(true),
    });
    const logger = { info: vi.fn(), error: vi.fn() };
    const endpoint = { close: vi.fn().mockResolvedValue(undefined), port: 3001, host: "127.0.0.1" };

    const worker = await startWorker({
      queue: queue as never,
      databaseHealth: async () => ({ ok: true }),
      disconnectDatabase: vi.fn().mockResolvedValue(undefined),
      startHealth: vi.fn().mockResolvedValue(endpoint),
      healthPort: 3001,
      logger,
      installSignals: false,
      onQueueListenerInstalled: () => calls.push("listener"),
    });

    expect(calls).toEqual(["listener", "start"]);
    expect(worker.isHealthy()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith("Worker queue error");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret");
    await worker.stop();
  });

  it("rolls back queue, endpoint, and database resources in reverse lifecycle order", async () => {
    const calls: string[] = [];
    const queue = new EventEmitter();
    Object.assign(queue, {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(async () => calls.push("queue")),
      isReady: vi.fn().mockReturnValue(true),
    });
    const endpoint = {
      close: vi.fn(async () => calls.push("endpoint")),
      port: 3001,
      host: "127.0.0.1",
    };
    const worker = await startWorker({
      queue: queue as never,
      databaseHealth: async () => ({ ok: true }),
      disconnectDatabase: vi.fn(async () => {
        calls.push("database");
      }),
      startHealth: vi.fn().mockResolvedValue(endpoint),
      healthPort: 3001,
      logger: { info: vi.fn(), error: vi.fn() },
      installSignals: false,
    });

    await worker.stop();

    expect(calls).toEqual(["endpoint", "queue", "database"]);
  });
});

describe("runWorkerMain", () => {
  it("returns exit code 1 and logs a generic startup configuration error", async () => {
    const logger = { error: vi.fn() };

    await expect(
      runWorkerMain(async () => {
        throw new Error("DATABASE_URL=postgresql://admin:secret@database/prod");
      }, logger),
    ).resolves.toBe(1);
    expect(logger.error).toHaveBeenCalledWith("Worker startup failed");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret");
  });
});
