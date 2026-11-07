import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createInsuranceService } from "../insurance/insurance-service";
import { createReportService } from "./report-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID(),
    item = randomUUID();
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Synthetic report',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Report',now())`;
  await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"privateNotes","updatedAt") VALUES (${item}::uuid,${owner},${collection}::uuid,'Owned report','Secret report note',now())`;
  return { owner, actor: { userId: owner }, collection, item };
}
async function asset(f: Awaited<ReturnType<typeof fixture>>, kind: "IMAGE" | "DOCUMENT") {
  const id = randomUUID();
  await db.$executeRaw`INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","updatedAt") VALUES (${id}::uuid,${f.owner},${kind}::"MediaKind",'READY',${"private/" + id},${kind === "IMAGE" ? "image/png" : "application/pdf"},3,${"0".repeat(64)},'Synthetic evidence',now())`;
  if (kind === "IMAGE")
    await db.$executeRaw`INSERT INTO "MediaLink" (id,"assetId","ownerId","itemId",position) VALUES (${randomUUID()}::uuid,${id}::uuid,${f.owner},${f.item}::uuid,0)`;
  else
    await db.$executeRaw`INSERT INTO "DocumentLink" (id,"assetId","ownerId","itemId",position) VALUES (${randomUUID()}::uuid,${id}::uuid,${f.owner},${f.item}::uuid,0)`;
  return id;
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual selected private report source",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("captures only owned basic fields by default even when private insurance and files exist", async () => {
      const f = await fixture(),
        other = await fixture();
      await asset(f, "DOCUMENT");
      await asset(f, "IMAGE");
      await createInsuranceService(db).setItemInsurance(f.actor, f.item, {
        expectedRevision: 0,
        insurance: {
          amountMinor: "123",
          currency: "EUR",
          valuationDate: "2026-01-01",
          policyReference: "PRIVATE-POLICY",
        },
      });
      const model = await createReportService(db).captureReportSource(f.actor, {
        scope: { kind: "ALL" },
        locale: "de",
      });
      expect(model.items).toHaveLength(1);
      expect(model.items[0]?.itemId).toBe(f.item);
      for (const field of ["privateNotes", "images", "values", "insurance", "storageLocation"])
        expect(model.items[0]).not.toHaveProperty(field);
      const json = JSON.stringify(model);
      expect(json).not.toContain(other.item);
      expect(json).not.toContain("Secret report note");
      expect(json).not.toContain("PRIVATE-POLICY");
      expect(model).not.toHaveProperty("proofs");
    });
    it("selects image and insurance value while excluding unselected policy references", async () => {
      const f = await fixture(),
        image = await asset(f, "IMAGE");
      await createInsuranceService(db).setItemInsurance(f.actor, f.item, {
        expectedRevision: 0,
        insurance: {
          amountMinor: "0",
          currency: "JPY",
          valuationDate: "2026-01-01",
          policyReference: "PRIVATE-POLICY",
        },
      });
      const service = createReportService(db),
        options = {
          scope: { kind: "COLLECTION", collectionId: f.collection },
          locale: "en",
          include: ["images", "insurance"],
        };
      const model = await service.captureReportSource(f.actor, options);
      expect(model.items[0]?.images?.[0]?.assetId).toBe(image);
      expect(model.items[0]?.insurance).toMatchObject({
        revision: 1,
        value: { amountMinor: "0", minorUnitExponent: 0, basis: "PER_UNIT" },
      });
      expect(JSON.stringify(model)).not.toContain("PRIVATE-POLICY");
      expect(
        JSON.stringify(
          await service.captureReportSource(f.actor, {
            ...options,
            include: ["insurance", "policyReferences"],
          }),
        ),
      ).toContain("PRIVATE-POLICY");
    });
    it("requires exact owned current proof links inside the selected scope", async () => {
      const f = await fixture(),
        other = await fixture(),
        proof = await asset(f, "DOCUMENT"),
        foreign = await asset(other, "DOCUMENT"),
        service = createReportService(db),
        options = {
          scope: { kind: "COLLECTION", collectionId: f.collection },
          locale: "de",
          include: ["proofs"],
          proofAssetIds: [proof],
        };
      expect(
        (await service.captureReportSource(f.actor, options)).proofs?.map((p) => p.assetId),
      ).toEqual([proof]);
      await expect(
        service.captureReportSource(f.actor, { ...options, proofAssetIds: [foreign] }),
      ).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
      await db.$executeRaw`DELETE FROM "DocumentLink" WHERE "assetId"=${proof}::uuid`;
      await expect(service.captureReportSource(f.actor, options)).rejects.toMatchObject({
        code: "REPORT_NOT_FOUND",
      });
    });
    it("creates only an owned durable PDF intent and rejects foreign collections", async () => {
      const f = await fixture(),
        other = await fixture(),
        service = createReportService(db);
      const job = await service.requestInsuranceReport(f.actor, {
        scope: { kind: "COLLECTION", collectionId: f.collection },
        locale: "de",
      });
      expect(job).toMatchObject({ status: "PENDING" });
      expect(job).not.toHaveProperty("sourceJson");
      expect(await db.$queryRaw`SELECT format FROM "ReportJob" WHERE id=${job.id}::uuid`).toEqual([
        { format: "PDF" },
      ]);
      await expect(
        service.requestInsuranceReport(f.actor, {
          scope: { kind: "COLLECTION", collectionId: other.collection },
          locale: "de",
        }),
      ).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
    });
    it("captures all filtered matches beyond the first search page", async () => {
      const f = await fixture();
      await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"updatedAt") SELECT gen_random_uuid(),${f.owner},${f.collection}::uuid,'Filter report match '||n,now() FROM generate_series(1,25) n`;
      const model = await createReportService(db).captureReportSource(f.actor, {
        scope: { kind: "SEARCH" },
        query: { text: "Filter report match" },
        locale: "en",
      });
      expect(model.items).toHaveLength(25);
      expect(model.items.map((i) => i.itemId)).not.toContain(f.item);
    });
  },
);
