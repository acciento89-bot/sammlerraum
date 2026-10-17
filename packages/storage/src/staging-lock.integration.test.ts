import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, utimes, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createMediaAssetLocker } from "../../db/src/media-lock";
import { cleanupLocalStorageTemporaryFiles, LocalPersistentStorage } from "./local-storage";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "staging cross-session exclusion",
  () => {
    it("skips an ancient active file and removes it after writer session crash/release", async () => {
      const root = await mkdtemp(join(tmpdir(), "staging-lock-"));
      const id = randomUUID();
      const name = `.storage-${id}.tmp`;
      const path = join(root, name);
      const writerLock = createMediaAssetLocker(process.env.DATABASE_URL!);
      const sweeperLock = createMediaAssetLocker(process.env.DATABASE_URL!);
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const enteredPromise = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const writing = writerLock(`staging:${id}`, async () => {
        await writeFile(path, "unfinished");
        await utimes(path, new Date(0), new Date(0));
        entered();
        await held;
        // Simulate process death before rename: session ends with the old file intact.
      });
      const storage = new LocalPersistentStorage(root, sweeperLock);
      try {
        await enteredPromise;
        await cleanupLocalStorageTemporaryFiles(root, { maxAgeHours: 24, withLock: sweeperLock });
        expect(await storage.exists(name)).toBe(true);
        release();
        await writing;
        await cleanupLocalStorageTemporaryFiles(root, { maxAgeHours: 24, withLock: sweeperLock });
        expect(await storage.exists(name)).toBe(false);
      } finally {
        release();
        await writing;
        await rm(root, { recursive: true, force: true });
      }
    });
  },
);

it("does not follow symlinks or remove fresh/nonreserved staging objects", async () => {
  const root = await mkdtemp(join(tmpdir(), "safe-staging-"));
  const outside = await mkdtemp(join(tmpdir(), "outside-staging-"));
  const name = `.storage-${randomUUID()}.tmp`;
  const storage = new LocalPersistentStorage(root);
  try {
    await writeFile(join(outside, name), "preserve");
    await utimes(join(outside, name), new Date(0), new Date(0));
    await symlink(outside, join(root, "linked"));
    await writeFile(join(root, name), "fresh");
    await writeFile(join(root, ".storage-invalid.tmp"), "unreserved");
    await cleanupLocalStorageTemporaryFiles(root, {
      maxAgeHours: 24,
      withLock: async (_id, work) => work(),
    });
    expect(await storage.exists(name)).toBe(true);
    expect(await storage.exists(".storage-invalid.tmp")).toBe(true);
    expect(await new LocalPersistentStorage(outside).exists(name)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("lost staging session", () => {
  it("fails an ancient writer rename after the lost session permits cleanup", async () => {
    const { rename } = await import("node:fs/promises");
    const { createTestDatabaseClient } = await import("../../db/src/test-database");
    const db = createTestDatabaseClient();
    const root = await mkdtemp(join(tmpdir(), "lost-staging-"));
    const id = randomUUID(),
      appName = `staging-${randomUUID()}`;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("application_name", appName);
    let lost = false,
      release!: () => void,
      entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const writer = createMediaAssetLocker(url.href, () => {
      lost = true;
    });
    const path = join(root, `.storage-${id}.tmp`);
    const writing = writer(`staging:${id}`, async () => {
      await writeFile(path, "unfinished");
      await utimes(path, new Date(0), new Date(0));
      entered();
      await held;
      await rename(path, join(root, "published"));
    }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    try {
      await didEnter;
      const killed = await db.$queryRaw<
        Array<{ killed: boolean }>
      >`SELECT pg_terminate_backend(pid) AS killed FROM pg_stat_activity WHERE application_name = ${appName}`;
      expect(killed).toEqual([{ killed: true }]);
      await expect.poll(() => lost).toBe(true);
      await cleanupLocalStorageTemporaryFiles(root, {
        maxAgeHours: 24,
        withLock: createMediaAssetLocker(process.env.DATABASE_URL!),
      });
      release();
      expect(await writing).toMatchObject({ error: { code: "ENOENT" } });
      expect(await new LocalPersistentStorage(root).exists("published")).toBe(false);
    } finally {
      release();
      await writing;
      await db.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  });
});
