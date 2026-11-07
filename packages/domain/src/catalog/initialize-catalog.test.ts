import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import {
  initializeCatalogDefinitions,
  STARTER_CATALOG,
  type InitializerDatabase,
} from "./initialize-catalog";
import { createConditionMaintenanceService } from "../condition/condition-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const prefix = `init_${randomUUID().replaceAll("-", "")}_`;
const definitions = () =>
  STARTER_CATALOG.map((row) => ({
    ...row,
    template: { ...row.template, key: `${prefix}${row.template.key}` },
    scheme: { ...row.scheme, key: `${prefix}${row.scheme.key}` },
  }));
describe.runIf(enabled)("explicit authored catalog initializer", () => {
  afterAll(async () => {
    if (!db) return;
    const rows = await db.categoryTemplate.findMany({
      where: { key: { startsWith: prefix } },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    await db.conditionOption.deleteMany({ where: { categoryTemplateId: { in: ids } } });
    await db.conditionScheme.deleteMany({ where: { categoryTemplateId: { in: ids } } });
    await db.categoryTemplate.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it("dry-runs without writes, then applies atomically and reruns without changing identities or retirements", async () => {
    const seeds = definitions();
    const before = await db!.catalogEntry.count();
    const grants = await db!.applicationRoleGrant.count();
    const dry = await initializeCatalogDefinitions(db!, { definitions: seeds });
    expect(dry.applied).toBe(false);
    expect(await db!.categoryTemplate.count({ where: { key: { startsWith: prefix } } })).toBe(0);
    await initializeCatalogDefinitions(db!, { definitions: seeds, apply: true });
    const categories = await db!.categoryTemplate.findMany({
      where: { key: { startsWith: prefix } },
      orderBy: { key: "asc" },
      include: { conditionScheme: { include: { options: { orderBy: { position: "asc" } } } } },
    });
    expect(categories).toHaveLength(2);
    expect(categories.flatMap((row) => row.conditionScheme!.options)).toHaveLength(13);
    expect(
      categories
        .flatMap((row) => row.conditionScheme!.options)
        .every((row) => row.normalizedBand === null),
    ).toBe(true);
    const scheme = categories[0]!.conditionScheme!;
    await createConditionMaintenanceService(db!).setConditionOptionActive(
      scheme.options[0]!.id,
      false,
    );
    await createConditionMaintenanceService(db!).addConditionOption(scheme.id, {
      labelKey: "later_correction",
      labels: { de: "Spätere Ergänzung", en: "Later addition" },
    });
    await createConditionMaintenanceService(db!).setConditionSchemeActive(scheme.id, false);
    const extra = await db!.catalogAttributeDefinition.create({
      data: {
        categoryTemplateId: categories[0]!.id,
        key: "later_field",
        type: "SHORT_TEXT",
        position: seeds[0]!.template.definitions!.length,
        labels: {
          create: [
            { locale: "de", label: "Späteres Feld" },
            { locale: "en", label: "Later field" },
          ],
        },
      },
    });
    await initializeCatalogDefinitions(db!, { definitions: seeds, apply: true });
    expect(
      await db!.catalogAttributeDefinition.findUnique({ where: { id: extra.id } }),
    ).not.toBeNull();
    expect((await db!.conditionScheme.findUniqueOrThrow({ where: { id: scheme.id } })).active).toBe(
      false,
    );
    expect(
      (
        await db!.categoryTemplate.findMany({
          where: { key: { startsWith: prefix } },
          orderBy: { key: "asc" },
        })
      ).map((row) => row.id),
    ).toEqual(categories.map((row) => row.id));
    expect(
      (await db!.conditionOption.findUniqueOrThrow({ where: { id: scheme.options[0]!.id } }))
        .active,
    ).toBe(false);
    expect(await db!.conditionOption.count({ where: { schemeId: scheme.id } })).toBe(
      scheme.options.length + 1,
    );
    expect(await db!.catalogEntry.count()).toBe(before);
    expect(await db!.applicationRoleGrant.count()).toBe(grants);
  });
  it("rolls back all reused maintenance writes when the enclosing apply fails", async () => {
    const seeds = definitions().map((row) => ({
      ...row,
      template: { ...row.template, key: row.template.key.replace(prefix, `${prefix}abort_`) },
      scheme: { ...row.scheme, key: row.scheme.key.replace(prefix, `${prefix}abort_`) },
    }));
    const aborting: InitializerDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(async (tx) => {
          await work(tx);
          throw new Error("aborted after writes");
        }, options),
    };
    await expect(
      initializeCatalogDefinitions(aborting, { definitions: seeds, apply: true }),
    ).rejects.toThrow("aborted after writes");
    expect(
      await db!.categoryTemplate.count({
        where: { key: { in: seeds.map((row) => row.template.key) } },
      }),
    ).toBe(0);
  });
  it("fails a category-label conflict before creating another missing category", async () => {
    const seeds = definitions();
    const conflicting = [
      {
        ...seeds[0]!,
        template: { ...seeds[0]!.template, key: `${prefix}new_category` },
        scheme: { ...seeds[0]!.scheme, key: `${prefix}new_scheme` },
      },
      {
        ...seeds[1]!,
        template: { ...seeds[1]!.template, labels: { de: "Wrong label", en: "Wrong label" } },
      },
    ];
    await expect(
      initializeCatalogDefinitions(db!, { definitions: conflicting, apply: true }),
    ).rejects.toThrow("CATALOG_INITIALIZER_CONFLICT");
    expect(await db!.categoryTemplate.count({ where: { key: `${prefix}new_category` } })).toBe(0);
  });
  it("rejects seed-key type, position, option-label and scheme-scope conflicts", async () => {
    const seeds = definitions();
    const cards = seeds[0]!;
    const vinyl = seeds[1]!;
    const variants = [
      {
        ...cards,
        template: {
          ...cards.template,
          definitions: cards.template.definitions!.map((field, index) =>
            index === 0 ? { ...field, type: "LONG_TEXT" as const } : field,
          ),
        },
      },
      {
        ...vinyl,
        template: {
          ...vinyl.template,
          definitions: [
            vinyl.template.definitions![1]!,
            vinyl.template.definitions![0]!,
            vinyl.template.definitions![2]!,
          ],
        },
      },
      {
        ...cards,
        scheme: {
          ...cards.scheme,
          options: cards.scheme.options.map((option, index) =>
            index === 0 ? { ...option, labels: { de: "Changed", en: "Changed" } } : option,
          ),
        },
      },
      { ...cards, scheme: { ...cards.scheme, key: vinyl.scheme.key } },
    ];
    for (const variant of variants)
      await expect(
        initializeCatalogDefinitions(db!, { definitions: [variant], apply: true }),
      ).rejects.toThrow("CATALOG_INITIALIZER_CONFLICT");
  });
});
