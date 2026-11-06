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
    it("exports a real subtree including descendants but neither siblings nor unassigned items", async () => {
      const f = await fixture(),
        root = randomUUID(),
        child = randomUUID(),
        sibling = randomUUID(),
        childItem = randomUUID(),
        siblingItem = randomUUID();
      await db.$executeRaw`INSERT INTO "CollectionNode" (id,"collectionId",name,"updatedAt") VALUES (${root}::uuid,${f.collection}::uuid,'Root',now()),(${sibling}::uuid,${f.collection}::uuid,'Sibling',now())`;
      await db.$executeRaw`INSERT INTO "CollectionNode" (id,"collectionId","parentId",name,"updatedAt") VALUES (${child}::uuid,${f.collection}::uuid,${root}::uuid,'Child',now())`;
      await db.$executeRaw`UPDATE "CollectibleItem" SET "nodeId"=${root}::uuid WHERE id=${f.item}::uuid`;
      await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId","nodeId",title,"updatedAt") VALUES (${childItem}::uuid,${f.owner},${f.collection}::uuid,${child}::uuid,'Child item',now()),(${siblingItem}::uuid,${f.owner},${f.collection}::uuid,${sibling}::uuid,'Sibling item',now())`;
      const result = await createExportService(db).captureExportSource(f.actor, {
        scope: { kind: "SUBTREE", collectionId: f.collection, nodeId: root },
        format: "CSV",
        locale: "de",
      });
      expect(result.money.rows.map((r) => r.itemId).sort()).toEqual([f.item, childItem].sort());
    });
    it("exports every filtered match beyond the first search page and enforces the full-set ceiling", async () => {
      const f = await fixture();
      await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"updatedAt") SELECT gen_random_uuid(),${f.owner},${f.collection}::uuid,'Selected export '||n,now() FROM generate_series(1,25) n`;
      const service = createExportService(db),
        input = {
          scope: { kind: "SEARCH" },
          query: { text: "Selected export" },
          format: "CSV",
          locale: "en",
        };
      const snapshot = await service.captureExportSource(f.actor, input);
      expect(snapshot.money.rows).toHaveLength(25);
      expect(snapshot.money.rows.map((r) => r.itemId)).not.toContain(f.item);
      await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"updatedAt") SELECT gen_random_uuid(),${f.owner},${f.collection}::uuid,'Selected export ceiling '||n,now() FROM generate_series(1,976) n`;
      await expect(service.captureExportSource(f.actor, input)).rejects.toMatchObject({
        code: "MONEY_EXPORT_LIMIT_EXCEEDED",
      });
    });
    it("does not fetch physical locations until explicitly opted in and excludes deleted parents", async () => {
      const f = await fixture(),
        location = randomUUID();
      await db.$executeRaw`INSERT INTO "StorageLocation" (id,"ownerId",name,"qrToken","updatedAt") VALUES (${location}::uuid,${f.owner},'Secret physical shelf',${randomUUID().replaceAll("-", "") + "abcdefghijk"},now())`;
      await db.$executeRaw`UPDATE "CollectibleItem" SET "storageLocationId"=${location}::uuid WHERE id=${f.item}::uuid`;
      const service = createExportService(db),
        input = { scope: { kind: "ALL" }, format: "CSV", locale: "en" };
      const safe = await service.captureExportSource(f.actor, input);
      expect(JSON.stringify(safe)).not.toContain("Secret physical shelf");
      expect(safe.metadata[0]).not.toHaveProperty("location");
      expect(
        (await service.captureExportSource(f.actor, { ...input, includeLocations: true }))
          .metadata[0],
      ).toMatchObject({ location: { id: location, name: "Secret physical shelf" } });
      await db.$executeRaw`UPDATE "Collection" SET "deletedAt"=now() WHERE id=${f.collection}::uuid`;
      expect((await service.captureExportSource(f.actor, input)).money.rows).toHaveLength(0);
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
