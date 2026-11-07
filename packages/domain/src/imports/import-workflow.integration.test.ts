import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createImportCommitService } from "./import-commit-service";
import { createImportCommitter } from "../../../../apps/worker/src/jobs/commit-import";
import { createImportService } from "./import-service";
import { createImportWorkflowService } from "./import-workflow-service";
import { createImportDispatcher } from "../../../../apps/worker/src/jobs/import-dispatcher";
import { createPrismaImportParserRepository } from "../../../../apps/worker/src/jobs/import-parser-repository";
import { createImportParser } from "../../../../apps/worker/src/jobs/import-parser-runtime";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  folder: string,
  storage: LocalPersistentStorage,
  lock: ReturnType<typeof createMediaAssetLocker>;
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID(),
    actor = { userId: owner };
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Upload owner',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Upload',now())`;
  return {
    owner,
    collection,
    actor,
    input: {
      collectionId: collection,
      locale: "de",
      fileName: "own.csv",
      format: "CSV",
      uploadRequestId: randomUUID(),
      parserOptions: { format: "CSV", hasHeader: true },
    },
  };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual owned source upload lifecycle",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      folder = await mkdtemp(join(tmpdir(), "sammlerraum-upload-"));
      lock = createMediaAssetLocker(isolated.databaseUrl);
      storage = new LocalPersistentStorage(folder, lock);
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (folder) await rm(folder, { recursive: true, force: true });
    });
    it("stores actual bytes and an owned uploaded manifest without claiming parsed or writing inventory", async () => {
      const f = await fixture(),
        bytes = Buffer.from("Title,Quantity\nOwn item,2\n"),
        service = createImportWorkflowService(db, storage, lock),
        result = await service.uploadImport(f.actor, f.input, bytes);
      expect(result.job.status).toBe("AWAITING_UPLOAD");
      expect(result.uploadReady).toBe(true);
      expect(result.job.source.verified).toBe(false);
      const [manifest] = await db.$queryRaw<
        {
          sourceStorageKey: string;
          sourceChecksumSha256: string;
          sourceByteSize: bigint;
          uploadCompletedAt: Date | null;
        }[]
      >`SELECT "sourceStorageKey","sourceChecksumSha256","sourceByteSize","uploadCompletedAt" FROM "ImportJob" WHERE id=${result.job.id}::uuid`;
      expect(manifest).toMatchObject({
        sourceChecksumSha256: createHash("sha256").update(bytes).digest("hex"),
        sourceByteSize: BigInt(bytes.length),
      });
      expect(manifest?.uploadCompletedAt).not.toBeNull();
      expect(
        Buffer.from(await storage.read(manifest!.sourceStorageKey, { maxBytes: bytes.length })),
      ).toEqual(bytes);
      expect(JSON.stringify(result)).not.toContain(manifest!.sourceStorageKey);
      expect(await db.collectibleItem.count({ where: { ownerId: f.owner } })).toBe(0);
    });
    it("reuses an owner-scoped upload key on exact retry and rejects changed data under that key", async () => {
      const f = await fixture(),
        service = createImportWorkflowService(db, storage, lock),
        bytes = Buffer.from("Title\nExact\n");
      const first = await service.uploadImport(f.actor, f.input, bytes),
        second = await service.uploadImport(f.actor, f.input, bytes);
      expect(second.job.id).toBe(first.job.id);
      expect(
        await db.$queryRaw`SELECT id FROM "ImportJob" WHERE "ownerId"=${f.owner}`,
      ).toHaveLength(1);
      await expect(
        service.uploadImport(f.actor, f.input, Buffer.from("Title\nChanged\n")),
      ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
    });
    it("retains a failed write manifest and allows the same upload to recover without duplicate jobs", async () => {
      const f = await fixture();
      let fail = true;
      const flaky = {
        read: storage.read.bind(storage),
        exists: storage.exists.bind(storage),
        delete: storage.delete.bind(storage),
        put: async (key: string, bytes: Uint8Array) => {
          if (fail) {
            fail = false;
            throw new Error("private storage failure");
          }
          await storage.put(key, bytes);
        },
      };
      const service = createImportWorkflowService(db, flaky, lock),
        bytes = Buffer.from("Title\nRetry\n");
      await expect(service.uploadImport(f.actor, f.input, bytes)).rejects.toMatchObject({
        code: "SEARCH_UNAVAILABLE",
      });
      const before = await db.$queryRaw<
        { uploadCompletedAt: Date | null; parserOptions: unknown }[]
      >`SELECT "uploadCompletedAt","parserOptions" FROM "ImportJob" WHERE "ownerId"=${f.owner}`;
      expect(before).toEqual([{ uploadCompletedAt: null, parserOptions: null }]);
      const result = await service.uploadImport(f.actor, f.input, bytes);
      expect(result.uploadReady).toBe(true);
      expect(
        await db.$queryRaw`SELECT id FROM "ImportJob" WHERE "ownerId"=${f.owner}`,
      ).toHaveLength(1);
    });
    it("hides foreign targets before source I/O and rejects caller storage or byte-count claims", async () => {
      const f = await fixture(),
        other = await fixture(),
        put = vi.spyOn(storage, "put"),
        service = createImportWorkflowService(db, storage, lock);
      await expect(
        service.uploadImport(
          f.actor,
          { ...f.input, collectionId: other.collection },
          Buffer.from("Title\nA"),
        ),
      ).rejects.toMatchObject({ code: "IMPORT_NOT_FOUND" });
      expect(put).not.toHaveBeenCalled();
      await expect(
        service.uploadImport(f.actor, { ...f.input, storageKey: "foreign/path" }, Buffer.from("A")),
      ).rejects.toMatchObject({ code: "IMPORT_INVALID" });
      put.mockRestore();
    });
    it("dispatches parsing and explicit commit as distinct stages without inherited cooldown", async () => {
      const f = await fixture(),
        bytes = Buffer.from("Title,Quantity\nDispatched item,2\n"),
        service = createImportWorkflowService(db, storage, lock);
      const uploaded = await service.uploadImport(f.actor, f.input, bytes);
      const pending: { name: string; jobId: string }[] = [];
      const dispatcher = createImportDispatcher(
        db,
        {
          enqueue: async (name: string, payload: { jobId: string }) => {
            pending.push({ name, jobId: payload.jobId });
            return randomUUID();
          },
        },
        { error: () => {} },
      );
      await dispatcher.dispatchOnce();
      expect(pending.filter((v) => v.jobId === uploaded.job.id)).toEqual([
        { name: "imports.parse-source", jobId: uploaded.job.id },
      ]);
      await createImportParser(
        createPrismaImportParserRepository(db),
        storage,
        {},
        lock,
      )({ jobId: uploaded.job.id });
      expect(
        await db.$queryRaw`SELECT status,"parsedRows" FROM "ImportJob" WHERE id=${uploaded.job.id}::uuid`,
      ).toEqual([{ status: "PARSED", parsedRows: 1 }]);
      expect(await db.collectibleItem.count({ where: { ownerId: f.owner } })).toBe(0);
      pending.length = 0;
      await dispatcher.dispatchOnce();
      expect(pending.some((v) => v.jobId === uploaded.job.id)).toBe(false);
      const core = createImportService(db),
        commit = createImportCommitService(db),
        parsed = await core.getImportJob(f.actor, uploaded.job.id),
        preview = await core.buildImportPreview(f.actor, {
          jobId: parsed.id,
          expectedRevision: parsed.revision,
          mapping: { schemaVersion: 1, locale: "de", columns: { title: 0, quantity: 1 } },
        });
      const saved = await commit.saveDecisions(f.actor, {
        jobId: parsed.id,
        expectedRevision: preview.job.revision,
        previewGeneration: preview.job.previewGeneration,
        decisions: [{ rowNumber: 1, action: "CREATE" }],
      });
      await commit.approveCommit(f.actor, {
        jobId: parsed.id,
        expectedRevision: saved.revision,
        previewGeneration: preview.job.previewGeneration,
      });
      await dispatcher.dispatchOnce();
      expect(pending.filter((v) => v.jobId === parsed.id)).toEqual([
        { name: "imports.commit", jobId: parsed.id },
      ]);
      await createImportCommitter(commit)({ jobId: parsed.id });
      expect(await db.collectibleItem.count({ where: { ownerId: f.owner } })).toBe(1);
    });
    it("limits active source jobs but allows an exact retry at the quota", async () => {
      const f = await fixture(),
        service = createImportWorkflowService(db, storage, lock),
        bytes = Buffer.from("Title\nQuota\n");
      const first = await service.uploadImport(f.actor, f.input, bytes);
      for (let n = 0; n < 2; n++)
        await service.uploadImport(f.actor, { ...f.input, uploadRequestId: randomUUID() }, bytes);
      await expect(
        service.uploadImport(f.actor, { ...f.input, uploadRequestId: randomUUID() }, bytes),
      ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
      expect((await service.uploadImport(f.actor, f.input, bytes)).job.id).toBe(first.job.id);
    });

    it("does not expose an expired source job or let the parser claim it", async () => {
      const f = await fixture(),
        id = randomUUID();
      await db.$executeRaw`INSERT INTO "ImportJob" (id,"ownerId","collectionId",locale,"sourceFormat","sourceFileName","sourceByteSize","sourceChecksumSha256","sourceStorageKey","sourceExpiresAt","parserOptions","updatedAt") VALUES (${id}::uuid,${f.owner},${f.collection}::uuid,'de','CSV','expired.csv',1,${"a".repeat(64)},${`imports/${id}/source`},timezone('UTC',CURRENT_TIMESTAMP)-interval '1 second',${JSON.stringify({ format: "CSV", hasHeader: true })}::jsonb,now())`;
      await expect(createImportService(db).getImportState(f.actor, id)).rejects.toMatchObject({
        code: "IMPORT_NOT_FOUND",
      });
      expect(await createPrismaImportParserRepository(db).claim(id)).toBeNull();
    });

    it("gives source manifests exactly24hours even when the database session uses Berlin time", async () => {
      const f = await fixture(),
        id = randomUUID();
      const rows = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'Europe/Berlin'`;
        return tx.$queryRaw<
          { seconds: number }[]
        >`INSERT INTO "ImportJob" (id,"ownerId","collectionId",locale,"sourceFormat","sourceFileName","sourceByteSize","sourceChecksumSha256","sourceStorageKey","updatedAt") VALUES (${id}::uuid,${f.owner},${f.collection}::uuid,'de','CSV','clock.csv',1,${"b".repeat(64)},${`imports/${id}/source`},now()) RETURNING extract(epoch FROM ("sourceExpiresAt"-timezone('UTC',CURRENT_TIMESTAMP)))::double precision AS seconds`;
      });
      expect(rows[0]!.seconds).toBeCloseTo(86400, 0);
    });
  },
);
