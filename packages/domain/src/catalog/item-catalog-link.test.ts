import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createResourceQuery } from "../api/resource-query";
import { createItemService, type ItemDatabase } from "../items/item-service";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService, createCatalogMutationService } from "./catalog-service";
import {
  createConditionMaintenanceService,
  createConditionService,
} from "../condition/condition-service";
import { createGradingService } from "../grading/grading-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const prefix = `link_${randomUUID().replaceAll("-", "")}`;
const ownerId = `CatalogOwner_${randomUUID()}`;
let collectionId: string;
let categoryId: string;
let entryId: string;
let variantId: string;
let conditionId: string;
const service = () => createItemService(db!, ownerId);

describe.runIf(enabled)("personal catalog links PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: {
        id: ownerId,
        name: "Link fixture",
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    collectionId = (await db!.collection.create({ data: { ownerId, name: "Link fixture" } })).id;
    const template = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
      key: prefix,
      labels: { de: "Kategorie", en: "Category" },
    });
    categoryId = template.id;
    const entry = await createCatalogMaintenanceService(db!).createCatalogEntry({
      categoryTemplateId: categoryId,
      text: { language: "de", title: "Katalog" },
    });
    entryId = entry.state.id;
    const variant = await createCatalogMaintenanceService(db!).addCatalogVariant(entryId, 1, {
      text: { language: "de", title: "Variante" },
      edition: "First",
      reference: "001",
    });
    variantId = variant.id;
    const scheme = await createConditionMaintenanceService(db!).createConditionScheme({
      categoryTemplateId: categoryId,
      key: prefix,
      labels: { de: "Zustand", en: "Condition" },
      options: [{ labelKey: "good", labels: { de: "Gut", en: "Good" }, normalizedBand: 3 }],
    });
    conditionId = scheme.options[0]!.id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: ownerId } });
    const categories = await db.categoryTemplate.findMany({
      where: { key: { startsWith: prefix } },
      select: { id: true },
    });
    const ids = categories.map((row) => row.id);
    const entries = await db.catalogEntry.findMany({
      where: { categoryTemplateId: { in: ids } },
      select: { id: true },
    });
    const entryIds = entries.map((row) => row.id);
    await db.catalogAttributeValue.deleteMany({ where: { entryId: { in: entryIds } } });
    await db.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: entryIds } } });
    await db.catalogVariant.deleteMany({ where: { entryId: { in: entryIds } } });
    await db.catalogRevision.deleteMany({ where: { entryId: { in: entryIds } } });
    await db.catalogEntry.deleteMany({ where: { id: { in: entryIds } } });
    await db.conditionOption.deleteMany({ where: { categoryTemplateId: { in: ids } } });
    await db.conditionScheme.deleteMany({ where: { categoryTemplateId: { in: ids } } });
    await db.categoryTemplate.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it("keeps the personal item and independent facts when its catalog link is removed", async () => {
    const target = await service().createItem({
      collectionId,
      title: "Personal title",
      privateNotes: "Private retention",
      purchaseAmountMinor: 1234,
      purchaseCurrency: "EUR",
    });
    const condition = createConditionService(db!, ownerId);
    await condition.setItemCategory(target.id, { categoryTemplateId: categoryId });
    await condition.setItemCondition(target.id, conditionId);
    const grade = await createGradingService(db!, ownerId).addGrading(target.id, {
      provider: "Fixture",
      grade: "10",
      certificateNo: "001",
    });
    await db!.collectibleItem.update({
      where: { id: target.id },
      data: { catalogEntryId: entryId, catalogVariantId: variantId },
    });
    await service().unlinkItemFromCatalog(target.id);
    const persisted = await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted).toMatchObject({
      id: target.id,
      catalogEntryId: null,
      catalogVariantId: null,
      categoryTemplateId: categoryId,
      conditionOptionId: conditionId,
      privateNotes: "Private retention",
      purchaseAmountMinor: 1234n,
      purchaseCurrency: "EUR",
      quantity: 1,
      title: "Personal title",
    });
    expect(await createGradingService(db!, ownerId).getGrading(target.id, grade.id)).toEqual(grade);
  });
  it("infers only an absent category and integrates DTO, resource reads and split", async () => {
    const target = await service().createItem({ collectionId, title: "Many", quantity: 3 });
    const linked = await service().linkItemToCatalog(
      target.id.toUpperCase(),
      entryId.toUpperCase(),
      variantId.toUpperCase(),
    );
    const expected = {
      categoryTemplateId: categoryId,
      catalogEntryId: entryId,
      catalogVariantId: variantId,
    };
    expect(linked).toMatchObject(expected);
    expect((await createResourceQuery(db!).loadItem(target.id)).item).toMatchObject(expected);
    expect(
      (await createResourceQuery(db!).listItems(collectionId, ownerId)).find(
        (row) => row.id === target.id,
      ),
    ).toMatchObject(expected);
    const condition = createConditionService(db!, ownerId);
    await condition.setItemCondition(target.id, conditionId);
    const split = await service().splitQuantityItem(target.id, 1);
    for (const result of [split.source, split.created])
      expect(result).toMatchObject({ ...expected, conditionOptionId: conditionId });
  });
  it("requires explicit unlink before category changes and never silently clears condition", async () => {
    const target = await service().createItem({ collectionId, title: "Scoped" });
    const other = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
      key: `${prefix}_other`,
      labels: { de: "Andere", en: "Other" },
    });
    const condition = createConditionService(db!, ownerId);
    await condition.setItemCategory(target.id, { categoryTemplateId: other.id });
    await expect(service().linkItemToCatalog(target.id, entryId)).rejects.toMatchObject({
      code: "ITEM_CATALOG_CATEGORY_MISMATCH",
    });
    await condition.setItemCategory(target.id, { categoryTemplateId: categoryId });
    await condition.setItemCondition(target.id, conditionId);
    await service().linkItemToCatalog(target.id, entryId);
    for (const next of [other.id, null])
      await expect(
        condition.setItemCategory(target.id, { categoryTemplateId: next, clearCondition: true }),
      ).rejects.toMatchObject({ code: "CATALOG_UNLINK_REQUIRED" });
    expect((await condition.getItemCondition(target.id)).conditionOption?.id).toBe(conditionId);
    await condition.setItemCategory(target.id, { categoryTemplateId: categoryId });
    await service().unlinkItemFromCatalog(target.id);
    await condition.setItemCategory(target.id, {
      categoryTemplateId: other.id,
      clearCondition: true,
    });
  });
  it("checks entry/variant scope and preserves retired existing references without offering new selections", async () => {
    const canonical = createCatalogMaintenanceService(db!);
    const entry = await canonical.createCatalogEntry({
      categoryTemplateId: categoryId,
      text: { language: "en", title: "Retirement" },
    });
    const variant = await canonical.addCatalogVariant(entry.state.id, 1, {
      text: { language: "en", title: "Distinct" },
      language: "de",
      edition: "First",
      reference: "0007",
    });
    const target = await service().createItem({ collectionId, title: "Retained", quantity: 3 });
    await expect(service().linkItemToCatalog(target.id, entryId, variant.id)).rejects.toMatchObject(
      { code: "CATALOG_VARIANT_NOT_FOUND" },
    );
    await service().linkItemToCatalog(target.id, entry.state.id, variant.id);
    await canonical.rollbackCatalogEntry(entry.state.id, 2, 1);
    expect(await service().getItemCatalogLink(target.id)).toMatchObject({
      catalogVariantId: variant.id,
      variant: {
        id: variant.id,
        active: false,
        language: "de",
        edition: "First",
        reference: "0007",
      },
      entry: { revision: 3 },
    });
    await service().linkItemToCatalog(target.id, entry.state.id, variant.id);
    const fresh = await service().createItem({ collectionId, title: "Fresh" });
    await expect(
      service().linkItemToCatalog(fresh.id, entry.state.id, variant.id),
    ).rejects.toMatchObject({ code: "CATALOG_VARIANT_INACTIVE" });
    const split = await service().splitQuantityItem(target.id, 1);
    expect(split.created.catalogVariantId).toBe(variant.id);
    expect(split.source.catalogVariantId).toBe(variant.id);
  });
  it("hides foreign/deleted items and retains owner reads for inactive items", async () => {
    const target = await service().createItem({ collectionId, title: "Lifecycle" });
    const foreign = createItemService(db!, ownerId.toLowerCase());
    await expect(foreign.linkItemToCatalog(target.id, entryId)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    await expect(foreign.unlinkItemFromCatalog(target.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    await expect(foreign.getItemCatalogLink(target.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    await service().linkItemToCatalog(target.id, entryId);
    await service().archiveItem(target.id);
    expect((await service().getItemCatalogLink(target.id)).catalogEntryId).toBe(entryId);
    await expect(service().linkItemToCatalog(target.id, entryId)).rejects.toMatchObject({
      code: "ITEM_INACTIVE",
    });
    await expect(service().unlinkItemFromCatalog(target.id)).rejects.toMatchObject({
      code: "ITEM_INACTIVE",
    });
    await service().deleteItem(target.id);
    await expect(service().getItemCatalogLink(target.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });
  it("enforces native partial-null and relational guards independently of services", async () => {
    const target = await service().createItem({ collectionId, title: "Database guards" });
    await expect(
      db!
        .$executeRaw`UPDATE "CollectibleItem" SET "catalogEntryId"=${entryId}::uuid WHERE id=${target.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      db!
        .$executeRaw`UPDATE "CollectibleItem" SET "catalogVariantId"=${variantId}::uuid WHERE id=${target.id}::uuid`,
    ).rejects.toThrow();
    const other = await db!.categoryTemplate.create({ data: { key: `${prefix}_scope` } });
    await expect(
      db!
        .$executeRaw`UPDATE "CollectibleItem" SET "catalogEntryId"=${entryId}::uuid,"categoryTemplateId"=${other.id}::uuid WHERE id=${target.id}::uuid`,
    ).rejects.toThrow();
    const second = await createCatalogMaintenanceService(db!).createCatalogEntry({
      categoryTemplateId: categoryId,
      text: { language: "en", title: "Second" },
    });
    await expect(
      db!
        .$executeRaw`UPDATE "CollectibleItem" SET "catalogEntryId"=${second.state.id}::uuid,"categoryTemplateId"=${categoryId}::uuid,"catalogVariantId"=${variantId}::uuid WHERE id=${target.id}::uuid`,
    ).rejects.toThrow();
  });
  it("preserves personal category/condition when otherwise deletable catalog targets disappear", async () => {
    const target = await service().createItem({ collectionId, title: "Target deletion" });
    await createConditionService(db!, ownerId).setItemCategory(target.id, {
      categoryTemplateId: categoryId,
    });
    await createConditionService(db!, ownerId).setItemCondition(target.id, conditionId);
    const syntheticEntry = await db!.catalogEntry.create({
      data: {
        categoryTemplateId: categoryId,
        authored: {
          text: { language: "en", title: "Deletion fixture", description: "", translations: [] },
          sources: [],
        },
      },
    });
    const syntheticVariant = await db!.catalogVariant.create({
      data: {
        entryId: syntheticEntry.id,
        authored: {
          text: { language: "en", title: "Deletion variant", description: "", translations: [] },
        },
      },
    });
    await db!.collectibleItem.update({
      where: { id: target.id },
      data: { catalogEntryId: syntheticEntry.id, catalogVariantId: syntheticVariant.id },
    });
    await db!.catalogVariant.delete({ where: { id: syntheticVariant.id } });
    expect(await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject(
      {
        catalogEntryId: syntheticEntry.id,
        catalogVariantId: null,
        categoryTemplateId: categoryId,
        conditionOptionId: conditionId,
      },
    );
    await db!.catalogEntry.delete({ where: { id: syntheticEntry.id } });
    expect(await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject(
      {
        catalogEntryId: null,
        catalogVariantId: null,
        categoryTemplateId: categoryId,
        conditionOptionId: conditionId,
      },
    );
    await expect(db!.catalogEntry.delete({ where: { id: entryId } })).rejects.toThrow();
  });
  it("pins column-specific native SET NULL actions and supporting indexes", async () => {
    const rows = await db!.$queryRaw<
      Array<{ name: string; columns: string[]; updateAction: string; deleteAction: string }>
    >`
      SELECT c.conname AS name, ARRAY(SELECT a.attname::text FROM unnest(c.confdelsetcols) WITH ORDINALITY AS d(attnum,position) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=d.attnum ORDER BY d.position) AS columns,c.confupdtype::text AS "updateAction",c.confdeltype::text AS "deleteAction"
      FROM pg_constraint c WHERE c.conrelid='"CollectibleItem"'::regclass AND c.conname IN ('CollectibleItem_catalogEntryId_categoryTemplateId_fkey','CollectibleItem_catalogVariantId_catalogEntryId_fkey') ORDER BY name
    `;
    expect(rows).toEqual([
      {
        name: "CollectibleItem_catalogEntryId_categoryTemplateId_fkey",
        columns: ["catalogEntryId"],
        updateAction: "r",
        deleteAction: "n",
      },
      {
        name: "CollectibleItem_catalogVariantId_catalogEntryId_fkey",
        columns: ["catalogVariantId"],
        updateAction: "r",
        deleteAction: "n",
      },
    ]);
    const indexes = await db!.$queryRaw<
      Array<{ indexname: string }>
    >`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('CollectibleItem_catalogEntryId_categoryTemplateId_idx','CollectibleItem_catalogVariantId_catalogEntryId_idx','CatalogExternalIdentifier_value_active_entryId_idx')`;
    expect(indexes).toHaveLength(3);
  });

  it("retries changed split parents three times without copying or decrementing", async () => {
    const target = await service().createItem({ collectionId, title: "Retry", quantity: 3 });
    await service().linkItemToCatalog(target.id, entryId, variantId);
    let discoveries = 0;
    const instrumented: ItemDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work(
              new Proxy(tx, {
                get(object, key) {
                  if (key !== "$queryRaw") return Reflect.get(object, key);
                  return async (query: TemplateStringsArray, ...values: unknown[]) => {
                    const result = await tx.$queryRaw(query, ...values);
                    if (
                      query
                        .join("")
                        .includes('SELECT item."catalogEntryId",item."catalogVariantId"')
                    ) {
                      discoveries++;
                      await service().linkItemToCatalog(
                        target.id,
                        entryId,
                        discoveries % 2 === 1 ? null : variantId,
                      );
                    }
                    return result;
                  };
                },
              }),
            ),
          options,
        ),
    };
    await expect(
      createItemService(instrumented, ownerId).splitQuantityItem(target.id, 1),
    ).rejects.toMatchObject({ code: "ITEM_CATALOG_RETRY_EXHAUSTED" });
    expect(discoveries).toBe(3);
    expect(
      (await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).quantity,
    ).toBe(3);
    expect(await db!.collectibleItem.count({ where: { collectionId, title: "Retry" } })).toBe(1);
  });
  it("waits for a canonical writer before active validation and rejects its retired variant", async () => {
    const canonical = createCatalogMaintenanceService(db!);
    const entry = await canonical.createCatalogEntry({
      categoryTemplateId: categoryId,
      text: { language: "en", title: "Writer race" },
    });
    const variant = await canonical.addCatalogVariant(entry.state.id, 1, {
      text: { language: "en", title: "Before rollback" },
    });
    const target = await service().createItem({ collectionId, title: "Concurrent selection" });
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const unblock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writer = db!.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CatalogEntry" WHERE id=${entry.state.id}::uuid FOR UPDATE`;
      await createCatalogMutationService(tx).rollbackCatalogEntry(entry.state.id, 2, 1);
      acquired();
      await unblock;
    });
    await held;
    const linking = service()
      .linkItemToCatalog(target.id, entry.state.id, variant.id)
      .then(
        () => ({ code: "UNEXPECTED_SUCCESS" }),
        (error: { code: string }) => error,
      );
    try {
      await waitForLock('FROM "CatalogEntry" WHERE id=');
    } finally {
      release();
    }
    await writer;
    expect(await linking).toMatchObject({ code: "CATALOG_VARIANT_INACTIVE" });
    expect(
      (await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).catalogEntryId,
    ).toBeNull();
  });
  it("holds parent locks while waiting on the item so a canonical writer cannot invert the order", async () => {
    const target = await service().createItem({ collectionId, title: "Parent before item" });
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const unblock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = db!.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CollectibleItem" WHERE id=${target.id}::uuid FOR UPDATE`;
      acquired();
      await unblock;
    });
    await held;
    const linking = service().linkItemToCatalog(target.id, entryId, variantId);
    let writing: Promise<unknown> | undefined;
    try {
      await waitForLock("FOR UPDATE OF item");
      writing = db!.$transaction(async (tx) => {
        await createCatalogMutationService(tx).updateCatalogEntry(entryId, 2, {
          text: { language: "en", title: "After concurrent linking" },
        });
      });
      await waitForLock('FROM "CatalogEntry" WHERE "id" =');
    } finally {
      release();
      await blocker;
      await linking;
      await writing;
    }
    await blocker;
    expect((await linking).catalogVariantId).toBe(variantId);
    await writing;
  });

  it("revalidates a changed split link before copying the new reference on a later attempt", async () => {
    const target = await service().createItem({
      collectionId,
      title: "Retry success",
      quantity: 3,
    });
    await service().linkItemToCatalog(target.id, entryId, variantId);
    let discoveries = 0;
    const instrumented: ItemDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work(
              new Proxy(tx, {
                get(object, key) {
                  if (key !== "$queryRaw") return Reflect.get(object, key);
                  return async (query: TemplateStringsArray, ...values: unknown[]) => {
                    const result = await tx.$queryRaw(query, ...values);
                    if (
                      query
                        .join("")
                        .includes('SELECT item."catalogEntryId",item."catalogVariantId"') &&
                      ++discoveries === 1
                    )
                      await service().linkItemToCatalog(target.id, entryId);
                    return result;
                  };
                },
              }),
            ),
          options,
        ),
    };
    const split = await createItemService(instrumented, ownerId).splitQuantityItem(target.id, 1);
    expect(discoveries).toBe(2);
    for (const result of [split.source, split.created])
      expect(result).toMatchObject({ catalogEntryId: entryId, catalogVariantId: null });
    expect(split.source.quantity + split.created.quantity).toBe(3);
  });
  it("rechecks category under the shared item lock after a competing category change", async () => {
    const target = await service().createItem({ collectionId, title: "Category race" });
    const other = await db!.categoryTemplate.create({ data: { key: `${prefix}_race` } });
    let acquired!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const unblock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const changing = db!.$transaction(async (tx) => {
      await tx.$queryRaw`UPDATE "CollectibleItem" SET "categoryTemplateId"=${other.id}::uuid WHERE id=${target.id}::uuid RETURNING id`;
      acquired();
      await unblock;
    });
    await held;
    const linking = service()
      .linkItemToCatalog(target.id, entryId)
      .then(
        () => ({ code: "UNEXPECTED_SUCCESS" }),
        (error: { code: string }) => error,
      );
    try {
      await waitForLock("FOR UPDATE OF item");
    } finally {
      release();
    }
    await changing;
    expect(await linking).toMatchObject({ code: "ITEM_CATALOG_CATEGORY_MISMATCH" });
    expect(await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject(
      { categoryTemplateId: other.id, catalogEntryId: null },
    );
  });
  it("rejects disposed items and hides items in a deleted collection", async () => {
    const disposed = await service().createItem({ collectionId, title: "Disposed" });
    await service().linkItemToCatalog(disposed.id, entryId);
    await service().updateItem(disposed.id, { disposedAt: "2026-01-01T00:00:00.000Z" });
    expect((await service().getItemCatalogLink(disposed.id)).catalogEntryId).toBe(entryId);
    await expect(service().unlinkItemFromCatalog(disposed.id)).rejects.toMatchObject({
      code: "ITEM_INACTIVE",
    });
    await expect(service().linkItemToCatalog(disposed.id, entryId)).rejects.toMatchObject({
      code: "ITEM_INACTIVE",
    });
    const hiddenCollection = await db!.collection.create({
      data: { ownerId, name: "Hidden catalog links" },
    });
    const hidden = await service().createItem({
      collectionId: hiddenCollection.id,
      title: "Hidden",
    });
    await db!.collection.update({
      where: { id: hiddenCollection.id },
      data: { deletedAt: new Date() },
    });
    await expect(service().getItemCatalogLink(hidden.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    await expect(service().linkItemToCatalog(hidden.id, entryId)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    await expect(service().unlinkItemFromCatalog(hidden.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });
});

async function waitForLock(fragment: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await db!.$queryRaw<
      Array<{ present: boolean }>
    >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND position(${fragment} in query)>0) AS present`;
    if (rows[0]?.present) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No PostgreSQL lock wait observed for ${fragment}`);
}
