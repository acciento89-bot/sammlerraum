import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createExportService } from "./export-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID(),
    item = randomUUID();
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Synthetic export',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Export',now())`;
  await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,quantity,"privateNotes","updatedAt") VALUES (${item}::uuid,${owner},${collection}::uuid,'Owned export',2,'Private note must stay private',now())`;
  return { owner, collection, item, actor: { userId: owner } };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual owned export source capture",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("captures only owned rows and excludes private note/document data by default", async () => {
      const own = await fixture(),
        foreign = await fixture(),
        service = createExportService(db);
      const snapshot = await service.captureExportSource(own.actor, {
        scope: { kind: "ALL" },
        format: "CSV",
        locale: "de",
      });
      expect(snapshot.money.rows.map((row) => row.itemId)).toEqual([own.item]);
      expect(JSON.stringify(snapshot)).not.toContain(foreign.item);
      expect(JSON.stringify(snapshot)).not.toContain("Private note must stay private");
      expect(snapshot.metadata[0]).not.toHaveProperty("privateNotes");
      expect(JSON.stringify(snapshot)).not.toContain("privateDocument");
    });
    it("refuses a foreign collection instead of creating a misleading export", async () => {
      const own = await fixture(),
        foreign = await fixture(),
        service = createExportService(db);
      await expect(
        service.requestExport(own.actor, {
          scope: { kind: "COLLECTION", collectionId: foreign.collection },
          format: "XLSX",
          locale: "en",
        }),
      ).rejects.toMatchObject({ code: "EXPORT_NOT_FOUND" });
    });
    it("creates an owned pending job and limits concurrent pending exports", async () => {
      const f = await fixture(),
        service = createExportService(db),
        input = {
          scope: { kind: "COLLECTION", collectionId: f.collection },
          format: "CSV",
          locale: "de",
        };
      const one = await service.requestExport(f.actor, input);
      expect(one).toMatchObject({ status: "PENDING" });
      expect(one).not.toHaveProperty("storageKey");
      await service.requestExport(f.actor, input);
      await service.requestExport(f.actor, input);
      await expect(service.requestExport(f.actor, input)).rejects.toMatchObject({
        code: "EXPORT_LIMIT_EXCEEDED",
      });
    });
    it("includes private notes only after an explicit owned metadata opt-in", async () => {
      const f = await fixture(),
        service = createExportService(db),
        source = await service.captureExportSource(f.actor, {
          scope: { kind: "COLLECTION", collectionId: f.collection },
          format: "XLSX",
          locale: "en",
          includePrivateNotes: true,
        });
      expect(source.metadata[0]).toMatchObject({ privateNotes: "Private note must stay private" });
    });
  },
);
