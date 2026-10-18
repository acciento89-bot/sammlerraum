import { Prisma } from "@sammlerraum/db/search-sql";
import type { SearchDatabase } from "./search-read";
import {
  collectionsPageSql,
  collectionsResolveSql,
  customResolveSql,
  customOptionsSql,
} from "./search-reference-sql";
import { encodeReferenceCursor, referenceContextHash } from "./search-reference-cursor";
import { createCatalogReadService } from "../catalog/catalog-read-service";
import { parseItemFilter } from "@sammlerraum/contracts/search";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCollectionService } from "../collections/collection-service";
import { createCustomFieldService } from "../custom-fields/custom-field-service";
import { createCategoryTemplateMaintenanceService } from "../catalog/category-template-service";
import { createConditionMaintenanceService } from "../condition/condition-service";
import { createSearchReferenceService } from "./search-reference-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `reference_${randomUUID()}`,
  foreign = `reference_${randomUUID()}`;
const pagingOwner = `reference_${randomUUID()}`;
const prefix = `ref_${randomUUID().replaceAll("-", "")}`;
let foreignDefinition: string, deletedDefinition: string;
let owned: string,
  publicForeign: string,
  privateForeign: string,
  deleted: string,
  definition: string,
  category: string,
  option: string;
const missing = randomUUID();
describe.runIf(enabled)("bounded search reference native behavior", () => {
  beforeAll(async () => {
    for (const id of [owner, foreign, pagingOwner])
      await db!.user.create({
        data: {
          id,
          name: "Reference fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
        },
      });
    owned = (await createCollectionService(db!, owner).createCollection({ name: "Owned label" }))
      .id;
    publicForeign = (
      await createCollectionService(db!, foreign).createCollection({
        name: "Foreign public label",
        visibility: "PUBLIC",
      })
    ).id;
    privateForeign = (
      await createCollectionService(db!, foreign).createCollection({
        name: "Foreign private label",
      })
    ).id;
    deleted = (
      await createCollectionService(db!, owner).createCollection({ name: "Deleted label" })
    ).id;
    foreignDefinition = (
      await createCustomFieldService(db!, foreign).createFieldDefinition({
        collectionId: publicForeign,
        name: "Hidden foreign field",
        type: "INTEGER",
      })
    ).id;
    deletedDefinition = (
      await createCustomFieldService(db!, owner).createFieldDefinition({
        collectionId: deleted,
        name: "Hidden deleted field",
        type: "INTEGER",
      })
    ).id;
    await createCollectionService(db!, owner).deleteCollection(deleted);
    definition = (
      await createCustomFieldService(db!, owner).createFieldDefinition({
        collectionId: owned,
        name: "Finish",
        type: "SINGLE_SELECT",
        options: ["Brünniert", "Polished"],
      })
    ).id;
    category = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: prefix,
        labels: { de: "Münzen", en: "Coins" },
      })
    ).id;
    const scheme = await createConditionMaintenanceService(db!).createConditionScheme({
      categoryTemplateId: category,
      key: prefix,
      labels: { de: "Zustand", en: "Condition" },
      active: false,
      options: [{ labelKey: "retained.good", labels: { de: "Gut", en: "Good" }, active: false }],
    });
    option = scheme.options[0]!.id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: [owner, foreign, pagingOwner] } } });
    await db.conditionOption.deleteMany({
      where: { scheme: { categoryTemplate: { key: { startsWith: prefix } } } },
    });
    await db.conditionScheme.deleteMany({
      where: { categoryTemplate: { key: { startsWith: prefix } } },
    });
    await db.catalogAttributeOptionLabel.deleteMany({
      where: { option: { definition: { categoryTemplate: { key: { startsWith: prefix } } } } },
    });
    await db.catalogAttributeOption.deleteMany({
      where: { definition: { categoryTemplate: { key: { startsWith: prefix } } } },
    });
    await db.catalogAttributeLabel.deleteMany({
      where: { definition: { categoryTemplate: { key: { startsWith: prefix } } } },
    });
    await db.catalogAttributeDefinition.deleteMany({
      where: { categoryTemplate: { key: { startsWith: prefix } } },
    });
    await db.categoryTemplateLabel.deleteMany({
      where: { categoryTemplate: { key: { startsWith: prefix } } },
    });
    await db.categoryTemplate.deleteMany({ where: { key: { startsWith: prefix } } });
    await db.$disconnect();
  });
  it("returns closed input-ordered owned and unavailable references ", async () => {
    const ids = [missing, publicForeign, owned, deleted, privateForeign];
    const { references: rows } = await createSearchReferenceService(db!).resolveCollections(
      { userId: owner },
      { ids },
    );
    expect(rows).toEqual(
      ids.map((id) =>
        id === owned
          ? { id, state: "AVAILABLE", collection: { id, name: "Owned label" } }
          : { id, state: "UNAVAILABLE", collection: null },
      ),
    );
    expect(definition).toBeTruthy();
  });
  it("returns retained inactive condition metadata ", async () => {
    const result = await createSearchReferenceService(db!).listConditions(
      { userId: owner },
      { categoryId: category },
    );
    expect(result).toMatchObject({
      scheme: { active: false },
      options: [{ id: option, active: false }],
    });
  });

  it("pages 0,1,20,50,51 IDs with stable order, exhausted cursors and changed labels", async () => {
    const actor = { userId: pagingOwner },
      service = createSearchReferenceService(db!);
    expect((await service.listCollections(actor, {})).collections).toEqual([]);
    const producer = createCollectionService(db!, pagingOwner);
    const first = await producer.createCollection({ name: "Same label" });
    expect((await service.listCollections(actor, {})).collections.map((c) => c.id)).toEqual([
      first.id,
    ]);
    for (let n = 1; n < 51; n++) await producer.createCollection({ name: "Same label" });
    const defaultPage = await service.listCollections(actor, {});
    expect(defaultPage.collections).toHaveLength(20);
    const large = await service.listCollections(actor, { limit: 50 });
    expect(large.collections).toHaveLength(50);
    expect(large.nextCursor).toBeTruthy();
    const last = await service.listCollections(actor, { limit: 50, cursor: large.nextCursor });
    expect(last.collections).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
    const all = [...large.collections, ...last.collections].map((c) => c.id);
    expect(all).toEqual([...all].sort());
    expect(new Set(all).size).toBe(51);
    await producer.updateCollection(all[0]!, { name: "Changed label" });
    expect((await service.listCollections(actor, { limit: 1 })).collections[0]).toEqual({
      id: all[0],
      name: "Changed label",
    });
    const exhausted = encodeReferenceCursor({
      v: 1,
      contextHash: referenceContextHash(pagingOwner, "COLLECTIONS", null, 50),
      after: all.at(-1)!,
    });
    expect(
      (await service.listCollections(actor, { limit: 50, cursor: exhausted })).collections,
    ).toEqual([]);
    for (const [other, input] of [
      [{ userId: owner }, { limit: 50, cursor: large.nextCursor }],
      [actor, { limit: 20, cursor: large.nextCursor }],
    ] as const)
      await expect(service.listCollections(other, input)).rejects.toMatchObject({
        code: "SEARCH_INVALID",
      });
    await expect(
      service.listCustomFields(actor, {
        collectionId: first.id,
        limit: 50,
        cursor: large.nextCursor,
      }),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
  });
  it("uses one set read for 1/50 metadata and two for OPTIONS with installed budgets", async () => {
    let calls = 0;
    const statements: Prisma.Sql[] = [];
    const wrapped: SearchDatabase = {
      $transaction: (work, settings) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(query: Prisma.Sql) => {
                calls++;
                statements.push(query);
                return tx.$queryRaw<T>(query);
              },
            }),
          settings,
        ),
    };
    const service = createSearchReferenceService(wrapped),
      actor = { userId: owner };
    await service.resolveCollections(actor, { ids: [owned] });
    expect(calls).toBe(3);
    calls = 0;
    await service.resolveCollections(actor, {
      ids: [owned, ...Array.from({ length: 49 }, () => randomUUID())],
    });
    expect(calls).toBe(3);
    calls = 0;
    await service.resolveCustomFields(actor, {
      references: [[owned, definition], ...Array.from({ length: 49 }, () => [owned, randomUUID()])],
    });
    expect(calls).toBe(3);
    calls = 0;
    await service.resolveCustomFields(actor, {
      references: [[owned, definition]],
      detail: "OPTIONS",
    });
    expect(calls).toBe(5);
    calls = 0;
    await service.resolveConditions(actor, {
      references: [
        [category, option],
        ...Array.from({ length: 49 }, () => [category, randomUUID()]),
      ],
    });
    expect(calls).toBe(3);
    calls = 0;
    await service.resolveCustomFields(actor, {
      references: [
        [owned, definition],
        [owned, missing],
      ],
      detail: "OPTIONS",
    });
    expect(calls).toBe(5);
    expect(statements.filter((q) => q.text.includes("transaction_timeout"))).toHaveLength(6);
    expect(
      statements.every((q) => !q.text.includes('"CollectibleItem"') && !q.text.includes("COUNT(")),
    ).toBe(true);
    console.info(
      "reference native calls",
      JSON.stringify({
        one: 3,
        fifty: 3,
        customSummaryFifty: 3,
        customOptions: 5,
        driverAndAuthExcluded: true,
      }),
    );
  });
  it("resolves custom pairs in input order with exact owned parent and no foreign disclosure", async () => {
    const service = createSearchReferenceService(db!),
      actor = { userId: owner };
    const references = [
      [owned, definition],
      [publicForeign, definition],
      [privateForeign, definition],
      [deleted, definition],
      [missing, definition],
      [owned, missing],
      [publicForeign, foreignDefinition],
      [deleted, deletedDefinition],
    ];
    const result = await service.resolveCustomFields(actor, { references });
    expect(result.references.map((r) => r.reference)).toEqual(references);
    expect(result.references[0]).toMatchObject({
      state: "AVAILABLE",
      definition: { id: definition, collectionId: owned, name: "Finish", type: "SINGLE_SELECT" },
    });
    for (const row of result.references.slice(1))
      expect(row).toEqual({ reference: row.reference, state: "UNAVAILABLE", definition: null });
    const upper = await service.resolveCollections(actor, { ids: [owned.toUpperCase()] });
    expect(upper.references[0]!.id).toBe(owned);
    const detail = await service.resolveCustomFields(actor, {
      references: [[owned, definition]],
      detail: "OPTIONS",
    });
    expect(detail.references[0]).toMatchObject({
      definition: { options: ["Brünniert", "Polished"] },
    });
    const ast = parseItemFilter({
      version: 1,
      root: {
        kind: "customField",
        selector: { source: "CUSTOM", collectionId: owned, definitionId: definition },
        predicate: { valueType: "SINGLE_SELECT", test: { op: "eq", value: "No longer suggested" } },
      },
    });
    expect(JSON.stringify(ast)).toContain("no longer suggested");
    for (const id of [publicForeign, privateForeign, deleted, missing])
      await expect(service.listCustomFields(actor, { collectionId: id })).rejects.toMatchObject({
        code: "FILTER_REFERENCE_INVALID",
      });
    const empty = (await createCollectionService(db!, owner).createCollection({ name: "Empty" }))
      .id;
    expect(await service.listCustomFields(actor, { collectionId: empty })).toMatchObject({
      collection: { id: empty, name: "Empty" },
      definitions: [],
      nextCursor: null,
    });
  });
  it("pages 51 custom definitions and binds parent cursors", async () => {
    const parent = (
      await createCollectionService(db!, owner).createCollection({ name: "Definitions" })
    ).id;
    const producer = createCustomFieldService(db!, owner);
    for (let n = 0; n < 51; n++)
      await producer.createFieldDefinition({
        collectionId: parent,
        name: `Field ${n}`,
        type: "INTEGER",
      });
    const service = createSearchReferenceService(db!),
      actor = { userId: owner };
    const page = await service.listCustomFields(actor, { collectionId: parent, limit: 50 });
    expect(page.definitions).toHaveLength(50);
    const next = await service.listCustomFields(actor, {
      collectionId: parent,
      limit: 50,
      cursor: page.nextCursor,
    });
    expect(next.definitions).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    await expect(
      service.listCustomFields(actor, { collectionId: owned, limit: 50, cursor: page.nextCursor }),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
    await createCollectionService(db!, owner).deleteCollection(parent);
    await expect(service.listCustomFields(actor, { collectionId: parent })).rejects.toMatchObject({
      code: "FILTER_REFERENCE_INVALID",
    });
  });
  it("distinguishes category-only, mismatch, missing and no scheme while retaining inactive metadata", async () => {
    const empty = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
      key: `${prefix}_empty`,
      labels: { de: "Leer", en: "Empty" },
    });
    const service = createSearchReferenceService(db!),
      actor = { userId: owner };
    expect(await service.listConditions(actor, { categoryId: empty.id })).toMatchObject({
      category: { id: empty.id },
      scheme: null,
      options: [],
      nextCursor: null,
    });
    const references = [
      [category, null],
      [category, option],
      [empty.id, null],
      [empty.id, option],
      [missing, null],
      [category, missing],
    ];
    const result = await service.resolveConditions(actor, { references });
    expect(result.references.slice(0, 3)).toMatchObject([
      { state: "AVAILABLE", option: null, scheme: { active: false } },
      { state: "AVAILABLE", option: { id: option, active: false }, scheme: { active: false } },
      { state: "AVAILABLE", scheme: null, option: null },
    ]);
    for (const row of result.references.slice(3))
      expect(row).toEqual({
        reference: row.reference,
        state: "UNAVAILABLE",
        category: null,
        scheme: null,
        option: null,
      });
    await expect(service.listConditions(actor, { categoryId: missing })).rejects.toMatchObject({
      code: "FILTER_REFERENCE_INVALID",
    });
  });
  it("pages all 100 retained conditions by ID and rejects impossible native position 100", async () => {
    const c = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
      key: `${prefix}_hundred`,
      labels: { de: "Hundert", en: "Hundred" },
    });
    const s = await createConditionMaintenanceService(db!).createConditionScheme({
      categoryTemplateId: c.id,
      key: `${prefix}_hundred`,
      labels: { de: "Zustand", en: "Condition" },
      options: Array.from({ length: 100 }, (_, n) => ({
        labelKey: `condition.v${n}`,
        labels: { de: `Wert ${n}`, en: `Value ${n}` },
        active: n % 2 === 0,
      })),
    });
    const service = createSearchReferenceService(db!),
      actor = { userId: owner };
    const first = await service.listConditions(actor, { categoryId: c.id, limit: 50 });
    const second = await service.listConditions(actor, {
      categoryId: c.id,
      limit: 50,
      cursor: first.nextCursor,
    });
    expect(first.options).toHaveLength(50);
    expect(second.options).toHaveLength(50);
    expect(second.nextCursor).toBeNull();
    expect([...first.options, ...second.options].map((o) => o.id)).toEqual(
      s.options.map((o) => o.id).sort(),
    );
    await expect(
      db!.conditionOption.create({
        data: {
          schemeId: s.id,
          categoryTemplateId: c.id,
          labelKey: "condition.overflow",
          labelDe: "Extra",
          labelEn: "Extra",
          position: 100,
        },
      }),
    ).rejects.toBeTruthy();
  });
  it("enforces authored 100/101 option cap and nonselect/select invariants", async () => {
    const producer = createCustomFieldService(db!, owner),
      service = createSearchReferenceService(db!),
      actor = { userId: owner };
    const selected = await producer.createFieldDefinition({
      collectionId: owned,
      name: "Hundred options",
      type: "MULTI_SELECT",
      options: Array.from({ length: 100 }, (_, n) => `Option ${n}`),
    });
    expect(
      (
        await service.resolveCustomFields(actor, {
          references: [[owned, selected.id]],
          detail: "OPTIONS",
        })
      ).references[0],
    ).toMatchObject({ definition: { options: selected.options } });
    const adjacent = await producer.createFieldDefinition({
      collectionId: owned,
      name: "Adjacent hundred",
      type: "SINGLE_SELECT",
      options: Array.from({ length: 100 }, (_, n) => `Adjacent ${n}`),
    });
    const both = await service.resolveCustomFields(actor, {
      references: [
        [owned, selected.id],
        [owned, adjacent.id],
      ],
      detail: "OPTIONS",
    });
    expect(both.references).toMatchObject([
      { definition: { options: selected.options } },
      { definition: { options: adjacent.options } },
    ]);
    await db!.customFieldOption.create({
      data: {
        fieldDefinitionId: selected.id,
        value: "Overflow",
        normalizedValue: "overflow",
        position: 100,
      },
    });
    await expect(
      service.resolveCustomFields(actor, { references: [[owned, selected.id]], detail: "OPTIONS" }),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    const numeric = await producer.createFieldDefinition({
      collectionId: owned,
      name: "Number",
      type: "INTEGER",
    });
    expect(
      (
        await service.resolveCustomFields(actor, {
          references: [[owned, numeric.id]],
          detail: "OPTIONS",
        })
      ).references[0],
    ).toMatchObject({ definition: { options: [] } });
    await db!.customFieldOption.create({
      data: {
        fieldDefinitionId: numeric.id,
        value: "Unexpected",
        normalizedValue: "unexpected",
        position: 0,
      },
    });
    await expect(
      service.resolveCustomFields(actor, { references: [[owned, numeric.id]], detail: "OPTIONS" }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
    const noOptions = await producer.createFieldDefinition({
      collectionId: owned,
      name: "Missing options",
      type: "SINGLE_SELECT",
      options: ["One"],
    });
    await db!.customFieldOption.deleteMany({ where: { fieldDefinitionId: noOptions.id } });
    await expect(
      service.resolveCustomFields(actor, {
        references: [[owned, noOptions.id]],
        detail: "OPTIONS",
      }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
  });
  it("does not transfer oversized native TEXT or rescue malformed labels", async () => {
    const service = createSearchReferenceService(db!),
      actor = { userId: owner };
    const corrupt = (
      await createCollectionService(db!, owner).createCollection({ name: "Temporary" })
    ).id;
    await db!.collection.update({ where: { id: corrupt }, data: { name: "x".repeat(2_000_000) } });
    const raw = await db!.$queryRaw<{ payload: { collection: { name: null } }[] }>(
      collectionsResolveSql(owner, [corrupt]),
    );
    expect(JSON.stringify(raw).length).toBeLessThan(500);
    await expect(service.resolveCollections(actor, { ids: [corrupt] })).rejects.toMatchObject({
      code: "SEARCH_INVARIANT",
    });
    await db!.collection.update({ where: { id: corrupt }, data: { name: " " } });
    await expect(service.resolveCollections(actor, { ids: [corrupt] })).rejects.toMatchObject({
      code: "SEARCH_INVARIANT",
    });
    const field = await createCustomFieldService(db!, owner).createFieldDefinition({
      collectionId: owned,
      name: "Unicode invalid",
      type: "SINGLE_SELECT",
      options: ["Valid"],
    });
    await db!.customFieldOption.updateMany({
      where: { fieldDefinitionId: field.id },
      data: { value: "😀".repeat(101) },
    });
    await expect(
      service.resolveCustomFields(actor, { references: [[owned, field.id]], detail: "OPTIONS" }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
  });
  it("uses one repeatable snapshot across metadata/options despite concurrent rename, delete and option change", async () => {
    const collection = await createCollectionService(db!, owner).createCollection({
      name: "Snapshot",
    });
    const field = await createCustomFieldService(db!, owner).createFieldDefinition({
      collectionId: collection.id,
      name: "Before",
      type: "SINGLE_SELECT",
      options: ["Before"],
    });
    let statements = 0;
    const wrapped: SearchDatabase = {
      $transaction: (work, settings) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(query: Prisma.Sql) => {
                const result = await tx.$queryRaw<T>(query);
                if (++statements === 3) {
                  await db!.customFieldDefinition.update({
                    where: { id: field.id },
                    data: { name: "After", normalizedName: "after" },
                  });
                  await db!.customFieldOption.updateMany({
                    where: { fieldDefinitionId: field.id },
                    data: { value: "After", normalizedValue: "after" },
                  });
                  await db!.collection.update({
                    where: { id: collection.id },
                    data: { deletedAt: new Date() },
                  });
                }
                return result;
              },
            }),
          settings,
        ),
    };
    const input = { references: [[collection.id, field.id]], detail: "OPTIONS" };
    expect(
      (await createSearchReferenceService(wrapped).resolveCustomFields({ userId: owner }, input))
        .references[0],
    ).toMatchObject({ state: "AVAILABLE", definition: { name: "Before", options: ["Before"] } });
    expect(
      (await createSearchReferenceService(db!).resolveCustomFields({ userId: owner }, input))
        .references[0],
    ).toMatchObject({ state: "UNAVAILABLE", definition: null });
  });
  it("bounds valid 100 by 100 catalog picker reads while preserving default template behavior", async () => {
    const labels = { de: "D".repeat(200), en: "E".repeat(200) };
    const c = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
      key: `${prefix}_large`,
      labels,
      definitions: Array.from({ length: 100 }, (_, n) => ({
        key: `field_${n}`,
        labels,
        type: "SINGLE_SELECT",
        options: Array.from({ length: 100 }, (_, j) => ({ key: `option_${j}`, labels })),
      })),
    });
    let calls = 0;
    const wrapped: SearchDatabase = {
      $transaction: (work, settings) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(query: Prisma.Sql) => {
                calls++;
                return tx.$queryRaw<T>(query);
              },
            }),
          settings,
        ),
    };
    const service = createSearchReferenceService(wrapped),
      actor = { userId: owner };
    const choices = await service.getCatalogDefinitionChoices(actor, c.id);
    expect(calls).toBe(3);
    expect(choices.definitions).toHaveLength(100);
    expect(choices.definitions.every((d) => !Object.hasOwn(d, "options"))).toBe(true);
    calls = 0;
    const selected = await service.getCatalogDefinition(actor, c.id, c.definitions[99]!.id);
    expect(calls).toBe(3);
    expect(selected.definition).toEqual(c.definitions[99]);
    expect(selected.definition.options).toHaveLength(100);
    const legacy = await createCatalogReadService(db!).getCategoryTemplate(c.id);
    expect(legacy.definitions).toHaveLength(100);
    expect(legacy.definitions.every((d) => d.options.length === 100)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(legacy))).toBeGreaterThan(1048576);
    expect(Buffer.byteLength(JSON.stringify(choices))).toBeLessThan(1048576);
    expect(Buffer.byteLength(JSON.stringify(selected))).toBeLessThan(1048576);
    console.info(
      "catalog bounded transfer",
      JSON.stringify({
        definitions: 100,
        optionsEach: 100,
        choicesBytes: Buffer.byteLength(JSON.stringify(choices)),
        selectedBytes: Buffer.byteLength(JSON.stringify(selected)),
        legacyBytes: Buffer.byteLength(JSON.stringify(legacy)),
      }),
    );
    await expect(
      service.getCatalogDefinition(actor, category, c.definitions[0]!.id),
    ).rejects.toMatchObject({ code: "FILTER_REFERENCE_INVALID" });
    await db!.catalogAttributeOption.create({
      data: {
        definitionId: c.definitions[99]!.id,
        key: "overflow",
        position: 100,
        labels: {
          create: [
            { locale: "de", label: "Mehr" },
            { locale: "en", label: "More" },
          ],
        },
      },
    });
    await expect(
      service.getCatalogDefinition(actor, c.id, c.definitions[99]!.id),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    await db!.catalogAttributeDefinition.create({
      data: {
        categoryTemplateId: c.id,
        key: "overflow",
        type: "INTEGER",
        position: 100,
        labels: {
          create: [
            { locale: "de", label: "Mehr" },
            { locale: "en", label: "More" },
          ],
        },
      },
    });
    await expect(service.getCatalogDefinitionChoices(actor, c.id)).rejects.toMatchObject({
      code: "SEARCH_UNAVAILABLE",
    });
  }, 30000);
  it("keeps the same one-statement page cost on a larger 1000-collection inventory", async () => {
    const producer = createCollectionService(db!, pagingOwner);
    for (let n = 51; n < 1000; n++) await producer.createCollection({ name: `Large fixture ${n}` });
    let calls = 0;
    const wrapped: SearchDatabase = {
      $transaction: (work, settings) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(query: Prisma.Sql) => {
                calls++;
                return tx.$queryRaw<T>(query);
              },
            }),
          settings,
        ),
    };
    const page = await createSearchReferenceService(wrapped).listCollections(
      { userId: pagingOwner },
      { limit: 50 },
    );
    expect(page.collections).toHaveLength(50);
    expect(calls).toBe(3);
  });
  it("captures actual EXPLAIN ANALYZE BUFFERS for bounded owner list/hydration/options", async () => {
    for (const [name, query] of [
      ["collection-list", collectionsPageSql(pagingOwner, 50, null)],
      [
        "collection-hydration-50",
        collectionsResolveSql(
          pagingOwner,
          Array.from({ length: 50 }, () => randomUUID()),
        ),
      ],
      ["custom-summary", customResolveSql(owner, [[owned, definition]])],
      ["custom-options", customOptionsSql(owner, [[owned, definition]])],
    ] as const) {
      const plan = await db!.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}`);
      console.info("reference native plan", name, JSON.stringify(plan));
    }
  });
});
