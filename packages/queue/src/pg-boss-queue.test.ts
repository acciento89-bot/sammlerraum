import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { PgBossQueue } from "./pg-boss-queue";
import { QueueRuntime, WorkerRegistry } from "./runtime";
import { InMemoryQueueClient } from "./testing/in-memory-queue";

function queueRecord(policy = "exclusive") {
  return { name: "image.process", policy };
}

describe("queue clients", () => {
  it("deduplicates a job when a singleton key is reused", async () => {
    const queue = new InMemoryQueueClient();
    const first = await queue.enqueue("image.process", { id: "a" }, { singletonKey: "image:a" });
    const second = await queue.enqueue("image.process", { id: "a" }, { singletonKey: "image:a" });

    expect(second).toBe(first);
  });

  it("does not deduplicate ordinary in-memory jobs", async () => {
    const queue = new InMemoryQueueClient();

    await expect(queue.enqueue("image.process", { id: "a" })).resolves.not.toBe(
      await queue.enqueue("image.process", { id: "a" }),
    );
  });
});

describe("PgBossQueue", () => {
  it("creates an exclusive queue then validates its persisted policy", async () => {
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord()),
      send: vi.fn().mockResolvedValue("job-1"),
      findJobs: vi.fn(),
    };
    const queue = new PgBossQueue(boss as never, () => "generated-key");

    await expect(queue.enqueue("image.process", { id: "a" })).resolves.toBe("job-1");
    expect(boss.createQueue).toHaveBeenCalledWith("image.process", { policy: "exclusive" });
    expect(boss.getQueue).toHaveBeenCalledWith("image.process");
    expect(boss.send).toHaveBeenCalledWith(
      "image.process",
      { id: "a" },
      {
        retryLimit: 5,
        singletonKey: "generated-key",
      },
    );
  });

  it("rejects a persisted policy mismatch without changing the queue", async () => {
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord("standard")),
      updateQueue: vi.fn(),
      send: vi.fn(),
      findJobs: vi.fn(),
    };
    const queue = new PgBossQueue(boss as never);

    await expect(queue.enqueue("image.process", {})).rejects.toThrow(/exclusive/);
    expect(boss.updateQueue).not.toHaveBeenCalled();
    expect(boss.send).not.toHaveBeenCalled();
  });

  it("recovers the newest nonterminal singleton after a nullable send", async () => {
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord()),
      send: vi.fn().mockResolvedValue(null),
      findJobs: vi.fn().mockResolvedValue([
        { id: "done", state: "completed", createdOn: new Date("2026-01-03") },
        { id: "active", state: "active", createdOn: new Date("2026-01-02") },
        { id: "queued", state: "created", createdOn: new Date("2026-01-01") },
      ]),
    };
    const queue = new PgBossQueue(boss as never);

    await expect(queue.enqueue("image.process", {}, { singletonKey: "image:a" })).resolves.toBe(
      "active",
    );
    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(boss.findJobs).toHaveBeenCalledOnce();
    expect(boss.findJobs).toHaveBeenCalledWith("image.process", { key: "image:a" });
  });

  it("never resends when nullable send recovery finds no nonterminal job", async () => {
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord()),
      send: vi.fn().mockResolvedValue(null),
      findJobs: vi
        .fn()
        .mockResolvedValue([{ id: "done", state: "completed", createdOn: new Date("2026-01-03") }]),
    };
    const queue = new PgBossQueue(boss as never);

    await expect(queue.enqueue("image.process", {}, { singletonKey: "image:a" })).rejects.toThrow(
      /could not resolve/i,
    );
    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(boss.findJobs).toHaveBeenCalledTimes(1);
  });
});

describe("QueueRuntime and WorkerRegistry", () => {
  it("requires registrations before start and rejects duplicates", async () => {
    const registry = new WorkerRegistry();
    registry.register("image.process", async () => undefined);

    expect(() => registry.register("image.process", async () => undefined)).toThrow(/already/);

    const backend = new EventEmitter();
    Object.assign(backend, {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord()),
      work: vi.fn().mockResolvedValue("worker-1"),
    });
    const runtime = new QueueRuntime(backend as never, registry);
    await runtime.start();

    expect(() => registry.register("later", async () => undefined)).toThrow(/started/);
  });

  it("unwraps every job payload in a pg-boss batch", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const registry = new WorkerRegistry();
    registry.register("image.process", handler);
    let batchHandler: ((jobs: Array<{ data: unknown }>) => Promise<void>) | undefined;
    const backend = new EventEmitter();
    Object.assign(backend, {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord()),
      work: vi.fn(async (_name, work) => {
        batchHandler = work;
        return "worker-1";
      }),
    });

    await new QueueRuntime(backend as never, registry).start();
    await batchHandler?.([{ data: { id: "a" } }, { data: { id: "b" } }]);

    expect(handler).toHaveBeenNthCalledWith(1, { id: "a" });
    expect(handler).toHaveBeenNthCalledWith(2, { id: "b" });
  });

  it("does not become healthy when the backend errors during work registration", async () => {
    const registry = new WorkerRegistry();
    registry.register("image.process", async () => undefined);
    const backend = new EventEmitter();
    Object.assign(backend, {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord()),
      work: vi.fn(async () => {
        backend.emit("error", new Error("database secret"));
        return "worker-1";
      }),
    });
    const runtime = new QueueRuntime(backend as never, registry);

    await runtime.start();
    expect(runtime.isReady()).toBe(false);
    await runtime.stop();
    expect((backend as never as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalledOnce();
  });

  it("stops the backend when work registration fails", async () => {
    const registry = new WorkerRegistry();
    registry.register("image.process", async () => undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const backend = Object.assign(new EventEmitter(), {
      start: vi.fn().mockResolvedValue(undefined),
      stop,
      createQueue: vi.fn().mockResolvedValue(undefined),
      getQueue: vi.fn().mockResolvedValue(queueRecord()),
      work: vi.fn().mockRejectedValue(new Error("registration failed")),
    });
    const runtime = new QueueRuntime(backend as never, registry);

    await expect(runtime.start()).rejects.toThrow("registration failed");
    expect(stop).toHaveBeenCalledOnce();
    expect(runtime.isReady()).toBe(false);
  });
});
