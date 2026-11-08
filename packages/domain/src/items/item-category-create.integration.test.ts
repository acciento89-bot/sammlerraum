import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "./item-service";
import { createPersonalMoneyService } from "../money/personal-money-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
describe.runIf(enabled)("initial item category is atomic and privacy preserving", () => {
  afterAll(async () => db?.$disconnect());
  it("stores category on both normal and explicit-money creation and rejects stale selection without inserting", async () => {
    const owner = randomUUID(),
      outsider = randomUUID(),
      key = "capture_" + randomUUID().replaceAll("-", "");
    await db!.user.createMany({
      data: [owner, outsider].map((id) => ({
        id,
        name: "Owned category test",
        email: id + "@example.test",
        emailVerified: true,
      })),
    });
    const category = await db!.categoryTemplate.create({
      data: {
        key,
        labels: {
          create: [
            { locale: "de", label: "Eigene Testkategorie" },
            { locale: "en", label: "Owned test category" },
          ],
        },
      },
    });
    try {
      const collection = await db!.collection.create({
        data: { ownerId: owner, name: "Mixed owned collection" },
      });
      const service = createItemService(db!, owner);
      const item = await service.createItem({
        collectionId: collection.id,
        title: "Categorized specimen",
        categoryTemplateId: category.id,
      } as Parameters<typeof service.createItem>[0]);
      expect(item.categoryTemplateId).toBe(category.id);
      const explicit = await createPersonalMoneyService(db!, owner).createItemV2({
        schemaVersion: 1,
        item: {
          collectionId: collection.id,
          title: "Explicit specimen",
          categoryTemplateId: category.id,
        },
      });
      expect(explicit.item.categoryTemplateId).toBe(category.id);
      const before = await db!.collectibleItem.count({ where: { collectionId: collection.id } });
      await expect(
        service.createItem({
          collectionId: collection.id,
          title: "Stale category",
          categoryTemplateId: randomUUID(),
        } as Parameters<typeof service.createItem>[0]),
      ).rejects.toMatchObject({ code: "CATALOG_NOT_FOUND" });
      expect(await db!.collectibleItem.count({ where: { collectionId: collection.id } })).toBe(
        before,
      );
      await expect(
        createItemService(db!, outsider).createItem({
          collectionId: collection.id,
          title: "Forbidden",
          categoryTemplateId: randomUUID(),
        } as Parameters<typeof service.createItem>[0]),
      ).rejects.toMatchObject({ code: "COLLECTION_NOT_FOUND" });
      const mixed = await service.createItem({
        collectionId: collection.id,
        title: "Uncategorized allowed",
      });
      expect(mixed.categoryTemplateId).toBeNull();
    } finally {
      await db!.user.deleteMany({ where: { id: { in: [owner, outsider] } } });
      await db!.categoryTemplate.delete({ where: { id: category.id } });
    }
  });
});
