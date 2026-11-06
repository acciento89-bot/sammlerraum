import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { runSearchRead, type SearchDatabase } from "./search-read";
import { parseLegacyMoneyAuthoring } from "../money/legacy-money-policy";
import { createItemSearchService } from "./item-search-service";
import { createSmartCollectionService } from "./smart-collection-service";
import { createDashboardService } from "../dashboard/dashboard-service";
import { ownedCandidates } from "./search-compiler";
import { prepareLegacyMoneyPredicates } from "./legacy-money-query";
import { readPurchaseCost } from "../money/purchase-cost";
import {
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
  readMoneyAssertion,
  revokeMoneyAssertion,
  eraseMoneyEvidenceForActor,
} from "../money/legacy-money-store";
import type { MoneySubject } from "@sammlerraum/contracts/legacy-money";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const range = {
  op: "range",
  unit: { currency: "AFN", minorUnitExponent: 2, unitKey: "iso4217-2026-09-17:AFN" },
  minMinor: "100",
  maxMinor: "100",
};
const filter = { version: 1, root: { kind: "purchaseMoney", test: range } };
async function fixture() {
  const actor = randomUUID(),
    collection = randomUUID();
  await db.$queryRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${actor},'Synthetic scope',${`${actor}@example.invalid`},false,now(),now()) RETURNING id`;
  await db.$queryRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${actor},'Whole scope',now()) RETURNING id`;
  return {
    actor,
    collection,
    scope: { ownerId: actor, predicate: ownedCandidates(actor, "ACTIVE") },
  };
}
async function item(f: Awaited<ReturnType<typeof fixture>>, raw: number | null, quantity = 1) {
  const id = randomUUID();
  await db.$queryRaw`INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,quantity,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES (${id}::uuid,${f.collection}::uuid,${f.actor},'Candidate',${quantity},${raw},${raw === null ? null : "AFN"},now()) RETURNING id`;
  return id;
}
async function classifySubject(
  f: Awaited<ReturnType<typeof fixture>>,
  subject: MoneySubject,
  exponent = 2,
  unsupported = false,
) {
  return runSearchRead(db, async (tx) => {
    const current = await readMoneyFact(tx, subject, { userId: f.actor });
    const fact = await requireMoneyToken(tx, subject, { userId: f.actor }, current.factToken);
    return appendMoneyAssertion(tx, fact, {
      kind: "CLASSIFY",
      input: {
        expectedFactToken: current.factToken,
        exponent,
        unit: unsupported
          ? { kind: "UNSUPPORTED", label: "Historical unit" }
          : { kind: "SUPPORTED", unitKey: `iso4217-2026-09-17:${current.raw?.currency}` },
        evidence:
          subject.family === "CATALOG"
            ? {
                category: "OPERATOR_VERIFIED_RECORD",
                reason: "Synthetic receipt",
                reference: "synthetic-test-record",
              }
            : { category: "OWNER_ATTESTATION", reason: "Synthetic receipt" },
      },
    });
  });
}
async function classify(f: Awaited<ReturnType<typeof fixture>>, id: string, exponent = 2) {
  return classifySubject(f, { family: "PURCHASE", itemId: id }, exponent);
}
async function custom(f: Awaited<ReturnType<typeof fixture>>, id: string, rawAmount = 100) {
  const definition = randomUUID();
  await db.$queryRaw`INSERT INTO "CustomFieldDefinition" (id,"collectionId",name,"normalizedName",type,"updatedAt") VALUES (${definition}::uuid,${f.collection}::uuid,'Price',${definition},'MONEY',now()) RETURNING id`;
  await db.$queryRaw`INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES (${id}::uuid,${definition}::uuid,${f.collection}::uuid,'MONEY',${rawAmount},'AFN',now()) RETURNING "itemId"`;
  const leaf = {
    kind: "customField",
    selector: { source: "CUSTOM", collectionId: f.collection, definitionId: definition },
    predicate: { valueType: "MONEY", test: structuredClone(range) },
  };
  return {
    definition,
    leaf,
    subject: { family: "CUSTOM" as const, itemId: id, fieldDefinitionId: definition },
  };
}
async function catalog(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  const category = randomUUID(),
    definition = randomUUID(),
    entry = randomUUID(),
    variant = randomUUID();
  const attribute = {
    definitionId: definition,
    key: "price",
    type: "MONEY",
    value: { amountMinor: 100, currency: "AFN" },
  };
  const text = { language: "en", title: "Synthetic reference" };
  const state = {
    schemaVersion: 1,
    id: entry,
    categoryTemplateId: category,
    text,
    sources: [],
    attributes: [attribute],
    variants: [{ id: variant, text, sources: [], attributes: [attribute] }],
    identifiers: [],
  };
  await db.categoryTemplate.create({
    data: { id: category, key: `scope_${category.replaceAll("-", "")}` },
  });
  await db.catalogAttributeDefinition.create({
    data: {
      id: definition,
      categoryTemplateId: category,
      key: "price",
      type: "MONEY",
      position: 0,
    },
  });
  await db.catalogEntry.create({
    data: { id: entry, categoryTemplateId: category, authored: { text, sources: [] } },
  });
  await db.catalogVariant.create({
    data: { id: variant, entryId: entry, authored: { text, sources: [] } },
  });
  await db.catalogRevision.create({ data: { entryId: entry, revision: 1, snapshot: state } });
  await db.catalogAttributeValue.createMany({
    data: [
      {
        entryId: entry,
        categoryTemplateId: category,
        targetKey: "entry",
        variantId: null,
        definitionId: definition,
        value: attribute.value,
      },
      {
        entryId: entry,
        categoryTemplateId: category,
        targetKey: variant,
        variantId: variant,
        definitionId: definition,
        value: attribute.value,
      },
    ],
  });
  await db.applicationRoleGrant.create({
    data: {
      userId: f.actor,
      role: "MODERATOR",
      grantedBy: "synthetic-fixture",
      reason: "Synthetic canonical evidence",
    },
  });
  await db.$queryRaw`UPDATE "CollectibleItem" SET "categoryTemplateId"=${category}::uuid,"catalogEntryId"=${entry}::uuid,"catalogVariantId"=${variant}::uuid WHERE id=${id}::uuid RETURNING id`;
  const leaf = (target: "ENTRY" | "SELECTED_VARIANT") => ({
    kind: "catalogAttribute",
    selector: { source: "CATALOG", categoryTemplateId: category, definitionId: definition, target },
    predicate: { valueType: "MONEY", test: structuredClone(range) },
  });
  const subject = (target: "ENTRY" | "SELECTED_VARIANT"): MoneySubject => ({
    family: "CATALOG",
    entryId: entry,
    revision: 1,
    definitionId: definition,
    target: target === "ENTRY" ? { kind: "ENTRY" } : { kind: "VARIANT", variantId: variant },
  });
  return { category, definition, entry, variant, state, leaf, subject };
}
describe.runIf(enabled)("complete owned legacy money scope", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("rejects a known-price query while any outer candidate remains unknown", async () => {
    const f = await fixture();
    await classify(f, await item(f, 100));
    await item(f, 500);
    await expect(
      runSearchRead(db, (tx) => prepareLegacyMoneyPredicates(tx, f.scope, filter)),
    ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
  });
  it("excludes other owners and lifecycle states from the independent gate", async () => {
    const f = await fixture();
    await classify(f, await item(f, 100));
    const archived = await item(f, 200);
    await db.$queryRaw`UPDATE "CollectibleItem" SET "archivedAt"=now() WHERE id=${archived}::uuid RETURNING id`;
    await item(await fixture(), 100);
    const plan = await runSearchRead(db, (tx) => prepareLegacyMoneyPredicates(tx, f.scope, filter));
    expect(plan.coverage[0]?.coverage).toMatchObject({
      selectedItems: 1,
      presentPaths: 1,
      eligiblePaths: 1,
      unknownPaths: 0,
    });
  });
  it("keeps missing prices and known zero distinct in quantity-weighted costs", async () => {
    const f = await fixture();
    await classify(f, await item(f, 0, 2));
    await item(f, null, 3);
    const result = await runSearchRead(db, (tx) => readPurchaseCost(tx, f.scope));
    expect(result).toMatchObject({
      state: "PARTIAL",
      coverage: { selectedItems: 2, selectedUnits: "5", presentUnits: "2", missingUnits: "3" },
      groups: [{ currency: "AFN", exponent: 2, totalMinor: "0" }],
    });
  });
  it("does not let a matched selection hide unresolved outer purchase evidence", async () => {
    const f = await fixture(),
      id = await item(f, 100);
    await classify(f, id);
    await item(f, 500);
    const result = await runSearchRead(db, (tx) =>
      readPurchaseCost(tx, f.scope, Prisma.sql`i.id=${id}::uuid`),
    );
    expect(result).toMatchObject({
      state: "UNAVAILABLE",
      coverage: { unknownPaths: 1 },
      selectionCoverage: null,
      groups: null,
    });
  });
  it("sums actual maximum raw values times intmax quantities beyond int64", async () => {
    const f = await fixture();
    await classify(f, await item(f, 9007199254740991, 2147483647), 0);
    await classify(f, await item(f, 9007199254740991, 2147483647), 0);
    const result = await runSearchRead(db, (tx) => readPurchaseCost(tx, f.scope));
    expect(result).toMatchObject({
      state: "COMPLETE",
      groups: [{ totalMinor: (9007199254740991n * 2147483647n * 2n).toString() }],
    });
  });
  it("real search checks unknown candidates outside matching text before count/page", async () => {
    const f = await fixture(),
      known = await item(f, 100);
    await classify(f, known);
    await item(f, 500);
    await db.$queryRaw`UPDATE "CollectibleItem" SET title='Needle' WHERE id=${known}::uuid RETURNING id`;
    await expect(
      createItemSearchService(db, { canonicalMoneyEnabled: true }).searchItems(
        { userId: f.actor },
        { filter, text: "Needle", limit: 1 },
      ),
    ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
  });
  it("real search returns both exact cross-exponent matches and the NOT complement of missing prices", async () => {
    const f = await fixture(),
      one = await item(f, 1),
      hundred = await item(f, 100),
      missing = await item(f, null);
    await classify(f, one, 0);
    await classify(f, hundred, 2);
    const service = createItemSearchService(db, { canonicalMoneyEnabled: true });
    const page = await service.searchItems({ userId: f.actor }, { filter });
    expect(new Set(page.items.map((i) => i.id))).toEqual(new Set([one, hundred]));
    const complement = await service.searchItems(
      { userId: f.actor },
      { filter: { version: 1, root: { kind: "not", child: filter.root } } },
    );
    expect(complement.items.map((i) => i.id)).toEqual([missing]);
  });
  it("repeats complete coverage on cursor pages after a same-pair legacy write", async () => {
    const f = await fixture(),
      first = await item(f, 100),
      second = await item(f, 100);
    await classify(f, first);
    await classify(f, second);
    const service = createItemSearchService(db, { canonicalMoneyEnabled: true });
    const page = await service.searchItems({ userId: f.actor }, { filter, limit: 1 });
    expect(page.nextCursor).not.toBeNull();
    await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseAmountMinor"="purchaseAmountMinor" WHERE id=${first}::uuid RETURNING id`;
    await expect(
      service.searchItems({ userId: f.actor }, { filter, limit: 1, cursor: page.nextCursor }),
    ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
  });
  it("real saved search revalidates monetary evidence rather than retaining an executable permit", async () => {
    const f = await fixture(),
      id = await item(f, 100);
    await classify(f, id);
    const service = createSmartCollectionService(db, { canonicalMoneyEnabled: true });
    const saved = await service.createSmartCollection(
      { userId: f.actor },
      { name: "Exact prices", definition: { version: 1, text: "", filter, lifecycle: "ACTIVE" } },
    );
    await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseAmountMinor"="purchaseAmountMinor" WHERE id=${id}::uuid RETURNING id`;
    await expect(
      service.resolveSmartCollectionItems({ userId: f.actor }, saved.id, {}),
    ).rejects.toMatchObject({ code: "SMART_COLLECTION_UNRESOLVABLE" });
  });
  it("real dashboard labels quantity-weighted partial costs and separate evidenced scales", async () => {
    const f = await fixture();
    await classify(f, await item(f, 1, 2), 0);
    await classify(f, await item(f, 100, 3), 2);
    await item(f, null, 4);
    const data = await createDashboardService(db, { canonicalMoneyEnabled: true }).getDashboard(
      { userId: f.actor },
      {},
    );
    expect(data.purchaseTotals).toMatchObject({
      state: "PARTIAL",
      coverage: { selectedItems: 3, selectedUnits: "9", missingUnits: "4" },
      selectionCoverage: { selectedItems: 3 },
      groups: [
        { currency: "AFN", exponent: 0, totalMinor: "2" },
        { currency: "AFN", exponent: 2, totalMinor: "300" },
      ],
    });
  });

  it("gates every custom selector before text and includes missing candidates outside its collection", async () => {
    const f = await fixture(),
      known = await item(f, null),
      unknown = await item(f, null);
    const field = await custom(f, known);
    await classifySubject(f, field.subject);
    await db.$queryRaw`INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES (${unknown}::uuid,${field.definition}::uuid,${f.collection}::uuid,'MONEY',500,'AFN',now()) RETURNING "itemId"`;
    const service = createItemSearchService(db, { canonicalMoneyEnabled: true });
    const input = { filter: { version: 1, root: field.leaf } };
    await expect(service.searchItems({ userId: f.actor }, input)).rejects.toMatchObject({
      code: "FILTER_UNAVAILABLE",
    });
    await classifySubject(f, { ...field.subject, itemId: unknown });
    const other = randomUUID();
    await db.collection.create({ data: { id: other, ownerId: f.actor, name: "Other collection" } });
    const missing = await item({ ...f, collection: other }, null);
    const result = await service.searchItems({ userId: f.actor }, input);
    expect(result.items.map((row) => row.id)).toEqual([known]);
    const plan = await runSearchRead(db, (tx) =>
      prepareLegacyMoneyPredicates(tx, f.scope, input.filter),
    );
    expect(plan.coverage[0]?.coverage).toMatchObject({
      selectedItems: 3,
      missingPaths: 1,
      presentPaths: 2,
      eligiblePaths: 2,
    });
    const complement = await service.searchItems(
      { userId: f.actor },
      { filter: { version: 1, root: { kind: "not", child: field.leaf } } },
    );
    expect(new Set(complement.items.map((row) => row.id))).toEqual(new Set([unknown, missing]));
  });
  it("validates foreign custom selectors on an empty owned scope without exposing their counts", async () => {
    const f = await fixture(),
      foreign = await fixture(),
      field = await custom(foreign, await item(foreign, null));
    await expect(
      createItemSearchService(db, { canonicalMoneyEnabled: true }).searchItems(
        { userId: f.actor },
        { filter: { version: 1, root: field.leaf } },
      ),
    ).rejects.toMatchObject({ code: "FILTER_REFERENCE_INVALID" });
  });
  it("requires both canonical entry and selected-variant coverage under OR/NOT", async () => {
    const f = await fixture(),
      id = await item(f, null),
      reference = await catalog(f, id);
    await classifySubject(f, reference.subject("ENTRY"));
    const service = createItemSearchService(db, { canonicalMoneyEnabled: true });
    const input = {
      filter: {
        version: 1,
        root: {
          kind: "or",
          children: [
            reference.leaf("ENTRY"),
            { kind: "not", child: reference.leaf("SELECTED_VARIANT") },
          ],
        },
      },
    };
    await expect(service.searchItems({ userId: f.actor }, input)).rejects.toMatchObject({
      code: "FILTER_UNAVAILABLE",
    });
    await classifySubject(f, reference.subject("SELECTED_VARIANT"));
    const result = await service.searchItems({ userId: f.actor }, input);
    expect(result.items.map((row) => row.id)).toEqual([id]);
  });
  it("does not fall back to historical variant evidence when that path is removed from the current revision", async () => {
    const f = await fixture(),
      id = await item(f, null),
      reference = await catalog(f, id);
    await classifySubject(f, reference.subject("SELECTED_VARIANT"));
    await db.catalogRevision.create({
      data: {
        entryId: reference.entry,
        revision: 2,
        snapshot: { ...reference.state, variants: [] },
      },
    });
    await db.catalogEntry.update({ where: { id: reference.entry }, data: { revision: 2 } });
    const result = await createItemSearchService(db, { canonicalMoneyEnabled: true }).searchItems(
      { userId: f.actor },
      { filter: { version: 1, root: reference.leaf("SELECTED_VARIANT") } },
    );
    expect(result).toMatchObject({ items: [], total: 0, nextCursor: null });
  });
  it("revalidates withdrawn canonical assertions through the shared origin policy", async () => {
    const f = await fixture(),
      id = await item(f, null),
      reference = await catalog(f, id),
      subject = reference.subject("ENTRY");
    const view = await classifySubject(f, subject);
    if (view.interpretation.kind !== "INTERPRETED") throw Error("Expected interpreted fixture");
    const assertionId = view.interpretation.assertionId;
    await runSearchRead(db, async (tx) => {
      const origin = await readMoneyAssertion(tx, subject, { userId: f.actor }, assertionId);
      await revokeMoneyAssertion(
        tx,
        subject,
        {
          assertionId,
          expectedAssertionToken: origin.expectedAssertionToken,
          reason: "Corrected synthetic evidence",
        },
        { userId: f.actor },
      );
    });
    await expect(
      createItemSearchService(db, { canonicalMoneyEnabled: true }).searchItems(
        { userId: f.actor },
        { filter: { version: 1, root: reference.leaf("ENTRY") } },
      ),
    ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
  });
  it("keeps amounts, quantities and provenance coherent across concurrent raw replacement", async () => {
    const f = await fixture(),
      id = await item(f, 100, 2);
    await classify(f, id);
    const before = await runSearchRead(db, async (tx) => {
      await prepareLegacyMoneyPredicates(tx, f.scope, filter);
      await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseAmountMinor"=200,quantity=3 WHERE id=${id}::uuid RETURNING id`;
      return readPurchaseCost(tx, f.scope);
    });
    expect(before).toMatchObject({
      state: "COMPLETE",
      coverage: { selectedUnits: "2" },
      groups: [{ totalMinor: "200" }],
    });
    const after = await runSearchRead(db, (tx) => readPurchaseCost(tx, f.scope));
    expect(after).toMatchObject({
      state: "UNAVAILABLE",
      coverage: { selectedUnits: "3", unknownPaths: 1 },
      groups: null,
    });
  });
  it("keeps eligible other currencies out of the positive range and never converts cost groups", async () => {
    const f = await fixture(),
      afn = await item(f, 100),
      eur = await item(f, 100);
    await classify(f, afn);
    await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseCurrency"='EUR' WHERE id=${eur}::uuid RETURNING id`;
    await classify(f, eur);
    const result = await createItemSearchService(db, { canonicalMoneyEnabled: true }).searchItems(
      { userId: f.actor },
      { filter },
    );
    expect(result.items.map((row) => row.id)).toEqual([afn]);
    const costs = await runSearchRead(db, (tx) => readPurchaseCost(tx, f.scope));
    expect(costs).toMatchObject({
      state: "COMPLETE",
      groups: [
        { currency: "AFN", totalMinor: "100" },
        { currency: "EUR", totalMinor: "100" },
      ],
    });
  });
  it("invalidates shared canonical classifications after authorized evidence erasure", async () => {
    const f = await fixture(),
      id = await item(f, null),
      reference = await catalog(f, id);
    await classifySubject(f, reference.subject("ENTRY"));
    const owner = await fixture(),
      linked = await item(owner, null);
    await db.$queryRaw`UPDATE "CollectibleItem" SET "categoryTemplateId"=${reference.category}::uuid,"catalogEntryId"=${reference.entry}::uuid WHERE id=${linked}::uuid RETURNING id`;
    const service = createItemSearchService(db, { canonicalMoneyEnabled: true }),
      input = { filter: { version: 1, root: reference.leaf("ENTRY") } };
    expect((await service.searchItems({ userId: owner.actor }, input)).total).toBe(1);
    await runSearchRead(db, (tx) => eraseMoneyEvidenceForActor(tx, { userId: f.actor }, f.actor));
    await expect(service.searchItems({ userId: owner.actor }, input)).rejects.toMatchObject({
      code: "FILTER_UNAVAILABLE",
    });
  });
  it("keeps complete-scope reads at a fixed statement count above one thousand prices", async () => {
    const tiny = await fixture(),
      small = await item(tiny, 100, 2);
    await classify(tiny, small);
    const f = await fixture(),
      count = 1250;
    await db.$queryRaw`INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,quantity,"purchaseAmountMinor","purchaseCurrency","updatedAt") SELECT gen_random_uuid(),${f.collection}::uuid,${f.actor},'Large exact scope',2,100,'AFN',now() FROM generate_series(1,${count}) RETURNING id`;
    const receipt = parseLegacyMoneyAuthoring({
      kind: "DECIMAL",
      profileId: "legacy-money-iso-2026-09-17-v1",
      currency: "AFN",
      decimal: "1",
    });
    await db.$queryRaw`INSERT INTO "PurchaseMoneyInterpretationEvent" (id,"itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId",receipt,"actorId") SELECT gen_random_uuid(),i.id,i."purchaseMoneyGeneration",2,'AUTHOR',100,'AFN',2,${receipt.unitKey},${receipt.profileId},${JSON.stringify(receipt)}::jsonb,${f.actor} FROM "CollectibleItem" i WHERE i."ownerId"=${f.actor} RETURNING id`;
    async function measure(owner: string) {
      let calls = 0;
      const measured: SearchDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  calls++;
                  return tx.$queryRaw<T>(sql);
                },
              }),
            options,
          ),
      };
      const started = performance.now();
      const result = await createItemSearchService(measured, {
        canonicalMoneyEnabled: true,
      }).searchItems({ userId: owner }, { filter, limit: 1 });
      return { calls, elapsedMs: Math.round(performance.now() - started), total: result.total };
    }
    const smallRead = await measure(tiny.actor),
      largeRead = await measure(f.actor);
    expect(smallRead.total).toBe(1);
    expect(largeRead.total).toBe(count);
    expect(largeRead.calls).toBe(smallRead.calls);
    const costs = await runSearchRead(db, (tx) => readPurchaseCost(tx, f.scope));
    expect(costs).toMatchObject({
      state: "COMPLETE",
      coverage: { selectedItems: count, selectedUnits: String(count * 2) },
      groups: [{ totalMinor: String(count * 2 * 100) }],
    });
    console.info("M6_COMPLETE_SCOPE_MEASUREMENT", JSON.stringify({ smallRead, largeRead }));
  }, 30000);

  it("does not narrow the outer gate using an AND collection predicate", async () => {
    const f = await fixture(),
      known = await item(f, 100);
    await classify(f, known);
    const other = randomUUID();
    await db.collection.create({ data: { id: other, ownerId: f.actor, name: "Outside AST" } });
    await item({ ...f, collection: other }, 500);
    const scoped = {
      version: 1,
      root: {
        kind: "and",
        children: [
          structuredClone(filter.root),
          { kind: "collection", test: { op: "eq", value: f.collection } },
        ],
      },
    };
    await expect(
      createItemSearchService(db, { canonicalMoneyEnabled: true }).searchItems(
        { userId: f.actor },
        { filter: scoped, limit: 1 },
      ),
    ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
  });
  it("validates units even on empty scopes and binds cursors to the monetary policy", async () => {
    const empty = await fixture(),
      service = createItemSearchService(db, { canonicalMoneyEnabled: true });
    expect(await service.searchItems({ userId: empty.actor }, { filter })).toMatchObject({
      items: [],
      total: 0,
      nextCursor: null,
    });
    const invalid = structuredClone(filter);
    invalid.root.test.unit.currency = "ZZZ";
    invalid.root.test.unit.unitKey = "historical:ZZZ";
    await expect(
      service.searchItems({ userId: empty.actor }, { filter: invalid }),
    ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
    const f = await fixture();
    await item(f, 100);
    await item(f, 100);
    const presence = { version: 1, root: { kind: "purchaseMoney", test: { op: "present" } } };
    const page = await createItemSearchService(db).searchItems(
      { userId: f.actor },
      { filter: presence, limit: 1 },
    );
    expect(page.nextCursor).not.toBeNull();
    await expect(
      service.searchItems(
        { userId: f.actor },
        { filter: presence, limit: 1, cursor: page.nextCursor },
      ),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
  });
  it("refuses interpreted but unsupported units rather than comparing only their currency code", async () => {
    const f = await fixture(),
      id = await item(f, 100);
    await classifySubject(f, { family: "PURCHASE", itemId: id }, 2, true);
    await expect(
      createItemSearchService(db, { canonicalMoneyEnabled: true }).searchItems(
        { userId: f.actor },
        { filter },
      ),
    ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
    expect(await runSearchRead(db, (tx) => readPurchaseCost(tx, f.scope))).toMatchObject({
      state: "UNAVAILABLE",
      coverage: { unknownPaths: 0, ineligiblePaths: 1 },
      selectionCoverage: null,
      groups: null,
    });
  });
});
