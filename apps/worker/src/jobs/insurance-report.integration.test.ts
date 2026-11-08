import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createReportService } from "../../../../packages/domain/src/reports/report-service";
import { createPrismaReportRepository } from "./insurance-report-repository";
import { createInsuranceReportJob } from "./insurance-report-runtime";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  folder: string,
  storage: LocalPersistentStorage,
  lock: ReturnType<typeof createMediaAssetLocker>;
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID(),
    item = randomUUID(),
    actor = { userId: owner };
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'PDF worker',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'PDF',now())`;
  await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"privateNotes","updatedAt") VALUES (${item}::uuid,${owner},${collection}::uuid,'Real private PDF','Never default publish',now())`;
  const service = createReportService(db),
    job = await service.requestInsuranceReport(actor, {
      scope: { kind: "COLLECTION", collectionId: collection },
      locale: "de",
    });
  return { owner, collection, item, actor, service, job, repo: createPrismaReportRepository(db) };
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
    >`SELECT status,"artifactId","sourceJson","sourceHash","errorCode" FROM "ReportJob" WHERE id=${id}::uuid`
  )[0]!;
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual durable protected PDF artifacts",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      folder = await mkdtemp(join(tmpdir(), "sammlerraum-report-worker-"));
      lock = createMediaAssetLocker(isolated.databaseUrl);
      storage = new LocalPersistentStorage(folder, lock);
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (folder) await rm(folder, { recursive: true, force: true });
    });
    it("publishes one complete owned PDF asset and does not recreate duplicate successful delivery", async () => {
      const f = await fixture(),
        handler = createInsuranceReportJob(f.repo, f.service, storage, lock);
      await handler({ jobId: f.job.id });
      await handler({ jobId: f.job.id });
      const job = await state(f.job.id);
      expect(job.status).toBe("READY");
      expect(job.sourceJson).not.toContain("Never default publish");
      const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id: job.artifactId! } });
      expect(asset).toMatchObject({
        ownerId: f.owner,
        status: "READY",
        kind: "DOCUMENT",
        mimeType: "application/pdf",
      });
      const bytes = await storage.read(asset.storageKey, { maxBytes: 33554432 });
      expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
      expect(asset.checksumSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(asset.byteSize).toBe(BigInt(bytes.length));
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner } })).toBe(1);
    });
    it("retries storage failure with the same frozen source and known attempt manifests", async () => {
      const f = await fixture();
      let fail = true;
      const flaky = {
        read: storage.read.bind(storage),
        delete: storage.delete.bind(storage),
        exists: storage.exists.bind(storage),
        put: async (key: string, bytes: Uint8Array) => {
          if (fail) {
            fail = false;
            throw new Error("storage outage");
          }
          await storage.put(key, bytes);
        },
      };
      const handler = createInsuranceReportJob(f.repo, f.service, flaky, lock);
      await expect(handler({ jobId: f.job.id })).rejects.toThrow("Report temporarily unavailable");
      const first = await state(f.job.id);
      expect(first.status).toBe("PENDING");
      await handler({ jobId: f.job.id });
      expect(await state(f.job.id)).toMatchObject({
        status: "READY",
        sourceJson: first.sourceJson,
        sourceHash: first.sourceHash,
      });
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner } })).toBe(2);
    });
    it("refuses source access revoked while complete PDF bytes are being stored", async () => {
      const f = await fixture(),
        revoked = {
          read: storage.read.bind(storage),
          delete: storage.delete.bind(storage),
          exists: storage.exists.bind(storage),
          put: async (key: string, bytes: Uint8Array) => {
            await storage.put(key, bytes);
            await db.$executeRaw`UPDATE "Collection" SET "deletedAt"=now() WHERE id=${f.collection}::uuid`;
          },
        };
      await createInsuranceReportJob(f.repo, f.service, revoked, lock)({ jobId: f.job.id });
      expect(await state(f.job.id)).toMatchObject({
        status: "FAILED",
        errorCode: "REPORT_NOT_FOUND",
      });
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner, status: "READY" } })).toBe(0);
    });
    it("embeds exactly the selected private proof bytes in an actual protected PDF", async () => {
      const f = await fixture(),
        sharp = (await import("sharp")).default,
        { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream } = await import("pdf-lib"),
        { inflateSync } = await import("node:zlib");
      const proof = await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#679b9a" },
        })
          .png()
          .toBuffer(),
        assetId = randomUUID(),
        key = "private-proof/" + assetId;
      await storage.put(key, proof);
      await db.$executeRaw`INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","updatedAt") VALUES (${assetId}::uuid,${f.owner},'DOCUMENT','READY',${key},'image/png',${BigInt(proof.length)},${createHash("sha256").update(proof).digest("hex")},'Own selected proof.png',now())`;
      await db.$executeRaw`INSERT INTO "DocumentLink" (id,"assetId","ownerId","itemId",position) VALUES (${randomUUID()}::uuid,${assetId}::uuid,${f.owner},${f.item}::uuid,0)`;
      const job = await f.service.requestInsuranceReport(f.actor, {
        scope: { kind: "COLLECTION", collectionId: f.collection },
        locale: "de",
        include: ["proofs"],
        proofAssetIds: [assetId],
      });
      await createInsuranceReportJob(f.repo, f.service, storage, lock)({ jobId: job.id });
      const done = await state(job.id);
      expect(done.status).toBe("READY");
      const output = await db.mediaAsset.findUniqueOrThrow({ where: { id: done.artifactId! } });
      const doc = await PDFDocument.load(
        await storage.read(output.storageKey, { maxBytes: 33554432 }),
      );
      const names = doc.catalog
        .lookup(PDFName.of("Names"), PDFDict)
        .lookup(PDFName.of("EmbeddedFiles"), PDFDict)
        .lookup(PDFName.of("Names"), PDFArray);
      expect(names.size()).toBe(2);
      const stream = doc.context.lookup(
        names.lookup(1, PDFDict).lookup(PDFName.of("EF"), PDFDict).get(PDFName.of("F")),
      );
      if (!(stream instanceof PDFRawStream)) throw new Error("Selected proof stream missing");
      const bytes =
        stream.dict.get(PDFName.of("Filter"))?.toString() === "/FlateDecode"
          ? inflateSync(stream.getContents())
          : stream.getContents();
      expect(Buffer.from(bytes)).toEqual(proof);
    });
    it("retains real output ownership until cancelled storage actually settles", async () => {
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
      const pending = createInsuranceReportJob(
        f.repo,
        f.service,
        slow,
        lock,
      )({ jobId: f.job.id }, { signal: controller.signal }).then(
        () => null,
        (e) => e,
      );
      try {
        await entered;
        controller.abort();
        const during = await state(f.job.id);
        expect(during.status).toBe("BUILDING");
        expect(await lock(during.artifactId!, async () => true, false)).toBe(false);
      } finally {
        release?.();
      }
      expect((await pending)?.message).toBe("Report temporarily unavailable");
      expect(await state(f.job.id)).toMatchObject({ status: "PENDING" });
      expect(await db.mediaAsset.count({ where: { ownerId: f.owner, status: "READY" } })).toBe(0);
    });
  },
);
