import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createMediaCleanupJob } from "./cleanup-media";

const asset = "b962a681-712a-4ffe-b750-3e79d17545f0";
it("reconciles a delayed original and derivative after asset rows have been removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cleanup-"));
  const storage = new LocalPersistentStorage(root);
  const keys = [`originals/${asset}`, `variants/${asset}/medium.webp`];
  let removed = false;
  const tombstones = new Set<string>();
  const job = createMediaCleanupJob(
    {
      findDeletableAssets: async () => (removed ? [] : [asset]),
      prepareDeletion: async () => {
        keys.forEach((key) => tombstones.add(key));
        return keys;
      },
      finishDeletion: async () => {
        removed = true;
      },
      findTombstones: async () =>
        [...tombstones].map((storageKey) => ({ storageKey, assetId: asset })),
      noteReconciled: async () => {},
    },
    storage,
    async (_id, work) => work(),
    { error: () => {} },
  );
  try {
    await storage.put(keys[0]!, new Uint8Array([1]));
    await job.run();
    expect(removed).toBe(true);
    expect(await storage.exists(keys[0]!)).toBe(false);
    // A put already in flight can publish after a dead database session released its lock.
    await storage.put(keys[0]!, new Uint8Array([2]));
    await storage.put(keys[1]!, new Uint8Array([3]));
    await job.run();
    expect(await storage.exists(keys[0]!)).toBe(false);
    expect(await storage.exists(keys[1]!)).toBe(false);
    expect(tombstones.size).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps failed byte deletion retryable and processes the rest of a batch", async () => {
  const deleted: string[] = [];
  const finished: string[] = [];
  let failing = true;
  const tombstones = new Set<string>();
  const job = createMediaCleanupJob(
    {
      findDeletableAssets: async () => ["a", "b"].filter((id) => !finished.includes(id)),
      prepareDeletion: async (id) => {
        tombstones.add(id);
        return [id];
      },
      finishDeletion: async (id) => {
        finished.push(id);
      },
      findTombstones: async () =>
        [...tombstones].map((storageKey) => ({ storageKey, assetId: storageKey })),
      noteReconciled: async () => {},
    },
    {
      put: async () => {},
      read: async () => new Uint8Array(),
      exists: async (key) => !deleted.includes(key),
      delete: async (key) => {
        if (key === "a" && failing) throw new Error("disk unavailable");
        deleted.push(key);
      },
    },
    async (_id, work) => work(),
    { error: () => {} },
  );
  await job.run();
  expect(finished).toEqual(["b"]);
  expect(tombstones.has("a")).toBe(true);
  failing = false;
  await job.run();
  expect(finished).toEqual(["b", "a"]);
});

it("skips storage while a processor holds the shared asset lock", async () => {
  let touched = false;
  const job = createMediaCleanupJob(
    {
      findDeletableAssets: async () => [asset],
      prepareDeletion: async () => {
        touched = true;
        return [asset];
      },
      finishDeletion: async () => {},
      findTombstones: async () => [{ assetId: asset, storageKey: asset }],
      noteReconciled: async () => {},
    },
    {
      put: async () => {},
      read: async () => new Uint8Array(),
      exists: async () => true,
      delete: async () => {
        touched = true;
      },
    },
    async () => false,
    { error: () => {} },
  );
  await job.run();
  expect(touched).toBe(false);
});

it("drains an in-flight scan on stop and starts polling immediately", async () => {
  const { vi } = await import("vitest");
  vi.useFakeTimers();
  let release!: () => void;
  let scans = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const job = createMediaCleanupJob(
    {
      findDeletableAssets: async () => {
        scans++;
        await held;
        return [];
      },
      prepareDeletion: async () => null,
      finishDeletion: async () => {},
      findTombstones: async () => [],
      noteReconciled: async () => {},
    },
    {
      put: async () => {},
      read: async () => new Uint8Array(),
      exists: async () => false,
      delete: async () => {},
    },
    async (_id, work) => work(),
    { error: () => {} },
    { intervalMs: 10 },
  );
  try {
    job.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(scans).toBe(1);
    let stopped = false;
    const stopping = job.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stopping;
    await vi.advanceTimersByTimeAsync(100);
    expect(scans).toBe(1);
  } finally {
    release();
    await job.stop();
    vi.useRealTimers();
  }
});
