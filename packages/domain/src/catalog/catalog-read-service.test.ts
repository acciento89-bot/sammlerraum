import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCatalogMaintenanceService, createCatalogMutationService } from "./catalog-service";
import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogReadService } from "./catalog-read-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const prefix = `reads_${randomUUID().replaceAll("-", "")}`;
let categoryId: string;
const entryIds: string[] = [];
const service = () => createCatalogReadService(db!);

describe.runIf(enabled)("bounded canonical reads PostgreSQL", () => {
  beforeAll(async () => {
    const category = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
      key: prefix,
      labels: { de: "Münzen", en: "Coins" },
      definitions: [
        {
          key: "material",
          labels: { de: "Material", en: "Material" },
          type: "SINGLE_SELECT",
          options: [{ key: "silver", labels: { de: "Silber", en: "Silver" } }],
        },
      ],
    });
    categoryId = category.id;
    const canonical = createCatalogMaintenanceService(db!);
    for (let index = 0; index < 3; index++) {
      const entry = await canonical.createCatalogEntry({
        categoryTemplateId: categoryId,
        text: {
          language: "de",
          title: `${prefix} Münze ${index}`,
          description: "Description must not be in search summaries",
          translations: [
            {
              language: "en",
              title: `${prefix} Coin ${index}`,
              description: "English description",
            },
          ],
        },
        sources: [{ note: "Authored source", license: "CC0" }],
      });
      entryIds.push(entry.state.id);
      let revision = entry.revision;
      for (let variant = 0; variant < 6; variant++) {
        const result = await canonical.addCatalogVariant(entry.state.id, revision, {
          text: { language: "en", title: `Edition ${variant}`, description: "Variant description" },
          language: "de",
          edition: `edition_${variant}`,
          reference: `ref%_${variant}`,
        });
        revision = result.revision;
      }
      for (let identifier = 0; identifier < 6; identifier++) {
        const result = await canonical.addExternalIdentifier(entry.state.id, revision, {
          namespace: "fixture",
          type: "reference",
          value: identifier === 0 ? "00123-Ab" : `identifier_${identifier}`,
          sources: [{ note: "Identifier source" }],
        });
        revision = result.revision;
      }
    }
  });
  afterAll(async () => {
    if (!db) return;
    const entries = await db.catalogEntry.findMany({
      where: { categoryTemplate: { key: prefix } },
      select: { id: true },
    });
    const ids = entries.map(({ id }) => id);
    await db.catalogAttributeValue.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogVariant.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogRevision.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogEntry.deleteMany({ where: { id: { in: ids } } });
    await db.categoryTemplate.deleteMany({ where: { key: prefix } });
    await db.$disconnect();
  });
  it("searches authored translations and disambiguation with compact previews and keyset pages", async () => {
    const first = await service().searchCatalog({
      mode: "text",
      q: `${prefix} Coin`,
      categoryId,
      limit: 2,
    });
    expect(first.results).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service().searchCatalog({
      mode: "text",
      q: `${prefix} Coin`,
      categoryId,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.results).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.results, ...second.results].map((row) => row.id))).toEqual(
      new Set(entryIds),
    );
    expect(first.results[0]).toMatchObject({
      category: { id: categoryId, key: prefix, labels: { de: "Münzen", en: "Coins" } },
      variantCount: 6,
      identifierCount: 6,
    });
    expect(first.results[0]!.variants).toHaveLength(5);
    expect(first.results[0]!.identifiers).toHaveLength(5);
    const serialized = JSON.stringify(first);
    for (const forbidden of [
      "description",
      "snapshot",
      "privateNotes",
      "purchaseAmountMinor",
      "proposerId",
      "moderatorId",
      "ownerId",
      "email",
    ])
      expect(serialized).not.toContain(`"${forbidden}"`);
    expect(
      (await service().searchCatalog({ mode: "text", q: "ref%_4", categoryId })).results,
    ).toHaveLength(3);
    expect(
      (await service().searchCatalog({ mode: "text", q: "ref%_8", categoryId })).results,
    ).toHaveLength(0);
    expect(
      (await service().searchCatalog({ mode: "text", q: "%%", categoryId })).results,
    ).toHaveLength(0);
  });
  it("uses exact case-preserving identifiers and rejects mismatched cursor/filter reuse", async () => {
    const first = await service().searchCatalog({
      mode: "identifier",
      q: "00123-Ab",
      namespace: "fixture",
      type: "reference",
      categoryId,
      limit: 1,
    });
    expect(first.results).toHaveLength(1);
    expect(first.results[0]!.identifiers[0]!.sources).toEqual([{ note: "Identifier source" }]);
    expect(
      (await service().searchCatalog({ mode: "identifier", q: "00123-ab", categoryId })).results,
    ).toHaveLength(0);
    expect(
      (await service().searchCatalog({ mode: "identifier", q: "123-Ab", categoryId })).results,
    ).toHaveLength(0);
    await expect(
      service().searchCatalog({
        mode: "identifier",
        q: "different",
        categoryId,
        cursor: first.nextCursor,
      }),
    ).rejects.toThrow();
    await expect(
      service().searchCatalog({ mode: "identifier", q: "00123-Ab", categoryId, cursor: "broken" }),
    ).rejects.toThrow();
  });
  it("reads category summaries separately from typed template detail and coherent current snapshots", async () => {
    let cursor: string | undefined;
    let found: unknown;
    do {
      const page = await service().listCategories({ limit: 50, cursor });
      found = page.categories.find((row) => row.id === categoryId) ?? found;
      expect(page.categories.every((row) => !Object.hasOwn(row, "definitions"))).toBe(true);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(found).toMatchObject({ id: categoryId, key: prefix });
    expect(await service().getCategoryTemplate(categoryId.toUpperCase())).toMatchObject({
      id: categoryId,
      definitions: [{ key: "material", type: "SINGLE_SELECT", options: [{ key: "silver" }] }],
    });
    const current = await service().getCurrentCatalogEntry(entryIds[0]!.toUpperCase());
    expect(current).toMatchObject({
      revision: 13,
      state: {
        id: entryIds[0],
        categoryTemplateId: categoryId,
        variants: expect.any(Array),
        sources: [{ note: "Authored source", license: "CC0" }],
      },
    });
    await expect(service().getCurrentCatalogEntry(randomUUID())).rejects.toMatchObject({
      code: "CATALOG_NOT_FOUND",
    });
  });
  it("bounds queries and disallows private/unknown request fields", async () => {
    for (const input of [
      { mode: "text", q: "a" },
      { mode: "text", q: "x".repeat(201) },
      { mode: "identifier", q: "x".repeat(501) },
      { mode: "text", q: "test", namespace: "fixture" },
      { mode: "text", q: "test", ownerId: "private" },
      { mode: "text", q: "test", limit: 51 },
      { mode: "text", q: "test", cursor: "x".repeat(2049) },
    ])
      await expect(service().searchCatalog(input)).rejects.toThrow();
  });
  it("returns one committed immutable snapshot while a canonical revision is in flight", async () => {
    const entryId = entryIds[0]!;
    const before = await service().getCurrentCatalogEntry(entryId);
    let acquired!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const unblock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writer = db!.$transaction(async (tx) => {
      await createCatalogMutationService(tx).updateCatalogEntry(entryId, before.revision, {
        text: { language: "en", title: "Coherent new title" },
      });
      acquired();
      await unblock;
    });
    await held;
    try {
      expect(await service().getCurrentCatalogEntry(entryId)).toEqual(before);
      const hits = await service().searchCatalog({ mode: "text", q: prefix, categoryId });
      expect(hits.results.find((row) => row.id === entryId)).toMatchObject({
        revision: before.revision,
        text: { title: before.state.text.title },
      });
    } finally {
      release();
    }
    await writer;
    expect(await service().getCurrentCatalogEntry(entryId)).toMatchObject({
      revision: before.revision + 1,
      state: { text: { title: "Coherent new title" } },
    });
  });
  it("excludes retired identifiers and variant-only matches after canonical rollback", async () => {
    const entryId = entryIds[1]!;
    await createCatalogMaintenanceService(db!).rollbackCatalogEntry(entryId, 13, 1);
    const byIdentifier = await service().searchCatalog({
      mode: "identifier",
      q: "00123-Ab",
      categoryId,
    });
    expect(byIdentifier.results.map((row) => row.id)).not.toContain(entryId);
    const byVariant = await service().searchCatalog({ mode: "text", q: "edition_4", categoryId });
    expect(byVariant.results.map((row) => row.id)).not.toContain(entryId);
    expect((await service().getCurrentCatalogEntry(entryId)).state.variants).toHaveLength(0);
  });
});
