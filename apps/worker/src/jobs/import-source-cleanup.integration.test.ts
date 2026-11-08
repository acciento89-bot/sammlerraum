import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createImportWorkflowService } from "@sammlerraum/domain/imports/import-workflow-service";
import { createImportSourceCleanup } from "./import-source-cleanup";
import { createImportService } from "@sammlerraum/domain/imports/import-service";
import { createImportParser } from "./import-parser-runtime";
import { createPrismaImportParserRepository } from "./import-parser-repository";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  root: string,
  storage: LocalPersistentStorage,
  lock: ReturnType<typeof createMediaAssetLocker>;
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID();
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Source retention',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Source retention',now())`;
  const result = await createImportWorkflowService(db, storage, lock).uploadImport(
    { userId: owner },
    {
      collectionId: collection,
      locale: "de",
      fileName: "retained.csv",
      format: "CSV",
      uploadRequestId: randomUUID(),
      parserOptions: { format: "CSV", hasHeader: true },
    },
    Buffer.from("Title\nRetained\n"),
  );
  return { owner, collection, id: result.job.id, key: `imports/${result.job.id}/source` };
}
const logger = { error: vi.fn() };
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual known-source retention and erasure",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      root = await mkdtemp(join(tmpdir(), "sammlerraum-source-cleanup-"));
      lock = createMediaAssetLocker(isolated.databaseUrl);
      storage = new LocalPersistentStorage(root, lock);
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (root) await rm(root, { recursive: true, force: true });
    });
    it("retains a known manifest through parent erasure and deletes only its own source bytes", async () => {
      const f = await fixture();
      await storage.put("unrelated/keep", Buffer.from("keep"));
      await db.collection.delete({ where: { id: f.collection } });
      expect(
        await db.$queryRaw`SELECT "jobId" FROM "ImportSourceObject" WHERE id=${f.id}::uuid`,
      ).toEqual([{ jobId: null }]);
      expect(await storage.exists(f.key)).toBe(true);
      await createImportSourceCleanup(db, storage, lock, logger).run();
      expect(await storage.exists(f.key)).toBe(false);
      expect(await storage.exists("unrelated/keep")).toBe(true);
      const [row] = await db.$queryRaw<
        { deletedAt: Date | null }[]
      >`SELECT "deletedAt" FROM "ImportSourceObject" WHERE id=${f.id}::uuid`;
      expect(row!.deletedAt).not.toBeNull();
    });
    it("does not delete while real source I/O ownership is held", async () => {
      const f = await fixture();
      await db.collection.delete({ where: { id: f.collection } });
      let release!: () => void, enter!: () => void;
      const entered = new Promise<void>((resolve) => {
          enter = resolve;
        }),
        held = lock(
          `import-source:${f.id}`,
          async () => {
            enter();
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          },
          true,
        );
      await entered;
      const cleanup = createImportSourceCleanup(db, storage, lock, logger);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const attempt = cleanup.run();
      try {
        await Promise.race([
          attempt,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(Error("Cleanup waited on an active source")), 1000);
          }),
        ]);
        expect(await storage.exists(f.key)).toBe(true);
      } finally {
        if (timer) clearTimeout(timer);
        release();
        await held;
        await attempt;
      }
      await cleanup.run();
      expect(await storage.exists(f.key)).toBe(false);
    });
    it("retains a deletion failure for an actual retry instead of losing its manifest", async () => {
      const f = await fixture();
      await db.collection.delete({ where: { id: f.collection } });
      let fail = true;
      const flaky = {
        put: storage.put.bind(storage),
        read: storage.read.bind(storage),
        exists: storage.exists.bind(storage),
        delete: async (key: string) => {
          if (key === f.key && fail) {
            fail = false;
            throw Error("synthetic deletion outage");
          }
          await storage.delete(key);
        },
      };
      const cleanup = createImportSourceCleanup(db, flaky, lock, logger);
      await cleanup.run();
      const [first] = await db.$queryRaw<
        { cleanupStartedAt: Date | null; deletedAt: Date | null }[]
      >`SELECT "cleanupStartedAt","deletedAt" FROM "ImportSourceObject" WHERE id=${f.id}::uuid`;
      expect(first!.cleanupStartedAt).not.toBeNull();
      expect(first!.deletedAt).toBeNull();
      expect(await storage.exists(f.key)).toBe(true);
      await cleanup.run();
      expect(await storage.exists(f.key)).toBe(false);
    });
    it("expires unapproved sources but preserves an active approved commit and unrelated inventory", async () => {
      const f = await fixture(),
        expired = randomUUID(),
        active = randomUUID(),
        bytes = Buffer.from("Title\n"),
        checksum = createHash("sha256").update(bytes).digest("hex"),
        mapping = { schemaVersion: 1, locale: "de", columns: { title: 0 } };
      for (const [id, status] of [
        [expired, "AWAITING_UPLOAD"],
        [active, "COMMITTING"],
      ] as const) {
        await db.$executeRaw`INSERT INTO "ImportJob" (id,"ownerId","collectionId",locale,status,"sourceFormat","sourceFileName","sourceByteSize","sourceChecksumSha256","sourceStorageKey","sourceExpiresAt","sourceVerifiedAt","totalRows","parsedRows","previewedRows","previewGeneration","mappingSnapshot","mappingHash","commitApprovedAt","commitApprovalRevision","updatedAt") VALUES (${id}::uuid,${f.owner},${f.collection}::uuid,'de',${status}::"ImportJobStatus",'CSV','expired.csv',${BigInt(bytes.length)},${checksum},${`imports/${id}/source`},timezone('UTC',now())-interval '1 second',timezone('UTC',now()),0,0,0,1,${JSON.stringify(mapping)}::jsonb,${createHash("sha256").update(JSON.stringify(mapping)).digest("hex")},${status === "COMMITTING" ? new Date() : null},${status === "COMMITTING" ? 1 : null},now())`;
        await db.$executeRaw`INSERT INTO "ImportSourceObject" (id,"jobId","storageKey","expiresAt") VALUES (${id}::uuid,${id}::uuid,${`imports/${id}/source`},timezone('UTC',now())-interval '1 second')`;
        await storage.put(`imports/${id}/source`, bytes);
      }
      const item = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection, title: "Must remain", quantity: 2 },
      });
      await createImportSourceCleanup(db, storage, lock, logger).run();
      expect(await storage.exists(`imports/${expired}/source`)).toBe(false);
      expect(await storage.exists(`imports/${active}/source`)).toBe(true);
      expect(await storage.exists(f.key)).toBe(true);
      expect(
        await db.collectibleItem.findUnique({
          where: { id: item.id },
          select: { title: true, quantity: true },
        }),
      ).toEqual({ title: "Must remain", quantity: 2 });
      expect(await db.$queryRaw`SELECT status FROM "ImportJob" WHERE id=${active}::uuid`).toEqual([
        { status: "COMMITTING" },
      ]);
    });
    it("keeps known cleanup keys beyond seven days and removes an actual late source write", async () => {
      const id = randomUUID(),
        key = `imports/${id}/source`;
      await db.$executeRaw`INSERT INTO "ImportSourceObject" (id,"storageKey","expiresAt","createdAt","cleanupStartedAt","deletedAt") VALUES (${id}::uuid,${key},timezone('UTC',now())-interval '9 days',timezone('UTC',now())-interval '10 days',timezone('UTC',now())-interval '8 days',timezone('UTC',now())-interval '8 days')`;
      await storage.put(key, Buffer.from("late source bytes"));
      await createImportSourceCleanup(db, storage, lock, logger).run();
      expect(await storage.exists(key)).toBe(false);
      expect(
        await db.$queryRaw`SELECT id FROM "ImportSourceObject" WHERE id=${id}::uuid`,
      ).toHaveLength(1);
    });

    it("cancels a parser with actual paused source I/O and deletes bytes only after settlement", async () => {
      const f = await fixture(),
        core = createImportService(db);
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((resolve) => {
          enter = resolve;
        }),
        paused = {
          put: storage.put.bind(storage),
          exists: storage.exists.bind(storage),
          delete: storage.delete.bind(storage),
          read: async (...args: Parameters<LocalPersistentStorage["read"]>) => {
            enter();
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return storage.read(...args);
          },
        };
      const parsing = createImportParser(
        createPrismaImportParserRepository(db),
        paused,
        {},
        lock,
      )({ jobId: f.id });
      await entered;
      try {
        const current = await core.getImportJob({ userId: f.owner }, f.id);
        expect(
          (
            await core.cancelImport(
              { userId: f.owner },
              { jobId: f.id, expectedRevision: current.revision },
            )
          ).status,
        ).toBe("CANCELLED");
        await createImportSourceCleanup(db, storage, lock, logger).run();
        expect(await storage.exists(f.key)).toBe(true);
        expect(await db.collectibleItem.count({ where: { ownerId: f.owner } })).toBe(0);
      } finally {
        release();
        await parsing;
      }
      await createImportSourceCleanup(db, storage, lock, logger).run();
      expect(await storage.exists(f.key)).toBe(false);
    });
  },
);
