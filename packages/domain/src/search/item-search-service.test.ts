import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createItemSearchService, type SearchDatabase } from "./item-search-service";
import type { ItemFilterNode } from "@sammlerraum/contracts/search";
import type { CustomFieldType } from "@sammlerraum/contracts/custom-fields";
import { parseItemSearchQuery } from "@sammlerraum/contracts/item-search";
import { encodeSearchCursor, searchContextHash } from "./search-cursor";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `search_${randomUUID()}`,
  foreign = `search_${randomUUID()}`;
let collection: string,
  otherCollection: string,
  category: string,
  condition: string,
  item: string,
  empty: string,
  hidden: string,
  entry: string,
  variant: string;
const custom = new Map<CustomFieldType, string>(),
  catalog = new Map<CustomFieldType, string>();
const instant = "2026-01-02T03:04:05.000Z";
const values: Record<CustomFieldType, Prisma.InputJsonValue> = {
  SHORT_TEXT: "Literal % _ \\ ' Café",
  LONG_TEXT: "Long authored",
  INTEGER: -9007199254740991,
  DECIMAL: "2.000000000000000001",
  DATE: "2024-02-29",
  BOOLEAN: false,
  URL: "https://example.invalid/path?q=1",
  SINGLE_SELECT: "selected",
  MULTI_SELECT: [],
  MONEY: { amountMinor: 0, currency: "EUR" },
};
const typedTests: Record<CustomFieldType, unknown> = {
  SHORT_TEXT: { op: "contains", value: "% _ \\ '" },
  LONG_TEXT: { op: "startsWith", value: "Long" },
  INTEGER: { op: "eq", value: -9007199254740991 },
  DECIMAL: { op: "between", min: "2.000000000000000001", max: "2.000000000000000002" },
  DATE: { op: "eq", value: "2024-02-29" },
  BOOLEAN: { op: "eq", value: false },
  URL: { op: "eq", value: "https://example.invalid/path?q=1" },
  SINGLE_SELECT: { op: "eq", value: "selected" },
  MULTI_SELECT: { op: "present" },
  MONEY: { op: "present" },
};
const query = (database: SearchDatabase = db!) => createItemSearchService(database);
async function search(root?: unknown, extra: object = {}) {
  return query().searchItems(
    { userId: owner },
    {
      filter: root
        ? {
            version: 1,
            root: {
              kind: "and",
              children: [{ kind: "collection", test: { op: "eq", value: collection } }, root],
            },
          }
        : null,
      ...extra,
    },
  );
}
function typed(
  kind: "customField" | "catalogAttribute",
  type: CustomFieldType,
  test: unknown,
  target = "ENTRY",
) {
  return {
    kind,
    selector:
      kind === "customField"
        ? { source: "CUSTOM", collectionId: collection, definitionId: custom.get(type) }
        : {
            source: "CATALOG",
            categoryTemplateId: category,
            definitionId: catalog.get(type),
            target,
          },
    predicate: { valueType: type, test },
  };
}
async function ids(root: unknown) {
  return (await search(root)).items.map((x) => x.id);
}
async function makeItem(data: Partial<Prisma.CollectibleItemUncheckedCreateInput> = {}) {
  return db!.collectibleItem.create({
    data: {
      ownerId: owner,
      collectionId: collection,
      title: "Fixture",
      createdAt: new Date(instant),
      ...data,
    },
  });
}
describe.runIf(enabled)("owned item search PostgreSQL", () => {
  beforeAll(async () => {
    const [guard] = await db!.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() AS name,current_setting('server_version') AS version`;
    expect(guard!.name.endsWith("_test")).toBe(true);
    expect(guard!.version.startsWith("17.")).toBe(true);
    await db!.user.createMany({
      data: [owner, foreign].map((id) => ({ id, name: "Search", email: `${id}@example.invalid` })),
    });
    collection = (await db!.collection.create({ data: { ownerId: owner, name: "Search" } })).id;
    otherCollection = (await db!.collection.create({ data: { ownerId: foreign, name: "Search" } }))
      .id;
    category = (
      await db!.categoryTemplate.create({
        data: {
          key: `search_${randomUUID().replaceAll("-", "")}`,
          labels: {
            create: [
              { locale: "de", label: "Uhrenkategorie" },
              { locale: "en", label: "Clock category" },
            ],
          },
        },
      })
    ).id;
    const scheme = await db!.conditionScheme.create({
      data: {
        categoryTemplateId: category,
        key: `s_${randomUUID().replaceAll("-", "")}`,
        labelDe: "Zustand",
        labelEn: "Condition",
      },
    });
    condition = (
      await db!.conditionOption.create({
        data: {
          schemeId: scheme.id,
          categoryTemplateId: category,
          labelKey: "retained",
          labelDe: "Alt",
          labelEn: "Old",
          position: 0,
          active: false,
        },
      })
    ).id;
    entry = (
      await db!.catalogEntry.create({
        data: {
          categoryTemplateId: category,
          authored: {
            text: {
              language: "en",
              title: "Linked title",
              translations: [{ language: "de", title: "Katalogübersetzung" }],
            },
          },
        },
      })
    ).id;
    variant = (
      await db!.catalogVariant.create({
        data: {
          entryId: entry,
          active: false,
          authored: { text: { title: "Retired selected variant" } },
        },
      })
    ).id;
    await db!.catalogVariant.create({
      data: { entryId: entry, authored: { text: { title: "Secret other variant" } } },
    });
    item = (
      await makeItem({
        title: "Watch ÄÖÜẞ Cafe\u0301 100%_\\'",
        categoryTemplateId: category,
        conditionOptionId: condition,
        catalogEntryId: entry,
        catalogVariantId: variant,
        publicDescription: "Public phrase",
        privateNotes: "Private secret phrase",
        purchaseAmountMinor: 0n,
        purchaseCurrency: "EUR",
        acquisitionDate: new Date("2024-02-29"),
        visibility: "PUBLIC",
        tradeStatus: "FOR_SALE",
      })
    ).id;
    empty = (await makeItem({ title: "Empty" })).id;
    hidden = (
      await makeItem({ ownerId: foreign, collectionId: otherCollection, title: "Watch hidden" })
    ).id;
    await makeItem({
      ownerId: foreign,
      collectionId: otherCollection,
      title: "Watch public foreign",
      visibility: "PUBLIC",
    });
    const tag = await db!.tag.create({
      data: { ownerId: owner, name: "İ TAG", normalizedName: "i\u0307 tag" },
    });
    await db!.itemTag.create({ data: { itemId: item, tagId: tag.id } });
    await db!.itemIdentifier.create({
      data: { itemId: item, type: "OTHER", value: "ID-literal", normalizedValue: "ID-LITERAL" },
    });
    await db!.grading.createMany({
      data: [
        {
          itemId: item,
          ownerId: owner,
          provider: "PSA",
          providerKey: "psa",
          grade: "Mint",
          certificateNo: "certificate-one",
          certificateKey: "certificate-one",
          comparableScale: "ten",
          comparableValue: "9.5000",
        },
        {
          itemId: item,
          ownerId: owner,
          provider: "Other",
          providerKey: "other",
          grade: "Wrong",
          certificateNo: "certificate-two",
          certificateKey: "certificate-two",
        },
      ],
    });
    await db!.valuation.createMany({
      data: [
        {
          itemId: item,
          ownerId: owner,
          actorUserId: owner,
          amountMinor: 12n,
          currency: "EUR",
          minorUnitExponent: 2,
          observedAt: new Date("2025-01-01"),
        },
        {
          itemId: item,
          ownerId: owner,
          actorUserId: owner,
          amountMinor: 9007199254740993n,
          currency: "JPY",
          minorUnitExponent: 0,
          observedAt: new Date("2026-01-01"),
        },
      ],
    });
    for (const [index, type] of Object.keys(values).entries()) {
      const t = type as CustomFieldType;
      const def = await db!.customFieldDefinition.create({
        data: { collectionId: collection, name: t, normalizedName: t.toLowerCase(), type: t },
      });
      custom.set(t, def.id);
      let columns: Partial<Prisma.CustomFieldValueUncheckedCreateInput> = {};
      switch (t) {
        case "SHORT_TEXT":
          columns = { shortTextValue: values[t] as string };
          break;
        case "LONG_TEXT":
          columns = { longTextValue: values[t] as string };
          break;
        case "INTEGER":
          columns = { integerValue: BigInt(values[t] as number) };
          break;
        case "DECIMAL":
          columns = { decimalValue: values[t] as string };
          break;
        case "DATE":
          columns = { dateValue: new Date(values[t] as string) };
          break;
        case "BOOLEAN":
          columns = { booleanValue: false };
          break;
        case "URL":
          columns = { urlValue: values[t] as string };
          break;
        case "MONEY":
          columns = { moneyAmountMinor: 0n, moneyCurrency: "EUR" };
          break;
        case "SINGLE_SELECT":
        case "MULTI_SELECT": {
          const option = await db!.customFieldOption.create({
            data: {
              fieldDefinitionId: def.id,
              value: "Selected",
              normalizedValue: "selected",
              position: 0,
            },
          });
          if (t === "SINGLE_SELECT") columns = { singleSelectOptionId: option.id };
          break;
        }
      }
      await db!.customFieldValue.create({
        data: {
          itemId: item,
          collectionId: collection,
          fieldDefinitionId: def.id,
          fieldType: t,
          ...columns,
        },
      });
      const ad = await db!.catalogAttributeDefinition.create({
        data: { categoryTemplateId: category, key: t.toLowerCase(), type: t, position: index },
      });
      catalog.set(t, ad.id);
      if (t === "SINGLE_SELECT" || t === "MULTI_SELECT")
        await db!.catalogAttributeOption.create({
          data: {
            definitionId: ad.id,
            key: "selected",
            position: 0,
            labels: {
              create: [
                { locale: "de", label: "Ausgewählte Option" },
                { locale: "en", label: "Chosen option" },
              ],
            },
          },
        });
      await db!.catalogAttributeValue.create({
        data: {
          entryId: entry,
          categoryTemplateId: category,
          definitionId: ad.id,
          targetKey: "entry",
          value: values[t],
        },
      });
    }
    await db!.catalogAttributeValue.create({
      data: {
        entryId: entry,
        categoryTemplateId: category,
        variantId: variant,
        definitionId: catalog.get("SHORT_TEXT")!,
        targetKey: variant,
        value: "Variant fact",
      },
    });
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: [owner, foreign] } } });
    if (db && entry) {
      await db.catalogAttributeValue.deleteMany({ where: { entryId: entry } });
      await db.catalogVariant.deleteMany({ where: { entryId: entry } });
      await db.catalogEntry.delete({ where: { id: entry } });
    }
    if (db && category) {
      await db.conditionOption.deleteMany({ where: { categoryTemplateId: category } });
      await db.conditionScheme.deleteMany({ where: { categoryTemplateId: category } });
      await db.categoryTemplate.delete({ where: { id: category } });
    }
    await db?.$disconnect();
  });
  it("does not include inaccessible private/public items in rows or total count", async () => {
    const r = await search(undefined, { text: "watch" });
    expect(r.total).toBe(1);
    expect(r.items.map((x) => x.id)).toEqual([item]);
    expect(r.items.map((x) => x.id)).not.toContain(hidden);
  });
  it.each(Object.keys(values) as CustomFieldType[])(
    "executes custom %s stored type",
    async (type) => {
      expect(await ids(typed("customField", type, typedTests[type]))).toEqual([item]);
      expect(await ids(typed("customField", type, { op: "missing" }))).toEqual([empty]);
    },
  );
  it.each(Object.keys(values) as CustomFieldType[])(
    "executes catalog %s stored type and scoped absence",
    async (type) => {
      expect(await ids(typed("catalogAttribute", type, typedTests[type]))).toEqual([item]);
      expect(await ids(typed("catalogAttribute", type, { op: "missing" }))).toEqual([]);
      expect(
        await ids({ kind: "not", child: typed("catalogAttribute", type, { op: "missing" }) }),
      ).toContain(empty);
    },
  );
  it("handles collection/category/condition and stored enums", async () => {
    for (const root of [
      { kind: "collection", test: { op: "in", values: [collection] } },
      { kind: "category", test: { op: "eq", value: category } },
      { kind: "category", test: { op: "in", values: [category] } },
      { kind: "condition", categoryTemplateId: category, test: { op: "eq", value: condition } },
      { kind: "condition", categoryTemplateId: category, test: { op: "in", values: [condition] } },
      { kind: "condition", categoryTemplateId: category, test: { op: "present" } },
      { kind: "tradeStatus", test: { op: "in", values: ["FOR_SALE"] } },
      { kind: "visibility", test: { op: "eq", value: "PUBLIC" } },
    ])
      expect(await ids(root)).toContain(item);
    expect(await ids({ kind: "category", test: { op: "missing" } })).toEqual([empty]);
    expect(
      await ids({ kind: "condition", categoryTemplateId: category, test: { op: "missing" } }),
    ).toEqual([]);
  });
  it("uses two-valued mixed NOT/OR, tags identity and literal values", async () => {
    expect(await ids({ kind: "tags", test: { op: "hasAll", values: [" İ  TAG "] } })).toEqual([
      item,
    ]);
    expect(
      await ids({ kind: "tags", test: { op: "hasAny", values: ["missing", "İ TAG"] } }),
    ).toEqual([item]);
    expect(await ids({ kind: "tags", test: { op: "missing" } })).toEqual([empty]);
    expect(
      await ids({
        kind: "not",
        child: {
          kind: "or",
          children: [
            { kind: "tags", test: { op: "present" } },
            { kind: "purchaseMoney", test: { op: "present" } },
          ],
        },
      }),
    ).toEqual([empty]);
    expect(await ids(typed("customField", "SINGLE_SELECT", { op: "eq", value: "absent" }))).toEqual(
      [],
    );
  });
  it("matches every ordered operator exactly, preserving decimal precision", async () => {
    for (const [op, extra] of [
      ["eq", { value: instant }],
      ["in", { values: [instant] }],
      ["lt", { value: "2027-01-01T00:00:00.000Z" }],
      ["lte", { value: instant }],
      ["gt", { value: "2025-01-01T00:00:00.000Z" }],
      ["gte", { value: instant }],
      ["between", { min: instant, max: instant }],
    ] as const)
      expect(await ids({ kind: "createdAt", test: { op, ...extra } })).toContain(item);
    expect(
      await ids({ kind: "updatedAt", test: { op: "gt", value: "2025-01-01T00:00:00.000Z" } }),
    ).toContain(item);
    expect(await ids({ kind: "acquisitionDate", test: { op: "present" } })).toEqual([item]);
    expect(await ids({ kind: "acquisitionDate", test: { op: "missing" } })).toEqual([empty]);
    for (const kind of ["customField", "catalogAttribute"] as const) {
      expect(await ids(typed(kind, "DECIMAL", { op: "lt", value: "10" }))).toEqual([item]);
      expect(await ids(typed(kind, "DECIMAL", { op: "eq", value: "2" }))).toEqual([]);
      expect(await ids(typed(kind, "SHORT_TEXT", { op: "contains", value: "literal" }))).toEqual(
        [],
      );
    }
  });
  it("requires grading components from one row and folds only provider ASCII", async () => {
    expect(
      await ids({
        kind: "grading",
        test: { op: "authored", provider: "pSa", grade: "Mint", certificateNo: "certificate-one" },
      }),
    ).toEqual([item]);
    expect(
      await ids({ kind: "grading", test: { op: "authored", provider: "PSA", grade: "Wrong" } }),
    ).toEqual([]);
    expect(
      await ids({
        kind: "grading",
        test: {
          op: "comparable",
          provider: "PSA",
          scale: "ten",
          value: { op: "gte", value: "9.5" },
        },
      }),
    ).toEqual([item]);
    expect(await ids({ kind: "grading", test: { op: "missing" } })).toEqual([empty]);
  });
  it("selects latest manual before denomination, keeps bigint/per-unit values", async () => {
    expect(
      await ids({
        kind: "manualMoney",
        test: { op: "range", unit: { currency: "EUR", minorUnitExponent: 2 }, minMinor: "0" },
      }),
    ).toEqual([]);
    expect(
      await ids({
        kind: "manualMoney",
        test: {
          op: "range",
          unit: { currency: "JPY", minorUnitExponent: 0 },
          minMinor: "9007199254740993",
          maxMinor: "9007199254740993",
        },
      }),
    ).toEqual([item]);
    expect(await ids({ kind: "manualMoney", test: { op: "present" } })).toEqual([item]);
    expect(await ids({ kind: "manualMoney", test: { op: "missing" } })).toEqual([empty]);
    expect(await ids({ kind: "purchaseMoney", test: { op: "present" } })).toEqual([item]);
    expect(await ids({ kind: "purchaseMoney", test: { op: "missing" } })).toEqual([empty]);
  });
  it.each([
    "äöüß",
    "Café",
    "Cafe\u0301",
    "100%_\\'",
    "Public phrase",
    "i\u0307 tag",
    "ID-literal",
    "certificate-one",
    "Long authored",
    "Selected",
    "Uhrenkategorie",
    "Clock category",
    "Katalogübersetzung",
    "Retired selected variant",
    "Chosen option",
    "Ausgewählte Option",
  ])("searches literal Unicode broad whitelist: %s", async (text) => {
    expect((await search(undefined, { text })).items.map((x) => x.id)).toEqual([item]);
  });
  it.each(["Private secret phrase", "Secret other variant", "100ZZ", "unselected option"])(
    "excludes non-whitelisted/unselected/literal mismatch: %s",
    async (text) => {
      expect((await search(undefined, { text })).total).toBe(0);
    },
  );
  it("uses retained exact selected variant facts, no entry fallback after removal", async () => {
    expect(
      await ids(
        typed(
          "catalogAttribute",
          "SHORT_TEXT",
          { op: "eq", value: "Variant fact" },
          "SELECTED_VARIANT",
        ),
      ),
    ).toEqual([item]);
    expect(
      await ids(
        typed(
          "catalogAttribute",
          "SHORT_TEXT",
          { op: "eq", value: values.SHORT_TEXT },
          "SELECTED_VARIANT",
        ),
      ),
    ).toEqual([]);
    await db!.catalogAttributeValue.deleteMany({ where: { entryId: entry, variantId: variant } });
    expect(
      await ids(typed("catalogAttribute", "SHORT_TEXT", { op: "missing" }, "SELECTED_VARIANT")),
    ).toEqual([item]);
  });
  it("rejects all unavailable families below NOT/OR even on empty candidates", async () => {
    const leaves = [
      { kind: "duplicate", value: true },
      {
        kind: "purchaseMoney",
        test: {
          op: "range",
          unit: { currency: "EUR", minorUnitExponent: 2, unitKey: "x" },
          minMinor: "0",
        },
      },
      typed("customField", "MONEY", {
        op: "range",
        unit: { currency: "EUR", minorUnitExponent: 2, unitKey: "x" },
        minMinor: "0",
      }),
      typed("catalogAttribute", "MONEY", {
        op: "range",
        unit: { currency: "EUR", minorUnitExponent: 2, unitKey: "x" },
        minMinor: "0",
      }),
      {
        kind: "marketMoney",
        selector: {
          mode: "CURRENT_ITEM_MAPPING",
          providerId: "fixture",
          identifierNamespace: "fixture",
          identifierType: "product",
          kind: "LAST_SOLD",
          currency: "EUR",
          sourceMetric: "market",
          qualifiers: {},
          minorUnitExponent: 2,
        },
        test: { op: "missing" },
      },
    ];
    for (const leaf of leaves)
      for (const root of [
        { kind: "not", child: leaf },
        {
          kind: "or",
          children: [{ kind: "visibility", test: { op: "eq", value: "PUBLIC" } }, leaf],
        },
      ])
        await expect(search(root, { text: "no matches" })).rejects.toMatchObject({
          code: "FILTER_UNAVAILABLE",
        });
  });
  it("validates private/nonexistent/type/option references independent of Boolean matches", async () => {
    const roots = [
      { kind: "collection", test: { op: "eq", value: otherCollection } },
      { kind: "collection", test: { op: "eq", value: randomUUID() } },
      { kind: "category", test: { op: "eq", value: randomUUID() } },
      typed("customField", "INTEGER", { op: "present" }),
      typed("catalogAttribute", "SINGLE_SELECT", { op: "eq", value: "unknown" }),
    ];
    (roots[3] as { selector: { definitionId: string } }).selector.definitionId =
      custom.get("SHORT_TEXT")!;
    for (const leaf of roots)
      for (const root of [
        { kind: "not", child: leaf },
        {
          kind: "or",
          children: [{ kind: "visibility", test: { op: "eq", value: "PUBLIC" } }, leaf],
        },
      ])
        await expect(search(root, { text: "no match" })).rejects.toMatchObject({
          code: "FILTER_REFERENCE_INVALID",
        });
  });
  it.each([
    ["DECIMAL", 1],
    ["DECIMAL", "1e3"],
    ["DECIMAL", "999999999999999999999"],
    ["DECIMAL", "NaN"],
    ["DATE", "2024-02-30"],
    ["DATE", "0000-01-01"],
    ["INTEGER", 1.1],
    ["INTEGER", 9007199254740992],
    ["BOOLEAN", "false"],
    ["MULTI_SELECT", {}],
    ["MULTI_SELECT", ["unknown"]],
    ["MULTI_SELECT", [1]],
    ["MONEY", { amountMinor: -1, currency: "EUR" }],
  ] as const)(
    "rejects malformed relevant catalog %s under NOT independently of match",
    async (type, value) => {
      const definitionId = catalog.get(type)!;
      await db!.catalogAttributeValue.update({
        where: {
          entryId_targetKey_definitionId: { entryId: entry, targetKey: "entry", definitionId },
        },
        data: { value: value as Prisma.InputJsonValue },
      });
      try {
        await expect(
          search(
            { kind: "not", child: typed("catalogAttribute", type, { op: "missing" }) },
            { text: "no match" },
          ),
        ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
      } finally {
        await db!.catalogAttributeValue.update({
          where: {
            entryId_targetKey_definitionId: { entryId: entry, targetKey: "entry", definitionId },
          },
          data: { value: values[type] },
        });
      }
    },
  );
  it("paginates tied keys, keeps pre-cursor total on exhausted pages and revalidates live state", async () => {
    const first = await search(undefined, { limit: 1 });
    expect(first.total).toBe(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await search(undefined, { limit: 1, cursor: first.nextCursor! });
    expect(second.total).toBe(2);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    expect(second.nextCursor).toBeNull();
    const normalized = parseItemSearchQuery({ limit: 1 });
    const exhausted = encodeSearchCursor({
      v: 1,
      contextHash: searchContextHash(owner, normalized, null),
      after: { createdAt: "2000-01-01T00:00:00.000Z", id: randomUUID() },
    });
    const last = await search(undefined, { limit: 1, cursor: exhausted });
    expect(last.items).toEqual([]);
    expect(last.total).toBe(2);
    await expect(
      query().searchItems({ userId: foreign }, { limit: 1, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
  });
  it("enforces all lifecycle states, item deletion and deleted parent", async () => {
    const archived = await makeItem({ archivedAt: new Date() }),
      disposed = await makeItem({ disposedAt: new Date() }),
      both = await makeItem({ archivedAt: new Date(), disposedAt: new Date() }),
      deleted = await makeItem({ deletedAt: new Date() });
    const parent = await db!.collection.create({
      data: { ownerId: owner, name: "Deleted", deletedAt: new Date() },
    });
    const child = await makeItem({ collectionId: parent.id });
    try {
      expect((await search()).total).toBe(2);
      expect((await search(undefined, { lifecycle: "ARCHIVED" })).items.map((x) => x.id)).toEqual([
        archived.id,
      ]);
      expect(
        (await search(undefined, { lifecycle: "DISPOSED" })).items.map((x) => x.id).sort(),
      ).toEqual([disposed.id, both.id].sort());
      expect((await search(undefined, { lifecycle: "ALL" })).total).toBe(5);
      expect((await search(undefined, { lifecycle: "ALL" })).items.map((x) => x.id)).not.toContain(
        child.id,
      );
    } finally {
      await db!.collectibleItem.deleteMany({
        where: { id: { in: [archived.id, disposed.id, both.id, deleted.id, child.id] } },
      });
      await db!.collection.delete({ where: { id: parent.id } });
    }
  });
  it("keeps one MVCC snapshot between count and rows then sees the next edit", async () => {
    let changed = false;
    const wrapped: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const result = await tx.$queryRaw<T>(sql);
                if (sql.text.startsWith("SELECT count(*)") && !changed) {
                  changed = true;
                  await db!.collectibleItem.update({
                    where: { id: empty },
                    data: { archivedAt: new Date() },
                  });
                }
                return result;
              },
            }),
          options,
        ),
    };
    try {
      const r = await query(wrapped).searchItems({ userId: owner }, {});
      expect(r.total).toBe(2);
      expect(r.items).toHaveLength(2);
      expect((await search()).total).toBe(1);
    } finally {
      await db!.collectibleItem.update({ where: { id: empty }, data: { archivedAt: null } });
    }
  });
  it("requires READY usable assets and exact document category/owner", async () => {
    for (const kind of ["IMAGE", "DOCUMENT"] as const) {
      const asset = await db!.mediaAsset.create({
        data: {
          ownerId: owner,
          kind,
          status: "PENDING",
          storageKey: randomUUID(),
          mimeType: kind === "IMAGE" ? "image/png" : "application/pdf",
          byteSize: 1n,
          checksumSha256: "a".repeat(64),
          originalFileName: "fixture",
        },
      });
      if (kind === "IMAGE")
        await db!.mediaLink.create({
          data: { assetId: asset.id, itemId: item, ownerId: owner, position: 0 },
        });
      else
        await db!.documentLink.create({
          data: {
            assetId: asset.id,
            itemId: item,
            ownerId: owner,
            position: 0,
            category: "OTHER_PRIVATE",
          },
        });
      const leaf = { kind: "media", mediaKind: kind, test: { op: "present" } };
      try {
        for (const status of ["PENDING", "PROCESSING", "FAILED"] as const) {
          await db!.mediaAsset.update({ where: { id: asset.id }, data: { status } });
          expect(await ids(leaf)).toEqual([]);
        }
        await db!.mediaAsset.update({ where: { id: asset.id }, data: { status: "READY" } });
        expect(await ids(leaf)).toEqual([item]);
        if (kind === "DOCUMENT")
          expect(await ids({ ...leaf, documentCategory: "OTHER_PRIVATE" })).toEqual([item]);
        await db!.mediaAsset.update({
          where: { id: asset.id },
          data: { cleanupStartedAt: new Date() },
        });
        expect(await ids(leaf)).toEqual([]);
        expect(await ids({ ...leaf, test: { op: "missing" } })).toContain(item);
      } finally {
        await db!.mediaLink.deleteMany({ where: { assetId: asset.id } });
        await db!.documentLink.deleteMany({ where: { assetId: asset.id } });
        await db!.mediaAsset.delete({ where: { id: asset.id } });
      }
    }
  });
  it("rejects native nonfinite decimal and noncanonical date facts before NOT/filter narrowing", async () => {
    await db!
      .$executeRaw`UPDATE "CustomFieldValue" SET "decimalValue"='NaN'::numeric WHERE "itemId"=${item}::uuid AND "fieldDefinitionId"=${custom.get("DECIMAL")}::uuid`;
    try {
      await expect(
        search(
          { kind: "not", child: typed("customField", "DECIMAL", { op: "missing" }) },
          { text: "no match" },
        ),
      ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
    } finally {
      await db!.customFieldValue.update({
        where: {
          itemId_fieldDefinitionId: { itemId: item, fieldDefinitionId: custom.get("DECIMAL")! },
        },
        data: { decimalValue: values.DECIMAL as string },
      });
    }
    await db!
      .$executeRaw`UPDATE "CustomFieldValue" SET "dateValue"='0001-01-01 BC'::date WHERE "itemId"=${item}::uuid AND "fieldDefinitionId"=${custom.get("DATE")}::uuid`;
    try {
      await expect(search(typed("customField", "DATE", { op: "present" }))).rejects.toMatchObject({
        code: "SEARCH_INVARIANT",
      });
    } finally {
      await db!.customFieldValue.update({
        where: {
          itemId_fieldDefinitionId: { itemId: item, fieldDefinitionId: custom.get("DATE")! },
        },
        data: { dateValue: new Date("2024-02-29") },
      });
    }
  });

  it("matches multi-select subsets and normalized custom identities without matching unselected labels", async () => {
    const def = custom.get("MULTI_SELECT")!,
      ad = catalog.get("MULTI_SELECT")!;
    const first = await db!.customFieldOption.findFirstOrThrow({
      where: { fieldDefinitionId: def },
    });
    const second = await db!.customFieldOption.create({
      data: {
        fieldDefinitionId: def,
        value: "İ Choice",
        normalizedValue: "i\u0307 choice",
        position: 1,
      },
    });
    const option = await db!.catalogAttributeOption.create({
      data: {
        definitionId: ad,
        key: "second",
        position: 1,
        labels: { create: { locale: "en", label: "Second chosen label" } },
      },
    });
    const unselected = await db!.catalogAttributeOption.create({
      data: {
        definitionId: ad,
        key: "unselected",
        position: 2,
        labels: { create: { locale: "en", label: "Never selected label" } },
      },
    });
    await db!.customFieldMultiSelectValue.createMany({
      data: [first, second].map((o, position) => ({
        itemId: item,
        fieldDefinitionId: def,
        optionId: o.id,
        position,
      })),
    });
    await db!.catalogAttributeValue.update({
      where: {
        entryId_targetKey_definitionId: { entryId: entry, targetKey: "entry", definitionId: ad },
      },
      data: { value: ["selected", "second"] },
    });
    try {
      for (const [kind, secondValue] of [
        ["customField", " İ  Choice "],
        ["catalogAttribute", "second"],
      ] as const) {
        expect(
          await ids(
            typed(kind, "MULTI_SELECT", { op: "hasAll", values: ["selected", secondValue] }),
          ),
        ).toEqual([item]);
        expect(
          await ids(typed(kind, "MULTI_SELECT", { op: "hasAny", values: [secondValue] })),
        ).toEqual([item]);
        expect(
          await ids(typed(kind, "MULTI_SELECT", { op: "hasAll", values: ["selected"] })),
        ).toEqual([item]);
      }
      expect(
        await ids(
          typed("customField", "MULTI_SELECT", {
            op: "hasAll",
            values: ["selected", "nonexistent"],
          }),
        ),
      ).toEqual([]);
      expect((await search(undefined, { text: "Second chosen label" })).total).toBe(1);
      expect((await search(undefined, { text: "Never selected label" })).total).toBe(0);
    } finally {
      await db!.customFieldMultiSelectValue.deleteMany({
        where: { itemId: item, fieldDefinitionId: def },
      });
      await db!.customFieldOption.delete({ where: { id: second.id } });
      await db!.catalogAttributeValue.update({
        where: {
          entryId_targetKey_definitionId: { entryId: entry, targetKey: "entry", definitionId: ad },
        },
        data: { value: [] },
      });
      await db!.catalogAttributeOption.deleteMany({
        where: { id: { in: [option.id, unselected.id] } },
      });
    }
  });
  it("orders latest manual timestamp/id ties and supports zero/int64/exponents 0 through 4", async () => {
    const made = await makeItem({ quantity: 7 });
    try {
      for (const [exponent, currency] of [
        [0, "JPY"],
        [2, "EUR"],
        [3, "KWD"],
        [4, "CLF"],
      ] as const) {
        const observedAt = new Date(Date.UTC(2027, 0, exponent + 1)),
          createdAt = new Date("2027-02-01");
        const low = `00000000-0000-4000-8000-${String(exponent * 2 + 1).padStart(12, "0")}`,
          high = `00000000-0000-4000-8000-${String(exponent * 2 + 2).padStart(12, "0")}`;
        await db!.valuation.createMany({
          data: [
            {
              id: low,
              itemId: made.id,
              ownerId: owner,
              actorUserId: owner,
              amountMinor: 9223372036854775807n,
              currency,
              minorUnitExponent: exponent,
              observedAt,
              createdAt,
            },
            {
              id: high,
              itemId: made.id,
              ownerId: owner,
              actorUserId: owner,
              amountMinor: 0n,
              currency,
              minorUnitExponent: exponent,
              observedAt,
              createdAt,
            },
          ],
        });
        expect(
          await ids({
            kind: "manualMoney",
            test: {
              op: "range",
              unit: { currency, minorUnitExponent: exponent },
              minMinor: "0",
              maxMinor: "0",
            },
          }),
        ).toContain(made.id);
        expect(
          await ids({
            kind: "manualMoney",
            test: {
              op: "range",
              unit: { currency, minorUnitExponent: exponent },
              minMinor: "9223372036854775807",
            },
          }),
        ).not.toContain(made.id);
        expect(
          await ids({
            kind: "manualMoney",
            test: { op: "range", unit: { currency, minorUnitExponent: 1 }, minMinor: "0" },
          }),
        ).not.toContain(made.id);
        await db!.valuation.delete({ where: { id: high } });
        expect(
          await ids({
            kind: "manualMoney",
            test: {
              op: "range",
              unit: { currency, minorUnitExponent: exponent },
              minMinor: "9223372036854775807",
              maxMinor: "9223372036854775807",
            },
          }),
        ).toContain(made.id);
      }
    } finally {
      await db!.collectibleItem.delete({ where: { id: made.id } });
    }
  });
  it.each(["delete", "parent", "tag", "custom", "catalog"])(
    "keeps count/rows on one snapshot during concurrent %s change",
    async (change) => {
      const tag = await db!.itemTag.findFirstOrThrow({ where: { itemId: item } });
      const customKey = {
        itemId_fieldDefinitionId: { itemId: item, fieldDefinitionId: custom.get("SHORT_TEXT")! },
      };
      const catalogKey = {
        entryId_targetKey_definitionId: {
          entryId: entry,
          targetKey: "entry",
          definitionId: catalog.get("DECIMAL")!,
        },
      };
      const root =
        change === "tag"
          ? { kind: "tags", test: { op: "present" } }
          : change === "custom"
            ? typed("customField", "SHORT_TEXT", { op: "eq", value: values.SHORT_TEXT })
            : change === "catalog"
              ? typed("catalogAttribute", "DECIMAL", { op: "lt", value: "3" })
              : { kind: "visibility", test: { op: "eq", value: "PUBLIC" } };
      const mutate = async () => {
        if (change === "delete")
          await db!.collectibleItem.update({
            where: { id: item },
            data: { deletedAt: new Date() },
          });
        if (change === "parent")
          await db!.collection.update({
            where: { id: collection },
            data: { deletedAt: new Date() },
          });
        if (change === "tag") await db!.itemTag.delete({ where: { itemId_tagId: tag } });
        if (change === "custom")
          await db!.customFieldValue.update({
            where: customKey,
            data: { shortTextValue: "Changed" },
          });
        if (change === "catalog")
          await db!.catalogAttributeValue.update({ where: catalogKey, data: { value: "10" } });
      };
      let changed = false;
      const wrapped: SearchDatabase = {
        $transaction: (work, options) =>
          db!.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  const result = await tx.$queryRaw<T>(sql);
                  if (sql.text.startsWith("SELECT count(*)") && !changed) {
                    changed = true;
                    await mutate();
                  }
                  return result;
                },
              }),
            options,
          ),
      };
      try {
        const input = { filter: { version: 1, root } };
        const result = await query(wrapped).searchItems({ userId: owner }, input);
        expect(result.total).toBe(1);
        expect(result.items.map((x) => x.id)).toEqual([item]);
        expect((await query().searchItems({ userId: owner }, input)).total).toBe(0);
      } finally {
        if (change === "delete")
          await db!.collectibleItem.update({ where: { id: item }, data: { deletedAt: null } });
        if (change === "parent")
          await db!.collection.update({ where: { id: collection }, data: { deletedAt: null } });
        if (change === "tag") await db!.itemTag.create({ data: tag });
        if (change === "custom")
          await db!.customFieldValue.update({
            where: customKey,
            data: { shortTextValue: values.SHORT_TEXT as string },
          });
        if (change === "catalog")
          await db!.catalogAttributeValue.update({
            where: catalogKey,
            data: { value: values.DECIMAL },
          });
      }
    },
  );
  it("handles a missing required ICU dependency without issuing the text query", async () => {
    let queries = 0;
    const wrapped: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                queries++;
                if (sql.text.includes("AS collation"))
                  return [{ now: new Date(), collation: false }] as T;
                return tx.$queryRaw<T>(sql);
              },
            }),
          options,
        ),
    };
    await expect(
      query(wrapped).searchItems({ userId: owner }, { text: "watch" }),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    expect(queries).toBe(3);
  });
  it("measures actual owned synthetic count/rows plans without speculative indexes", async () => {
    const { candidateFrom, ownedCandidates, compileFilter } = await import("./search-compiler");
    const { compileBroadText } = await import("./search-text");
    const bulk = await db!.collectibleItem.createManyAndReturn({
      data: Array.from({ length: 1000 }, (_, index) => ({
        ownerId: owner,
        collectionId: collection,
        title: `Plan fixture ${index}`,
        createdAt: new Date(instant),
      })),
      select: { id: true },
    });
    try {
      for (const [name, predicate] of [
        ["owned", Prisma.sql`TRUE`],
        ["broad", compileBroadText("fixture", owner)],
        [
          "typed",
          compileFilter(
            typed("customField", "DECIMAL", { op: "lt", value: "10" }) as ItemFilterNode,
            owner,
          ),
        ],
      ] as const) {
        const plan = await db!.$queryRaw(
          Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) ${candidateFrom} WHERE ${ownedCandidates(owner, "ACTIVE")} AND ${predicate}`,
        );
        console.info(`search plan ${name}`, JSON.stringify(plan));
        const rowPlan = await db!.$queryRaw(
          Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT i.id,i.title ${candidateFrom} WHERE ${ownedCandidates(owner, "ACTIVE")} AND ${predicate} ORDER BY i."createdAt" DESC,i.id DESC LIMIT 21`,
        );
        console.info(`search rows plan ${name}`, JSON.stringify(rowPlan));
      }
    } finally {
      await db!.collectibleItem.deleteMany({ where: { id: { in: bulk.map((x) => x.id) } } });
    }
  });

  it("executes typed eq/in/order/prefix operators across both storage families", async () => {
    for (const kind of ["customField", "catalogAttribute"] as const) {
      for (const type of ["SHORT_TEXT", "LONG_TEXT", "URL", "SINGLE_SELECT"] as const) {
        const value =
          kind === "customField" && type === "SINGLE_SELECT" ? " SELECTED " : values[type];
        expect(await ids(typed(kind, type, { op: "eq", value }))).toEqual([item]);
        expect(await ids(typed(kind, type, { op: "in", values: [value] }))).toEqual([item]);
      }
      for (const [type, exact, below, above] of [
        ["DECIMAL", "2.000000000000000001", "-10", "10"],
        ["DATE", "2024-02-29", "2023-01-01", "2025-01-01"],
      ] as const) {
        for (const test of [
          { op: "eq", value: exact },
          { op: "in", values: [exact] },
          { op: "lt", value: above },
          { op: "lte", value: exact },
          { op: "gt", value: below },
          { op: "gte", value: exact },
          { op: "between", min: exact, max: exact },
        ])
          expect(await ids(typed(kind, type, test))).toEqual([item]);
      }
      expect(
        await ids(typed(kind, "SHORT_TEXT", { op: "startsWith", value: "Literal %" })),
      ).toEqual([item]);
    }
    expect(await ids({ kind: "tradeStatus", test: { op: "eq", value: "FOR_SALE" } })).toEqual([
      item,
    ]);
    expect(await ids({ kind: "visibility", test: { op: "in", values: ["PUBLIC"] } })).toEqual([
      item,
    ]);
    expect(await ids({ kind: "category", test: { op: "present" } })).toEqual([item]);
  });
  it("does not inspect corrupt catalog facts reachable only through foreign inventory", async () => {
    const remote = await db!.catalogEntry.create({
      data: { categoryTemplateId: category, authored: {} },
    });
    await db!.catalogAttributeValue.create({
      data: {
        entryId: remote.id,
        categoryTemplateId: category,
        definitionId: catalog.get("DECIMAL")!,
        targetKey: "entry",
        value: "NaN",
      },
    });
    await db!.collectibleItem.update({
      where: { id: hidden },
      data: { categoryTemplateId: category, catalogEntryId: remote.id },
    });
    try {
      expect(await ids(typed("catalogAttribute", "DECIMAL", { op: "lt", value: "10" }))).toEqual([
        item,
      ]);
    } finally {
      await db!.collectibleItem.update({
        where: { id: hidden },
        data: { catalogEntryId: null, categoryTemplateId: null },
      });
      await db!.catalogAttributeValue.deleteMany({ where: { entryId: remote.id } });
      await db!.catalogEntry.delete({ where: { id: remote.id } });
    }
  });
});
