import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createExportService } from "../../../../packages/domain/src/exports/export-service";
import { createPrismaTabularExportRepository } from "./tabular-export-repository";
import { createTabularExportJob } from "./tabular-export-runtime";
import { parseImportSource } from "./parse-import";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  root: string,
  storage: LocalPersistentStorage,
  lock: ReturnType<typeof createMediaAssetLocker>;
async function fixture(format: "CSV" | "XLSX" = "CSV") {
  const owner = randomUUID(),
    collection = randomUUID(),
    itemId = randomUUID(),
    actor = { userId: owner };
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Export worker',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Worker export',now())`;
  await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"privateNotes","updatedAt") VALUES (${itemId}::uuid,${owner},${collection}::uuid,'Owned export worker','Do not publish this note',now())`;
  const service = createExportService(db),
    job = await service.requestExport(actor, {
      scope: { kind: "COLLECTION", collectionId: collection },
      format,
      locale: "de",
    });
  return {
    owner,
    collection,
    itemId,
    actor,
    service,
    job,
    repo: createPrismaTabularExportRepository(db),
  };
}
async function state(id: string) {
  return (
    await db.$queryRaw<
      {
        status: string;
        artifactId: string | null;
        sourceJson: string | null;
        sourceHash: string | null;
        errorCode: string | null;
      }[]
    >`SELECT status,"artifactId","sourceJson","sourceHash","errorCode" FROM "ExportJob" WHERE id=${id}::uuid`
  )[0]!;
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "real tabular export source, assets and bytes",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      root = await mkdtemp(join(tmpdir(), "sammlerraum-export-worker-"));
      lock = createMediaAssetLocker(isolated.databaseUrl);
      storage = new LocalPersistentStorage(root, lock);
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (root) await rm(root, { recursive: true, force: true });
    });
    it.each(["CSV", "XLSX"] as const)(
      "publishes one complete owned %s artifact and reuses successful delivery",
      async (format) => {
        const f = await fixture(format),
          handler = createTabularExportJob(f.repo, f.service, storage, lock);
        await handler({ jobId: f.job.id });
        await handler({ jobId: f.job.id });
        const job = await state(f.job.id);
        expect(job.status).toBe("READY");
        const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: job.artifactId! } });
        expect(asset).toMatchObject({ ownerId: f.owner, kind: "DOCUMENT", status: "READY" });
        const bytes = await storage.read(asset.storageKey, { maxBytes: 32 * 1024 * 1024 });
        expect(asset.byteSize).toBe(BigInt(bytes.length));
        expect(asset.checksumSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
        const rows = [];
        for await (const row of parseImportSource(bytes, {
          format,
          hasHeader: true,
          sourceProfile: "SAMMLERRAUM_TABULAR_V1",
        }))
          rows.push(row);
        expect(rows[0]?.cells[0]).toBe("Owned export worker");
        expect(new TextDecoder().decode(bytes)).not.toContain("Do not publish this note");
        expect(await db.mediaAsset.count({ where: { ownerId: f.owner } })).toBe(1);
      },
    );
    it("retains every attempt manifest and retries storage failure using the immutable source", async () => {
      const f = await fixture(),
        put = storage.put.bind(storage);
      let fail = true;
      const flaky = {
        read: storage.read.bind(storage),
        exists: storage.exists.bind(storage),
        delete: storage.delete.bind(storage),
        put: async (key: string, bytes: Uint8Array) => {
          if (fail) {
            fail = false;
            throw new Error("synthetic storage outage");
          }
          await put(key, bytes);
        },
      };
      const handler = createTabularExportJob(f.repo, f.service, flaky, lock);
      await expect(handler({ jobId: f.job.id })).rejects.toThrow("Export temporarily unavailable");
      const first = await state(f.job.id);
      expect(first.status).toBe("PENDING");
      expect(first.sourceJson).not.toBeNull();
      await handler({ jobId: f.job.id });
      const second = await state(f.job.id);
      expect(second.status).toBe("READY");
      expect(second.sourceJson).toBe(first.sourceJson);
      expect(second.sourceHash).toBe(first.sourceHash);
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner } })).toBe(2);
    });
    it("refuses stale data instead of silently replacing the saved export source", async () => {
      const f = await fixture();
      let fail = true;
      const flaky = {
        read: storage.read.bind(storage),
        exists: storage.exists.bind(storage),
        delete: storage.delete.bind(storage),
        put: async (key: string, bytes: Uint8Array) => {
          if (fail) {
            fail = false;
            throw new Error("synthetic outage");
          }
          await storage.put(key, bytes);
        },
      };
      const handler = createTabularExportJob(f.repo, f.service, flaky, lock);
      await expect(handler({ jobId: f.job.id })).rejects.toThrow("Export temporarily unavailable");
      const source = (await state(f.job.id)).sourceJson;
      await db.collectibleItem.update({
        where: { id: f.itemId },
        data: { title: "Owner changed title" },
      });
      await handler({ jobId: f.job.id });
      expect(await state(f.job.id)).toMatchObject({
        status: "FAILED",
        errorCode: "EXPORT_STALE",
        sourceJson: source,
      });
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner, status: "READY" } })).toBe(0);
    });
    it("fences expired claims, tracks abandoned outputs and closes exhausted attempts", async () => {
      const f = await fixture(),
        first = await f.repo.claim(f.job.id);
      expect(first).not.toBeNull();
      expect(await f.repo.claim(f.job.id)).toBeNull();
      await db.$executeRaw`UPDATE "ExportJob" SET "processingLeaseUntil"=now()-interval '1 second' WHERE id=${f.job.id}::uuid`;
      const second = await f.repo.claim(f.job.id);
      expect(second?.assetId).not.toBe(first!.assetId);
      expect(await f.repo.active(first!)).toBe(false);
      expect(await f.repo.renew(first!)).toBe(false);
      expect(await f.repo.fail(first!, "EXPORT_CANCELLED", true)).toBe(false);
      expect(await state(f.job.id)).toMatchObject({
        status: "BUILDING",
        artifactId: second!.assetId,
      });
      await db.$executeRaw`UPDATE "ExportJob" SET "processingLeaseUntil"=now()-interval '1 second',"processingAttempts"=5 WHERE id=${f.job.id}::uuid`;
      expect(await f.repo.claim(f.job.id)).toBeNull();
      expect(await state(f.job.id)).toMatchObject({
        status: "FAILED",
        errorCode: "EXPORT_ATTEMPTS_EXHAUSTED",
      });
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner } })).toBe(2);
    });
    it("does not publish after owner access disappears while file storage is in flight", async () => {
      const f = await fixture();
      const erase = {
        read: storage.read.bind(storage),
        exists: storage.exists.bind(storage),
        delete: storage.delete.bind(storage),
        put: async (key: string, bytes: Uint8Array) => {
          await storage.put(key, bytes);
          await db.$executeRaw`UPDATE "Collection" SET "deletedAt"=now() WHERE id=${f.collection}::uuid`;
        },
      };
      await createTabularExportJob(f.repo, f.service, erase, lock)({ jobId: f.job.id });
      expect(await state(f.job.id)).toMatchObject({
        status: "FAILED",
        errorCode: "EXPORT_NOT_FOUND",
      });
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner, status: "READY" } })).toBe(0);
    });
    it("keeps the actual asset lock until ignored cancellation settles and never marks its bytes ready", async () => {
      const f = await fixture(),
        controller = new AbortController();
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((r) => (enter = r)),
        blocked = new Promise<void>((r) => (release = r));
      const slow = {
        read: storage.read.bind(storage),
        exists: storage.exists.bind(storage),
        delete: storage.delete.bind(storage),
        put: async (key: string, bytes: Uint8Array) => {
          enter();
          await blocked;
          await storage.put(key, bytes);
        },
      };
      const pending = createTabularExportJob(
        f.repo,
        f.service,
        slow,
        lock,
      )({ jobId: f.job.id }, { signal: controller.signal });
      const outcome = pending.then(
        () => null,
        (e) => e,
      );
      await entered;
      controller.abort();
      const during = await state(f.job.id);
      let competing = false;
      expect(
        await lock(
          during.artifactId!,
          async () => {
            competing = true;
          },
          false,
        ),
      ).toBe(false);
      expect(competing).toBe(false);
      expect(during.status).toBe("BUILDING");
      release();
      expect((await outcome)?.message).toBe("Export temporarily unavailable");
      expect(await state(f.job.id)).toMatchObject({ status: "PENDING" });
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner, status: "READY" } })).toBe(0);
    });
    it("does not retain a job permission or source after its owned artifact is deleted", async () => {
      const f = await fixture();
      await createTabularExportJob(f.repo, f.service, storage, lock)({ jobId: f.job.id });
      const job = await state(f.job.id);
      await db.mediaAsset.delete({ where: { id: job.artifactId! } });
      expect(await db.$queryRaw`SELECT id FROM "ExportJob" WHERE id=${f.job.id}::uuid`).toEqual([]);
    });

    it("closes a whole-source export limit permanently instead of retrying an impossible build", async () => {
      const f = await fixture();
      await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"updatedAt") SELECT gen_random_uuid(),${f.owner},${f.collection}::uuid,'Over limit '||n,now() FROM generate_series(1,1000) n`;
      await expect(
        createTabularExportJob(f.repo, f.service, storage, lock)({ jobId: f.job.id }),
      ).resolves.toBeUndefined();
      expect(await state(f.job.id)).toMatchObject({
        status: "FAILED",
        errorCode: "EXPORT_LIMIT_EXCEEDED",
      });
    });

    it("retries a busy cleanup lock rather than waiting through an unbounded foreign hold", async () => {
      const f = await fixture();
      let held: Promise<unknown> | undefined, release!: () => void;
      let fallback: ReturnType<typeof setTimeout> | undefined;
      const repo = {
        ...f.repo,
        claim: async (id: string) => {
          const claim = await f.repo.claim(id);
          if (!claim) return null;
          let entered!: () => void;
          const signal = new Promise<void>((r) => (entered = r)),
            blocked = new Promise<void>((r) => (release = r));
          held = lock(claim.assetId, async () => {
            entered();
            await blocked;
          });
          await signal;
          fallback = setTimeout(() => release(), 200);
          return claim;
        },
      };
      try {
        const error = await createTabularExportJob(
          repo,
          f.service,
          storage,
          lock,
        )({ jobId: f.job.id }).then(
          () => null,
          (e) => e,
        );
        expect(error?.message).toBe("Export temporarily unavailable");
        expect(await state(f.job.id)).toMatchObject({ status: "PENDING" });
      } finally {
        if (fallback) clearTimeout(fallback);
        release?.();
        await held;
      }
    });
  },
);
