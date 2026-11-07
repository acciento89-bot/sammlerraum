import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createMediaCleanupService } from "@sammlerraum/domain/media/cleanup-service";
import { createMediaCleanupJob } from "./cleanup-media";
import { createPrivateArtifactExpiry } from "./private-artifact-expiry";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  root: string,
  storage: LocalPersistentStorage,
  lock: ReturnType<typeof createMediaAssetLocker>;
async function fixture(report = false, active = false, linked = false) {
  const owner = randomUUID(),
    id = randomUUID(),
    assetId = randomUUID(),
    token = randomUUID(),
    collection = randomUUID(),
    itemId = randomUUID(),
    key = `${report ? "reports" : "exports"}/${id}/${token}/data.${report ? "pdf" : "csv"}`,
    bytes = Buffer.from("synthetic expired output");
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Artifact expiry',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Artifact expiry',now())`;
  await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"updatedAt") VALUES (${itemId}::uuid,${owner},${collection}::uuid,'Retained item',now())`;
  await db.$executeRaw`INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","updatedAt") VALUES (${assetId}::uuid,${owner},'DOCUMENT','READY',${key},${report ? "application/pdf" : "text/csv"},${BigInt(bytes.length)},${createHash("sha256").update(bytes).digest("hex")},'own-output',now())`;
  await storage.put(key, bytes);
  const request = JSON.stringify({
    scope: { kind: "COLLECTION", collectionId: collection },
    locale: "de",
    ...(report ? { include: [] } : { format: "CSV" }),
  });
  if (report)
    await db.$executeRaw`INSERT INTO "ReportJob" (id,"ownerId",format,locale,request,status,"artifactId","processingToken","processingLeaseUntil","processingAttempts","createdAt","expiresAt","updatedAt") VALUES (${id}::uuid,${owner},'PDF','de',${request}::jsonb,${active ? "BUILDING" : "PENDING"}::"ExportJobStatus",${assetId}::uuid,${active ? token : null}::uuid,CASE WHEN ${active} THEN timezone('UTC',now())+interval '90 seconds' ELSE NULL END,1,timezone('UTC',now())-interval '25 hours',timezone('UTC',now())-interval '1 second',now())`;
  else
    await db.$executeRaw`INSERT INTO "ExportJob" (id,"ownerId",format,locale,request,status,"artifactId","processingToken","processingLeaseUntil","processingAttempts","createdAt","expiresAt","updatedAt") VALUES (${id}::uuid,${owner},'CSV','de',${request}::jsonb,${active ? "BUILDING" : "PENDING"}::"ExportJobStatus",${assetId}::uuid,${active ? token : null}::uuid,CASE WHEN ${active} THEN timezone('UTC',now())+interval '90 seconds' ELSE NULL END,1,timezone('UTC',now())-interval '25 hours',timezone('UTC',now())-interval '1 second',now())`;
  if (linked)
    await db.$executeRaw`INSERT INTO "DocumentLink" (id,"ownerId","itemId","assetId",visibility,position,"createdAt") VALUES (${randomUUID()}::uuid,${owner},${itemId}::uuid,${assetId}::uuid,'PRIVATE',0,now())`;
  return { owner, id, assetId, key, itemId };
}
function cleanup() {
  return createMediaCleanupJob(
    createMediaCleanupService(db, { retentionHours: 168 }),
    storage,
    lock,
    { error: () => {} },
  );
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual private artifact expiry through known media manifests",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      root = await mkdtemp(join(tmpdir(), "sammlerraum-artifact-expiry-"));
      lock = createMediaAssetLocker(isolated.databaseUrl);
      storage = new LocalPersistentStorage(root, lock);
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (root) await rm(root, { recursive: true, force: true });
    });
    it("erases expired job snapshots and only their known unlinked output files", async () => {
      const tabular = await fixture(),
        report = await fixture(true);
      await storage.put("unrelated/keep", Buffer.from("keep"));
      await createPrivateArtifactExpiry(db, { retentionHours: 168 }).run();
      expect(await db.$queryRaw`SELECT id FROM "ExportJob" WHERE id=${tabular.id}::uuid`).toEqual(
        [],
      );
      expect(await db.$queryRaw`SELECT id FROM "ReportJob" WHERE id=${report.id}::uuid`).toEqual(
        [],
      );
      await cleanup().run();
      expect(await storage.exists(tabular.key)).toBe(false);
      expect(await storage.exists(report.key)).toBe(false);
      expect(await storage.exists("unrelated/keep")).toBe(true);
      expect(
        await db.mediaAsset.count({ where: { id: { in: [tabular.assetId, report.assetId] } } }),
      ).toBe(0);
      expect(
        await db.$queryRaw`SELECT "storageKey" FROM "MediaCleanupKey" WHERE "storageKey" IN (${tabular.key},${report.key})`,
      ).toHaveLength(2);
    });
    it("preserves an active generation lease even if its request has just expired", async () => {
      const f = await fixture(false, true);
      await createPrivateArtifactExpiry(db, { retentionHours: 168 }).run();
      await cleanup().run();
      expect(await storage.exists(f.key)).toBe(true);
      expect(await db.$queryRaw`SELECT status FROM "ExportJob" WHERE id=${f.id}::uuid`).toEqual([
        { status: "BUILDING" },
      ]);
    });
    it("keeps file deletion behind actual output I/O ownership and reconciles after settlement", async () => {
      const f = await fixture();
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((r) => {
          enter = r;
        }),
        held = lock(
          f.assetId,
          async () => {
            enter();
            await new Promise<void>((r) => {
              release = r;
            });
            await storage.put(f.key, Buffer.from("late settled output"));
          },
          true,
        );
      await entered;
      try {
        await createPrivateArtifactExpiry(db, { retentionHours: 168 }).run();
        await cleanup().run();
        expect(await storage.exists(f.key)).toBe(true);
        expect(await db.mediaAsset.count({ where: { id: f.assetId } })).toBe(1);
      } finally {
        release();
        await held;
      }
      await cleanup().run();
      expect(await storage.exists(f.key)).toBe(false);
    });
    it("preserves a document explicitly retained by a live own item while expiring its job", async () => {
      const f = await fixture(true, false, true);
      await createPrivateArtifactExpiry(db, { retentionHours: 168 }).run();
      await cleanup().run();
      expect(await db.$queryRaw`SELECT id FROM "ReportJob" WHERE id=${f.id}::uuid`).toEqual([]);
      expect(await storage.exists(f.key)).toBe(true);
      expect(await db.documentLink.count({ where: { assetId: f.assetId } })).toBe(1);
      expect(
        await db.collectibleItem.findUnique({ where: { id: f.itemId }, select: { title: true } }),
      ).toEqual({ title: "Retained item" });
    });
  },
);
