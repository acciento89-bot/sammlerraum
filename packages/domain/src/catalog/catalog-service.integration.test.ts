import { randomUUID } from "node:crypto";

import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCategoryTemplateMaintenanceService } from "./category-template-service";
import { createCatalogMaintenanceService, createCatalogMutationService } from "./catalog-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const prisma = enabled ? createTestDatabaseClient() : undefined;
const prefix = `fixture_${randomUUID().replaceAll("-", "")}`;
const labels = { de: "Katalog", en: "Catalog" };
const text = { language: "pl", title: "Moneta", description: "Autorski opis" };
const sources = [
  { note: "Museum record 17", url: "https://example.org/catalog/17", license: "CC BY 4.0" },
];
const service = () => createCatalogMaintenanceService(prisma!);
let categoryId: string;
let foreignCategoryId: string;
let yearId: string;
let decimalId: string;
let selectId: string;
let foreignDefinitionId: string;
let moneyId: string;
let booleanId: string;
let multiId: string;
const create = (extra: object = {}) =>
  service().createCatalogEntry({ categoryTemplateId: categoryId, text, sources, ...extra });

describe.runIf(enabled)("revisioned global catalog PostgreSQL", () => {
  beforeAll(async () => {
    const templates = createCategoryTemplateMaintenanceService(prisma!);
    const template = await templates.createCategoryTemplate({
      key: `${prefix}_main`,
      labels,
      definitions: [
        { key: "year", labels, type: "INTEGER" },
        { key: "weight", labels, type: "DECIMAL" },
        {
          key: "metal",
          labels,
          type: "SINGLE_SELECT",
          options: [
            { key: "silver", labels },
            { key: "gold", labels },
          ],
        },
        { key: "face_value", labels, type: "MONEY" },
        { key: "commemorative", labels, type: "BOOLEAN" },
        {
          key: "marks",
          labels,
          type: "MULTI_SELECT",
          options: [
            { key: "mint_a", labels },
            { key: "mint_b", labels },
          ],
        },
      ],
    });
    categoryId = template.id;
    [yearId, decimalId, selectId] = template.definitions.map((definition) => definition.id) as [
      string,
      string,
      string,
    ];
    [moneyId, booleanId, multiId] = template.definitions
      .slice(3)
      .map((definition) => definition.id) as [string, string, string];
    const foreign = await templates.createCategoryTemplate({
      key: `${prefix}_foreign`,
      labels,
      definitions: [{ key: "year", labels, type: "INTEGER" }],
    });
    foreignCategoryId = foreign.id;
    foreignDefinitionId = foreign.definitions[0]!.id;
  });
  afterAll(async () => {
    if (!prisma) return;
    const scope = { categoryTemplate: { key: { startsWith: prefix } } };
    await prisma.catalogRevision.deleteMany({ where: { entry: scope } });
    await prisma.catalogAttributeValue.deleteMany({ where: { entry: scope } });
    await prisma.catalogExternalIdentifier.deleteMany({ where: { entry: scope } });
    await prisma.catalogVariant.deleteMany({ where: { entry: scope } });
    await prisma.catalogEntry.deleteMany({ where: scope });
    const definitionScope = { categoryTemplate: { key: { startsWith: prefix } } };
    await prisma.catalogAttributeOptionLabel.deleteMany({
      where: { option: { definition: definitionScope } },
    });
    await prisma.catalogAttributeOption.deleteMany({ where: { definition: definitionScope } });
    await prisma.catalogAttributeLabel.deleteMany({ where: { definition: definitionScope } });
    await prisma.catalogAttributeDefinition.deleteMany({ where: definitionScope });
    await prisma.categoryTemplateLabel.deleteMany({
      where: { categoryTemplate: { key: { startsWith: prefix } } },
    });
    await prisma.categoryTemplate.deleteMany({ where: { key: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  it("canonicalizes uppercase category UUIDs through rollback and no-op commands", async () => {
    const entry = await create({ categoryTemplateId: categoryId.toUpperCase() });
    await service().updateCatalogEntry(entry.state.id.toUpperCase(), 1, {
      text: { ...text, title: "Changed" },
    });
    const restored = await service().rollbackCatalogEntry(entry.state.id.toUpperCase(), 2, 1);
    expect(restored).toMatchObject({
      revision: 3,
      rollbackFromRevision: 1,
      state: { id: entry.state.id, categoryTemplateId: categoryId, text: { title: "Moneta" } },
    });
    expect((await service().updateCatalogEntry(entry.state.id.toUpperCase(), 3, {})).revision).toBe(
      3,
    );
    expect(
      (await service().getCatalogEntryAtRevision(entry.state.id.toUpperCase(), 1))!.state
        .categoryTemplateId,
    ).toBe(categoryId);
  });

  it("canonicalizes uppercase definition and variant references without weakening category or entry guards", async () => {
    const entry = await create({
      categoryTemplateId: categoryId.toUpperCase(),
      attributes: [{ definitionId: yearId.toUpperCase(), value: 1999 }],
    });
    expect(entry.state.attributes[0]!.definitionId).toBe(yearId);
    const variantInput = {
      text,
      attributes: [{ definitionId: yearId.toUpperCase(), value: 2000 }],
    };
    const variant = await service().addCatalogVariant(
      entry.state.id.toUpperCase(),
      1,
      variantInput,
    );
    expect(variant.attributes[0]!.definitionId).toBe(yearId);
    const changed = await service().updateCatalogVariant(
      entry.state.id.toUpperCase(),
      2,
      variant.id.toUpperCase(),
      { ...variantInput, text: { ...text, title: "Updated variant" } },
    );
    expect(changed.state.variants[0]!.id).toBe(variant.id);
    const identifierInput = { namespace: "museum", type: "accession", value: "17", sources };
    const identifier = await service().addExternalIdentifier(entry.state.id.toUpperCase(), 3, {
      ...identifierInput,
      variantId: variant.id.toUpperCase(),
    });
    expect(identifier.variantId).toBe(variant.id);
    const sameIdentifier = await service().addExternalIdentifier(entry.state.id, 4, {
      ...identifierInput,
      variantId: variant.id,
    });
    expect(sameIdentifier).toMatchObject({ id: identifier.id, revision: 4 });
    expect(
      (
        await service().updateCatalogVariant(
          entry.state.id.toUpperCase(),
          4,
          variant.id.toUpperCase(),
          { ...variantInput, text: { ...text, title: "Updated variant" } },
        )
      ).revision,
    ).toBe(4);
    const foreign = await create({ categoryTemplateId: foreignCategoryId.toUpperCase() });
    const foreignVariant = await service().addCatalogVariant(foreign.state.id, 1, { text });
    await expect(
      service().addExternalIdentifier(entry.state.id.toUpperCase(), 4, {
        ...identifierInput,
        variantId: foreignVariant.id.toUpperCase(),
      }),
    ).rejects.toMatchObject({ code: "CATALOG_VARIANT_NOT_FOUND" });
    await expect(
      service().updateCatalogEntry(entry.state.id.toUpperCase(), 4, {
        attributes: [{ definitionId: foreignDefinitionId.toUpperCase(), value: 1 }],
      }),
    ).rejects.toMatchObject({ code: "CATALOG_ATTRIBUTE_CATEGORY_MISMATCH" });
    await expect(
      service().updateCatalogEntry(entry.state.id.toUpperCase(), 4, {
        attributes: [
          { definitionId: yearId, value: 1 },
          { definitionId: yearId.toUpperCase(), value: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: "CATALOG_INPUT_INVALID" });
    expect(await service().getCatalogEntryAtRevision(entry.state.id, 5)).toBeNull();
    const restored = await service().rollbackCatalogEntry(entry.state.id.toUpperCase(), 4, 1);
    expect(restored.revision).toBe(5);
    expect(restored.state).toEqual(entry.state);
    expect(
      (await service().getCatalogEntryAtRevision(entry.state.id.toUpperCase(), 4))!.state
        .identifiers[0],
    ).toMatchObject({ id: identifier.id, variantId: variant.id });
  });

  it("normalizes legacy snapshot UUIDs on read and rollback without rewriting stored history", async () => {
    const entryId = randomUUID();
    const variantId = randomUUID();
    const identifierId = randomUUID();
    const authoredText = { ...text, translations: [] };
    const legacySnapshot = {
      schemaVersion: 1,
      id: entryId.toUpperCase(),
      categoryTemplateId: categoryId.toUpperCase(),
      text: authoredText,
      sources,
      attributes: [
        { definitionId: yearId.toUpperCase(), key: "year", type: "INTEGER", value: 1970 },
      ],
      variants: [
        {
          id: variantId.toUpperCase(),
          text: authoredText,
          sources: [],
          attributes: [
            { definitionId: yearId.toUpperCase(), key: "year", type: "INTEGER", value: 1971 },
          ],
        },
      ],
      identifiers: [
        {
          id: identifierId.toUpperCase(),
          variantId: variantId.toUpperCase(),
          namespace: "museum",
          type: "accession",
          value: "17",
          sources,
        },
      ],
    };
    await prisma!.$transaction(async (tx) => {
      await tx.catalogEntry.create({
        data: {
          id: entryId,
          categoryTemplateId: categoryId,
          authored: { text: authoredText, sources },
        },
      });
      await tx.catalogVariant.create({
        data: { id: variantId, entryId, authored: { text: authoredText, sources: [] } },
      });
      await tx.catalogExternalIdentifier.create({
        data: {
          id: identifierId,
          entryId,
          variantId,
          namespace: "museum",
          type: "accession",
          value: "17",
          sources,
        },
      });
      await tx.catalogAttributeValue.createMany({
        data: [
          {
            entryId,
            categoryTemplateId: categoryId,
            definitionId: yearId,
            targetKey: "entry",
            value: 1970,
          },
          {
            entryId,
            categoryTemplateId: categoryId,
            definitionId: yearId,
            variantId,
            targetKey: variantId,
            value: 1971,
          },
        ],
      });
      await tx.catalogRevision.create({ data: { entryId, revision: 1, snapshot: legacySnapshot } });
    });
    const historical = await service().getCatalogEntryAtRevision(entryId.toUpperCase(), 1);
    expect(historical!.state).toMatchObject({
      id: entryId,
      categoryTemplateId: categoryId,
      attributes: [{ definitionId: yearId }],
      variants: [{ id: variantId, attributes: [{ definitionId: yearId }] }],
      identifiers: [{ id: identifierId, variantId }],
    });
    await service().updateCatalogEntry(entryId.toUpperCase(), 1, {
      text: { ...text, title: "Changed" },
    });
    const restored = await service().rollbackCatalogEntry(entryId.toUpperCase(), 2, 1);
    expect(restored).toMatchObject({
      revision: 3,
      rollbackFromRevision: 1,
      state: historical!.state,
    });
    expect((await service().updateCatalogEntry(entryId.toUpperCase(), 3, {})).revision).toBe(3);
    expect(
      (
        await prisma!.catalogRevision.findUniqueOrThrow({
          where: { entryId_revision: { entryId, revision: 1 } },
        })
      ).snapshot,
    ).toEqual(legacySnapshot);
  });

  it("guards persisted revision snapshots against database UPDATE", async () => {
    const entry = await create();
    await expect(
      prisma!.catalogRevision.update({
        where: { entryId_revision: { entryId: entry.state.id, revision: 1 } },
        data: { snapshot: { changed: true } },
      }),
    ).rejects.toThrow(/immutable|P2004/i);
    expect((await service().getCatalogEntryAtRevision(entry.state.id, 1))!.state.text.title).toBe(
      "Moneta",
    );
  });

  it("keeps same-title language and edition variants separate and preserves authored text", async () => {
    const entry = await create({
      text: { ...text, translations: [{ language: "de", title: "Münze" }] },
    });
    const de = await service().addCatalogVariant(entry.state.id, 1, {
      text,
      language: "de",
      edition: "1st",
      reference: "DE-17",
      sources,
    });
    const en = await service().addCatalogVariant(entry.state.id, 2, {
      text,
      language: "en",
      edition: "1st",
      reference: "EN-17",
    });
    const second = await service().addCatalogVariant(entry.state.id, 3, {
      text,
      language: "de",
      edition: "2nd",
    });
    const same = await service().addCatalogVariant(entry.state.id, 4, {
      text,
      language: "de",
      edition: "1st",
    });
    expect(new Set([de.id, en.id, second.id, same.id]).size).toBe(4);
    const revision = await service().getCatalogEntryAtRevision(entry.state.id, 5);
    expect(revision!.state.text).toMatchObject({
      language: "pl",
      title: "Moneta",
      translations: [{ language: "de", title: "Münze" }],
    });
    expect(revision!.state.variants).toHaveLength(4);
    expect(revision!.state.variants.find((variant) => variant.id === de.id)).toMatchObject({
      language: "de",
      edition: "1st",
      reference: "DE-17",
      sources,
    });
    expect((await service().getCatalogEntryAtRevision(entry.state.id, 1))!.state.variants).toEqual(
      [],
    );
  });

  it("stores typed entry and variant attributes canonically and rejects foreign definitions atomically", async () => {
    const beforeCount = await prisma!.catalogEntry.count({
      where: { categoryTemplateId: categoryId },
    });
    const entry = await create({
      attributes: [
        { definitionId: yearId, value: 1999 },
        { definitionId: moneyId, value: { amountMinor: 9007199254740991, currency: "EUR" } },
        { definitionId: booleanId, value: false },
        { definitionId: multiId, value: ["mint_b", "mint_a"] },
        { definitionId: decimalId, value: "12345678901234567890.123456789012345678" },
        { definitionId: selectId, value: " SILVER " },
      ],
    });
    expect(entry.state.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "weight",
          type: "DECIMAL",
          value: "12345678901234567890.123456789012345678",
        }),
        expect.objectContaining({ key: "metal", type: "SINGLE_SELECT", value: "silver" }),
        expect.objectContaining({
          key: "face_value",
          type: "MONEY",
          value: { amountMinor: 9007199254740991, currency: "EUR" },
        }),
        expect.objectContaining({ key: "commemorative", type: "BOOLEAN", value: false }),
        expect.objectContaining({
          key: "marks",
          type: "MULTI_SELECT",
          value: ["mint_b", "mint_a"],
        }),
      ]),
    );
    const variant = await service().addCatalogVariant(entry.state.id, 1, {
      text,
      attributes: [{ definitionId: yearId, value: 2001 }],
    });
    expect(variant.attributes).toEqual([
      { definitionId: yearId, key: "year", type: "INTEGER", value: 2001 },
    ]);
    for (const value of [
      { definitionId: foreignDefinitionId, value: 2002 },
      { definitionId: yearId, value: "2002" },
      { definitionId: selectId, value: "not_an_option" },
    ]) {
      await expect(
        service().addCatalogVariant(entry.state.id, 2, { text, attributes: [value] }),
      ).rejects.toThrow();
    }
    await expect(
      create({
        attributes: [
          { definitionId: yearId, value: 2000 },
          { definitionId: foreignDefinitionId, value: 2001 },
        ],
      }),
    ).rejects.toMatchObject({ code: "CATALOG_ATTRIBUTE_CATEGORY_MISMATCH" });
    expect(await prisma!.catalogEntry.count({ where: { categoryTemplateId: categoryId } })).toBe(
      beforeCount + 1,
    );
    expect(await prisma!.catalogVariant.count({ where: { entryId: entry.state.id } })).toBe(1);
    expect(await prisma!.catalogRevision.count({ where: { entryId: entry.state.id } })).toBe(2);
    await expect(
      prisma!.catalogAttributeValue.create({
        data: {
          entryId: entry.state.id,
          categoryTemplateId: categoryId,
          definitionId: foreignDefinitionId,
          targetKey: "entry",
          value: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma!.catalogAttributeValue.create({
        data: {
          entryId: entry.state.id,
          categoryTemplateId: foreignCategoryId,
          definitionId: foreignDefinitionId,
          targetKey: "entry",
          value: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("retains original identifier values, namespaces, target and provenance in past snapshots", async () => {
    const entry = await create();
    const variant = await service().addCatalogVariant(entry.state.id, 1, { text });
    const one = await service().addExternalIdentifier(entry.state.id, 2, {
      namespace: "museum",
      type: "accession",
      value: " 0017-A ",
      sources,
    });
    const two = await service().addExternalIdentifier(entry.state.id, 3, {
      namespace: "publisher",
      type: "accession",
      value: " 0017-A ",
      sources,
    });
    const targeted = await service().addExternalIdentifier(entry.state.id, 4, {
      variantId: variant.id,
      namespace: "museum",
      type: "accession",
      value: " 0017-A ",
      sources,
    });
    expect(new Set([one.id, two.id, targeted.id]).size).toBe(3);
    const unchanged = await service().addExternalIdentifier(entry.state.id, 5, {
      variantId: variant.id,
      namespace: "museum",
      type: "accession",
      value: " 0017-A ",
      sources,
    });
    expect(unchanged.revision).toBe(5);
    const past = await service().getCatalogEntryAtRevision(entry.state.id, 3);
    expect(past!.state.identifiers).toEqual([
      { id: one.id, namespace: "museum", type: "accession", value: " 0017-A ", sources },
    ]);
    await service().addExternalIdentifier(entry.state.id, 5, {
      namespace: "museum",
      type: "accession",
      value: " 0017-A ",
      sources: [{ license: "CC0" }],
    });
    expect(
      (await service().getCatalogEntryAtRevision(entry.state.id, 3))!.state.identifiers[0]!.sources,
    ).toEqual(sources);
    await expect(
      service().addExternalIdentifier(entry.state.id, 6, {
        variantId: randomUUID(),
        namespace: "museum",
        type: "accession",
        value: "17",
      }),
    ).rejects.toMatchObject({ code: "CATALOG_VARIANT_NOT_FOUND" });
  });

  it("serializes concurrent writes with expected-revision conflicts and checks stale no-ops", async () => {
    const entry = await create();
    const attempts = await Promise.allSettled([
      service().addCatalogVariant(entry.state.id, 1, { text, language: "de" }),
      service().addCatalogVariant(entry.state.id, 1, { text, language: "en" }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: { code: "CATALOG_REVISION_CONFLICT" },
    });
    expect(
      await prisma!.catalogVariant.count({ where: { entryId: entry.state.id, active: true } }),
    ).toBe(1);
    expect(
      (
        await prisma!.catalogRevision.findMany({
          where: { entryId: entry.state.id },
          orderBy: { revision: "asc" },
        })
      ).map((row) => row.revision),
    ).toEqual([1, 2]);
    await expect(service().updateCatalogEntry(entry.state.id, 1, {})).rejects.toMatchObject({
      code: "CATALOG_REVISION_CONFLICT",
    });
    expect((await service().updateCatalogEntry(entry.state.id, 2, {})).revision).toBe(2);
  });

  it("shares the caller transaction so failed approval work rolls back state and snapshots", async () => {
    const entry = await create();
    await expect(
      prisma!.$transaction(async (tx) => {
        await tx.categoryTemplateLabel.update({
          where: { categoryTemplateId_locale: { categoryTemplateId: categoryId, locale: "de" } },
          data: { label: "Approval marker" },
        });
        await createCatalogMutationService(tx).updateCatalogEntry(entry.state.id, 1, {
          text: { ...text, title: "Changed" },
        });
        throw new Error("approval finalization failed");
      }),
    ).rejects.toThrow("approval finalization failed");
    expect(
      (await prisma!.catalogEntry.findUniqueOrThrow({ where: { id: entry.state.id } })).revision,
    ).toBe(1);
    expect(await service().getCatalogEntryAtRevision(entry.state.id, 2)).toBeNull();
    expect(
      (
        await prisma!.categoryTemplateLabel.findUniqueOrThrow({
          where: { categoryTemplateId_locale: { categoryTemplateId: categoryId, locale: "de" } },
        })
      ).label,
    ).toBe("Katalog");
    await prisma!.$transaction(async (tx) => {
      const mutations = createCatalogMutationService(tx);
      await mutations.updateCatalogEntry(entry.state.id, 1, {
        text: { ...text, title: "Approved" },
      });
      await mutations.addCatalogVariant(entry.state.id, 2, { text });
    });
    expect((await service().getCatalogEntryAtRevision(entry.state.id, 3))!.state.text.title).toBe(
      "Approved",
    );
  });

  it("records rollback as a new revision while retaining inactive UUID identities and old snapshots", async () => {
    const entry = await create({ attributes: [{ definitionId: yearId, value: 1980 }] });
    const variant = await service().addCatalogVariant(entry.state.id, 1, {
      text,
      edition: "1st",
      sources,
      attributes: [{ definitionId: yearId, value: 1981 }],
    });
    const identifier = await service().addExternalIdentifier(entry.state.id, 2, {
      variantId: variant.id,
      namespace: "museum",
      type: "accession",
      value: "17",
      sources,
    });
    await service().updateCatalogVariant(entry.state.id, 3, variant.id, {
      text: { ...text, title: "Wrong" },
      edition: "bad",
      attributes: [{ definitionId: yearId, value: 2000 }],
    });
    await service().updateCatalogEntry(entry.state.id, 4, {
      text: { ...text, title: "Wrong entry" },
      sources: [{ license: "wrong" }],
      attributes: [],
    });
    const rolled = await service().rollbackCatalogEntry(entry.state.id, 5, 1);
    expect(rolled).toEqual({ revision: 6, state: entry.state, rollbackFromRevision: 1 });
    expect((await service().updateCatalogEntry(entry.state.id, 6, {})).rollbackFromRevision).toBe(
      1,
    );
    expect(
      (await prisma!.catalogVariant.findUniqueOrThrow({ where: { id: variant.id } })).active,
    ).toBe(false);
    expect(
      (await prisma!.catalogExternalIdentifier.findUniqueOrThrow({ where: { id: identifier.id } }))
        .active,
    ).toBe(false);
    await expect(
      service().addExternalIdentifier(entry.state.id, 6, {
        variantId: variant.id,
        namespace: "museum",
        type: "accession",
        value: "18",
      }),
    ).rejects.toMatchObject({ code: "CATALOG_VARIANT_NOT_FOUND" });
    const restored = await service().rollbackCatalogEntry(entry.state.id, 6, 3);
    expect(restored.revision).toBe(7);
    expect(restored.state.variants[0]).toMatchObject({
      id: variant.id,
      edition: "1st",
      attributes: [{ value: 1981 }],
    });
    expect(restored.state.identifiers[0]).toMatchObject({ id: identifier.id, sources });
    expect(
      (await service().getCatalogEntryAtRevision(entry.state.id, 4))!.state.variants[0]!.text.title,
    ).toBe("Wrong");
    expect((await service().getCatalogEntryAtRevision(entry.state.id, 5))!.state.text.title).toBe(
      "Wrong entry",
    );
    expect((await service().getCatalogEntryAtRevision(entry.state.id, 1))!.state).toEqual(
      entry.state,
    );
  });

  it("strictly bounds maintenance inputs and does not write personal data or unsafe provenance", async () => {
    const before = await prisma!.catalogEntry.count({ where: { categoryTemplateId: categoryId } });
    for (const extra of [
      { ownerId: "personal" },
      { price: 100 },
      { location: "Cabinet" },
      { privateNotes: "Secret" },
      { condition: "mint" },
      { text: { ...text, translations: [{ language: "pl", title: "Duplicate" }] } },
      { sources: [{ url: "not a URL" }] },
      { sources: [{ url: "javascript:alert(1)" }] },
      { sources: [{ url: "https://user:pass@example.org" }] },
      { sources: Array.from({ length: 21 }, () => ({ note: "source" })) },
      { attributes: Array.from({ length: 101 }, () => ({ definitionId: yearId, value: 1 })) },
    ])
      await expect(create(extra)).rejects.toMatchObject({ code: "CATALOG_INPUT_INVALID" });
    expect(await prisma!.catalogEntry.count({ where: { categoryTemplateId: categoryId } })).toBe(
      before,
    );
    const entry = await create();
    await expect(
      service().addCatalogVariant(entry.state.id, 1, { text, purchaseAmountMinor: 100 }),
    ).rejects.toMatchObject({ code: "CATALOG_INPUT_INVALID" });
    await expect(
      service().addExternalIdentifier(entry.state.id, 1, {
        namespace: "museum",
        type: "accession",
        value: "17",
        sources: [{ license: "CC0", privateNotes: "Secret" }],
      }),
    ).rejects.toMatchObject({ code: "CATALOG_INPUT_INVALID" });
    expect(await prisma!.catalogRevision.count({ where: { entryId: entry.state.id } })).toBe(1);
  });
});
