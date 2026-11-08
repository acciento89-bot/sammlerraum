import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemSearchService, type SearchDatabase } from "./item-search-service";
import { validateFieldValue } from "../custom-fields/custom-field-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `search_integrity_${randomUUID()}`,
  foreign = `search_integrity_${randomUUID()}`;
let collection: string,
  otherCollection: string,
  item: string,
  otherItem: string,
  category: string,
  entry: string,
  variant: string;
const custom = new Map<string, string>(),
  catalog = new Map<string, string>();
type Family = "customField" | "catalogAttribute";
type Field = "SHORT_TEXT" | "LONG_TEXT" | "URL";
const originals = {
  SHORT_TEXT: "Canonical watch",
  LONG_TEXT: "Canonical long watch",
  URL: "https://example.invalid/",
};
const query = (database: SearchDatabase = db!) => createItemSearchService(database);
function leaf(kind: Family, type: Field, op = "present", target = "ENTRY") {
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
    predicate: { valueType: type, test: { op } },
  };
}
async function search(root?: unknown, text?: string, database: SearchDatabase = db!) {
  return query(database).searchItems(
    { userId: owner },
    { ...(root ? { filter: { version: 1, root } } : {}), ...(text !== undefined ? { text } : {}) },
  );
}
async function setValue(kind: Family, type: Field, value: string) {
  if (kind === "customField")
    await db!.customFieldValue.update({
      where: { itemId_fieldDefinitionId: { itemId: item, fieldDefinitionId: custom.get(type)! } },
      data:
        type === "URL"
          ? { urlValue: value }
          : type === "SHORT_TEXT"
            ? { shortTextValue: value }
            : { longTextValue: value },
    });
  else
    await db!.catalogAttributeValue.update({
      where: {
        entryId_targetKey_definitionId: {
          entryId: entry,
          targetKey: "entry",
          definitionId: catalog.get(type)!,
        },
      },
      data: { value },
    });
}
const trimChars = [
  "\t",
  "\n",
  "\v",
  "\f",
  "\r",
  " ",
  "\u00a0",
  "\u1680",
  ...Array.from({ length: 11 }, (_, i) => String.fromCharCode(0x2000 + i)),
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
  "\ufeff",
];
describe.runIf(enabled)("retained search integrity producer parity", () => {
  beforeAll(async () => {
    await db!.user.createMany({
      data: [owner, foreign].map((id) => ({
        id,
        name: "Integrity",
        email: `${id}@example.invalid`,
      })),
    });
    collection = (await db!.collection.create({ data: { ownerId: owner, name: "Integrity" } })).id;
    otherCollection = (
      await db!.collection.create({ data: { ownerId: foreign, name: "Integrity" } })
    ).id;
    category = (
      await db!.categoryTemplate.create({
        data: { key: `integrity_${randomUUID().replaceAll("-", "")}` },
      })
    ).id;
    entry = (
      await db!.catalogEntry.create({
        data: { categoryTemplateId: category, authored: { text: { title: "Reference" } } },
      })
    ).id;
    variant = (
      await db!.catalogVariant.create({ data: { entryId: entry, active: false, authored: {} } })
    ).id;
    item = (
      await db!.collectibleItem.create({
        data: {
          ownerId: owner,
          collectionId: collection,
          title: "Neutral",
          categoryTemplateId: category,
          catalogEntryId: entry,
          catalogVariantId: variant,
        },
      })
    ).id;
    otherItem = (
      await db!.collectibleItem.create({
        data: { ownerId: foreign, collectionId: otherCollection, title: "Foreign" },
      })
    ).id;
    for (const [position, type] of (["SHORT_TEXT", "LONG_TEXT", "URL"] as const).entries()) {
      const def = await db!.customFieldDefinition.create({
        data: { collectionId: collection, name: type, normalizedName: type, type },
      });
      custom.set(type, def.id);
      await db!.customFieldValue.create({
        data: {
          itemId: item,
          collectionId: collection,
          fieldDefinitionId: def.id,
          fieldType: type,
          ...(type === "URL"
            ? { urlValue: originals[type] }
            : type === "SHORT_TEXT"
              ? { shortTextValue: originals[type] }
              : { longTextValue: originals[type] }),
        },
      });
      const attr = await db!.catalogAttributeDefinition.create({
        data: { categoryTemplateId: category, key: type.toLowerCase(), type, position },
      });
      catalog.set(type, attr.id);
      await db!.catalogAttributeValue.create({
        data: {
          entryId: entry,
          categoryTemplateId: category,
          definitionId: attr.id,
          targetKey: "entry",
          value: originals[type],
        },
      });
    }
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: [owner, foreign] } } });
    if (db && entry) {
      await db.catalogAttributeValue.deleteMany({ where: { entryId: entry } });
      await db.catalogVariant.deleteMany({ where: { entryId: entry } });
      await db.catalogEntry.delete({ where: { id: entry } });
    }
    if (db && category) await db.categoryTemplate.delete({ where: { id: category } });
    await db?.$disconnect();
  });
  it.each(["SHORT_TEXT", "LONG_TEXT"] as const)(
    "rejects non-NFKC native %s under broad-only and independently nonmatching predicates",
    async (type) => {
      await setValue("customField", type, "Ｗａｔｃｈ");
      try {
        for (const root of [undefined, { kind: "visibility", test: { op: "eq", value: "PUBLIC" } }])
          for (const text of ["watch", "nothing matches"])
            await expect(search(root, text)).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
      } finally {
        await setValue("customField", type, originals[type]);
      }
    },
  );
  it.each(["customField", "catalogAttribute"] as const)(
    "rejects every ECMAScript boundary whitespace in retained %s text",
    async (kind) => {
      for (const type of ["SHORT_TEXT", "LONG_TEXT"] as const)
        for (const char of trimChars) {
          const value = `${char}watch${char}`;
          expect(validateFieldValue(type, value)).toBe("watch");
          await setValue(kind, type, value);
          try {
            for (const root of [
              leaf(kind, type),
              { kind: "not", child: leaf(kind, type, "missing") },
              undefined,
            ])
              await expect(search(root, "no match")).rejects.toMatchObject({
                code: "SEARCH_INVARIANT",
              });
          } finally {
            await setValue(kind, type, originals[type]);
          }
        }
    },
    20000,
  );
  it.each(["customField", "catalogAttribute"] as const)(
    "uses producer UTF16 bounds and accepts legitimate Unicode for %s",
    async (kind) => {
      for (const type of ["SHORT_TEXT", "LONG_TEXT"] as const) {
        const max = type === "SHORT_TEXT" ? 255 : 10000;
        const valid = "😀".repeat(Math.floor(max / 2)) + (max % 2 ? "a" : "");
        expect(validateFieldValue(type, valid)).toBe(valid);
        await setValue(kind, type, valid);
        expect((await search(leaf(kind, type))).total).toBe(1);
        const invalid = "😀".repeat(Math.floor(max / 2) + 1);
        expect(() => validateFieldValue(type, invalid)).toThrow();
        await setValue(kind, type, invalid);
        try {
          await expect(
            search({ kind: "not", child: leaf(kind, type, "missing") }, "no match"),
          ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
        } finally {
          await setValue(kind, type, originals[type]);
        }
        for (const value of [
          "é Café",
          "\u0085watch\u0085",
          "\u180ewatch\u180e",
          "\u200bwatch\u200b",
          "a\t\nb",
          "\u{10000}\u{10ffff}\uffff",
        ]) {
          expect(validateFieldValue(type, value)).toBe(value);
          await setValue(kind, type, value);
          expect((await search(leaf(kind, type))).total).toBe(1);
        }
        await setValue(kind, type, originals[type]);
      }
    },
  );
  const invalidUrls = [
    "https://user:pass@example.invalid/",
    "https://example.invalid:99999/",
    "https://[broken]/",
    "https://example.invalid:",
    "https://EXAMPLE.invalid/",
    "https://example.invalid:443/",
    "https://example.invalid",
    "https://example.invalid/a/../b",
    "https://example.invalid/\tpath",
  ];
  it.each(["customField", "catalogAttribute"] as const)(
    "rejects invalid/noncanonical %s URLs under presence/NOT and no-match text",
    async (kind) => {
      for (const value of invalidUrls) {
        let valid = false;
        try {
          valid = validateFieldValue("URL", value) === value;
        } catch {}
        expect(valid).toBe(false);
        await setValue(kind, "URL", value);
        try {
          for (const root of [
            leaf(kind, "URL"),
            { kind: "not", child: leaf(kind, "URL", "missing") },
            {
              kind: "and",
              children: [
                leaf(kind, "URL"),
                { kind: "visibility", test: { op: "eq", value: "PUBLIC" } },
              ],
            },
          ])
            await expect(search(root, "no match")).rejects.toMatchObject({
              code: "SEARCH_INVARIANT",
            });
        } finally {
          await setValue(kind, "URL", originals.URL);
        }
      }
    },
  );
  it.each(["customField", "catalogAttribute"] as const)(
    "accepts producer-canonical %s URLs with IPv6, path/query/fragment @ and percent escapes",
    async (kind) => {
      for (const value of [
        "http://[::1]:8080/a@b?q=user@example.invalid#@fragment",
        "https://example.invalid/%E2%82%AC/%2f?a=%40&b=@#%E2%98%83",
        "https://xn--bcher-kva.example/a",
        "https://example.invalid/a%20b",
      ]) {
        expect(validateFieldValue("URL", value)).toBe(value);
        await setValue(kind, "URL", value);
        expect((await search(leaf(kind, "URL"))).total).toBe(1);
      }
      await setValue(kind, "URL", originals.URL);
    },
  );
  it("ignores foreign, unselected definition/variant URL corruption and does no URL work without a URL leaf", async () => {
    const foreignDef = await db!.customFieldDefinition.create({
      data: {
        collectionId: otherCollection,
        name: "Foreign text",
        normalizedName: "foreign",
        type: "SHORT_TEXT",
      },
    });
    await db!.customFieldValue.create({
      data: {
        itemId: otherItem,
        collectionId: otherCollection,
        fieldDefinitionId: foreignDef.id,
        fieldType: "SHORT_TEXT",
        shortTextValue: "Ｗａｔｃｈ",
      },
    });
    const unselected = await db!.catalogVariant.create({ data: { entryId: entry, authored: {} } });
    await db!.catalogAttributeValue.create({
      data: {
        entryId: entry,
        categoryTemplateId: category,
        variantId: unselected.id,
        targetKey: unselected.id,
        definitionId: catalog.get("URL")!,
        value: "https://user:pass@example.invalid/",
      },
    });
    await setValue("customField", "URL", "https://user:pass@example.invalid/");
    try {
      expect((await search(undefined, "Canonical")).total).toBe(1);
      expect((await search(leaf("catalogAttribute", "URL"))).total).toBe(1);
      expect(
        (await search(leaf("catalogAttribute", "URL", "missing", "SELECTED_VARIANT"))).total,
      ).toBe(1);
    } finally {
      await setValue("customField", "URL", originals.URL);
      await db!.catalogAttributeValue.deleteMany({ where: { variantId: unselected.id } });
      await db!.catalogVariant.delete({ where: { id: unselected.id } });
    }
  });
  it("bounds distinct URL count and UTF8 bytes before transfer, without partial count/page or value disclosure", async () => {
    const created = await db!.collectibleItem.createManyAndReturn({
      data: Array.from({ length: 4097 }, () => ({
        ownerId: owner,
        collectionId: collection,
        title: "URL cap",
      })),
      select: { id: true },
    });
    const urls = created.map((_, n) => `https://example.invalid/${n}/`.padEnd(2048, "a"));
    const manifest: Array<{ count: bigint; bytes: bigint; values: string[] | null }> = [];
    let countOrPage = 0;
    const observed: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (sql.text.includes("search_url_manifest"))
                  manifest.push(...(rows as typeof manifest));
                if (
                  sql.text.startsWith("SELECT count(*) AS total") ||
                  sql.text.startsWith("SELECT i.id,i.title")
                )
                  countOrPage++;
                return rows;
              },
            }),
          options,
        ),
    };
    try {
      for (let i = 0; i < created.length; i += 500)
        await db!.customFieldValue.createMany({
          data: created.slice(i, i + 500).map((row, n) => ({
            itemId: row.id,
            collectionId: collection,
            fieldDefinitionId: custom.get("URL")!,
            fieldType: "URL",
            urlValue: urls[i + n]!,
          })),
        });
      await setValue("customField", "URL", urls[0]!);
      // Prepare actual planner statistics after deliberate bulk fixture growth;
      // limit, snapshot and retained-integrity assertions remain independent.
      await db!.$executeRaw`ANALYZE "CollectibleItem", "CustomFieldValue"`;
      const rejectWithoutValues = async (expectedCount: bigint, expectedBytes: bigint) => {
        manifest.length = 0;
        countOrPage = 0;
        await expect(search(leaf("customField", "URL"), undefined, observed)).rejects.toMatchObject(
          { code: "SEARCH_UNAVAILABLE", message: "SEARCH_UNAVAILABLE" },
        );
        expect(manifest).toEqual([{ count: expectedCount, bytes: expectedBytes, values: null }]);
        expect(countOrPage).toBe(0);
      };
      await rejectWithoutValues(4097n, 4097n * 2048n);
      await db!.collectibleItem.delete({ where: { id: created.at(-1)!.id } });
      manifest.length = 0;
      countOrPage = 0;
      expect((await search(leaf("customField", "URL"), undefined, observed)).total).toBe(4097);
      expect(manifest).toHaveLength(1);
      expect(manifest[0]!.count).toBe(4096n);
      expect(manifest[0]!.bytes).toBe(8388608n);
      expect(manifest[0]!.values).toHaveLength(4096);
      expect(countOrPage).toBe(2);
      await db!.customFieldValue.update({
        where: {
          itemId_fieldDefinitionId: {
            itemId: created[1]!.id,
            fieldDefinitionId: custom.get("URL")!,
          },
        },
        data: { urlValue: urls[1]!.slice(0, -1) + "é" },
      });
      await rejectWithoutValues(4096n, 8388609n);
      await db!.customFieldValue.updateMany({
        where: { fieldDefinitionId: custom.get("URL")! },
        data: { urlValue: originals.URL },
      });
      manifest.length = 0;
      expect((await search(leaf("customField", "URL"), undefined, observed)).total).toBe(4097);
      expect(manifest).toEqual([
        { count: 1n, bytes: BigInt(Buffer.byteLength(originals.URL)), values: [originals.URL] },
      ]);
    } finally {
      await setValue("customField", "URL", originals.URL);
      await db!.collectibleItem.deleteMany({ where: { id: { in: created.map((row) => row.id) } } });
    }
  }, 30000);
  it.each(["integrity", "manifest"] as const)(
    "keeps URL validation and matching in one snapshot across an edit after %s",
    async (stage) => {
      let changed = false;
      const observed: SearchDatabase = {
        $transaction: (work, options) =>
          db!.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  const rows = await tx.$queryRaw<T>(sql);
                  if (
                    !changed &&
                    (stage === "manifest"
                      ? sql.text.includes("search_url_manifest")
                      : sql.text.endsWith(" AS invalid"))
                  ) {
                    changed = true;
                    await setValue("customField", "URL", "https://user:pass@example.invalid/");
                  }
                  return rows;
                },
              }),
            options,
          ),
      };
      try {
        expect((await search(leaf("customField", "URL"), undefined, observed)).total).toBe(1);
        expect(changed).toBe(true);
        await expect(search(leaf("customField", "URL"))).rejects.toMatchObject({
          code: "SEARCH_INVARIANT",
        });
      } finally {
        await setValue("customField", "URL", originals.URL);
      }
    },
  );
  it("reads only exact URL definitions and selected targets, deduplicating across native/catalog scopes", async () => {
    const value = "https://example.invalid/exact";
    await setValue("customField", "URL", value);
    await db!.catalogAttributeValue.create({
      data: {
        entryId: entry,
        categoryTemplateId: category,
        variantId: variant,
        targetKey: variant,
        definitionId: catalog.get("URL")!,
        value,
      },
    });
    const manifests: Array<{ count: bigint; bytes: bigint; values: string[] | null }> = [];
    const observed: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (sql.text.includes("search_url_manifest"))
                  manifests.push(...(rows as typeof manifests));
                return rows;
              },
            }),
          options,
        ),
    };
    const selected = leaf("catalogAttribute", "URL", "present", "SELECTED_VARIANT");
    try {
      expect(
        (
          await search(
            {
              kind: "or",
              children: [leaf("customField", "URL"), selected, structuredClone(selected)],
            },
            undefined,
            observed,
          )
        ).total,
      ).toBe(1);
      expect(manifests).toEqual([
        { count: 1n, bytes: BigInt(Buffer.byteLength(value)), values: [value] },
      ]);
      await db!.catalogAttributeValue.update({
        where: {
          entryId_targetKey_definitionId: {
            entryId: entry,
            targetKey: variant,
            definitionId: catalog.get("URL")!,
          },
        },
        data: { value: "https://user:pass@example.invalid/" },
      });
      expect((await search(leaf("catalogAttribute", "URL"))).total).toBe(1);
      await expect(search({ kind: "not", child: selected }, "no match")).rejects.toMatchObject({
        code: "SEARCH_INVARIANT",
      });
    } finally {
      await setValue("customField", "URL", originals.URL);
      await db!.catalogAttributeValue.deleteMany({ where: { variantId: variant } });
    }
  });
  it.each(["customField", "catalogAttribute"] as const)(
    "rejects %s URL UTF16 overflow in the boolean guard before manifest transfer",
    async (kind) => {
      const value = "https://example.invalid/" + "😀".repeat(1024);
      expect(value.length).toBeGreaterThan(2048);
      expect(() => validateFieldValue("URL", value)).toThrow();
      await setValue(kind, "URL", value);
      let manifests = 0;
      const observed: SearchDatabase = {
        $transaction: (work, options) =>
          db!.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  if (sql.text.includes("search_url_manifest")) manifests++;
                  return tx.$queryRaw<T>(sql);
                },
              }),
            options,
          ),
      };
      try {
        await expect(search(leaf(kind, "URL"), "no match", observed)).rejects.toMatchObject({
          code: "SEARCH_INVARIANT",
        });
        expect(manifests).toBe(0);
      } finally {
        await setValue(kind, "URL", originals.URL);
      }
    },
  );
});
