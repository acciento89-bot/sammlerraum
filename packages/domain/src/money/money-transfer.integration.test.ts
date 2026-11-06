import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { runSearchRead, type SearchDatabase } from "../search/search-read";
import { ownedCandidates } from "../search/search-compiler";
import { captureMoneyExport } from "./money-transfer";
import {
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
  readMoneyAssertion,
  revokeMoneyAssertion,
} from "./legacy-money-store";
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
async function fixture() {
  const actor = `synthetic-owner-${randomUUID()}`,
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
async function catalog(f: Awaited<ReturnType<typeof fixture>>, id: string, pathCount = 1) {
  const category = randomUUID(),
    entry = randomUUID(),
    variant = randomUUID(),
    definitions = Array.from({ length: pathCount }, () => randomUUID());
  const attributes = definitions.map((definitionId, i) => ({
    definitionId,
    key: `price${i}`,
    type: "MONEY",
    value: { amountMinor: 100, currency: "AFN" },
  }));
  const text = { language: "en", title: "Synthetic reference" };
  const state = {
    schemaVersion: 1,
    id: entry,
    categoryTemplateId: category,
    text,
    sources: [],
    attributes,
    variants: [{ id: variant, text, sources: [], attributes }],
    identifiers: [],
  };
  await db.categoryTemplate.create({
    data: { id: category, key: `scope_${category.replaceAll("-", "")}` },
  });
  await db.catalogAttributeDefinition.createMany({
    data: definitions.map((id, i) => ({
      id,
      categoryTemplateId: category,
      key: `price${i}`,
      type: "MONEY" as const,
      position: i,
    })),
  });
  await db.catalogEntry.create({
    data: { id: entry, categoryTemplateId: category, authored: { text, sources: [] } },
  });
  await db.catalogVariant.create({
    data: { id: variant, entryId: entry, authored: { text, sources: [] } },
  });
  await db.catalogRevision.create({ data: { entryId: entry, revision: 1, snapshot: state } });
  await db.catalogAttributeValue.createMany({
    data: attributes.flatMap((attribute) =>
      [null, variant].map((variantId) => ({
        entryId: entry,
        categoryTemplateId: category,
        targetKey: variantId ?? "entry",
        variantId,
        definitionId: attribute.definitionId,
        value: attribute.value,
      })),
    ),
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
  const subject = (
    target: "ENTRY" | "SELECTED_VARIANT",
    definitionId = definitions[0]!,
  ): MoneySubject => ({
    family: "CATALOG",
    entryId: entry,
    revision: 1,
    definitionId,
    target: target === "ENTRY" ? { kind: "ENTRY" } : { kind: "VARIANT", variantId: variant },
  });
  return { category, definition: definitions[0]!, definitions, entry, variant, subject };
}
const rawOptions = { measure: "PURCHASE" as const, mode: "RAW" as const };
const completeOptions = {
  measure: "PURCHASE" as const,
  mode: "INTERPRETED" as const,
  completeness: "REQUIRE_COMPLETE" as const,
};
const listOptions = { ...completeOptions, completeness: "INCLUDE_UNRESOLVED" as const };
function selection(f: Awaited<ReturnType<typeof fixture>>) {
  return { scope: f.scope, selectors: [{ family: "PURCHASE" as const }] };
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
describe.runIf(enabled)("bounded same-snapshot money transfer", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("reauthorizes owner, live parent and item even with a broad supplied predicate", async () => {
    const f = await fixture(),
      other = await fixture();
    const own = await item(f, 0, 2),
      foreign = await item(other, 900);
    const removed = await item(f, 50);
    await db.$queryRaw`UPDATE "CollectibleItem" SET "deletedAt"=now() WHERE id=${removed}::uuid RETURNING id`;
    const result = await runSearchRead(db, (tx) =>
      captureMoneyExport(
        tx,
        {
          scope: { ownerId: f.actor, predicate: Prisma.sql`TRUE` },
          selectors: [{ family: "PURCHASE" }],
        },
        rawOptions,
      ),
    );
    expect(result.rows.map((r) => r.itemId)).toEqual([own]);
    expect(JSON.stringify(result)).not.toContain(foreign);
    expect(result.rows[0]).toMatchObject({
      raw: { amountMinor: "0", currency: "AFN" },
      quantity: "2",
      interpretation: { kind: "UNKNOWN" },
    });
    await db.$queryRaw`UPDATE "Collection" SET "deletedAt"=now() WHERE id=${f.collection}::uuid RETURNING id`;
    expect(
      (await runSearchRead(db, (tx) => captureMoneyExport(tx, selection(f), rawOptions))).rows,
    ).toEqual([]);
  });
  it("rejects unknown outer facts before a narrower matched interpreted export", async () => {
    const f = await fixture();
    const known = await item(f, 100, 3);
    await classify(f, known);
    await item(f, 200);
    const selected = { ...selection(f), matchedPredicate: Prisma.sql`i.id=${known}::uuid` };
    await expect(
      runSearchRead(db, (tx) => captureMoneyExport(tx, selected, completeOptions)),
    ).rejects.toMatchObject({ code: "MONEY_EXPORT_INCOMPLETE" });
    const list = await runSearchRead(db, (tx) => captureMoneyExport(tx, selected, listOptions));
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]?.interpretation).not.toHaveProperty("decimal");
    expect(list.totals).toBeNull();
  });
  it("pins exact quantity totals, tokens and meaning across later quantity changes and revocation", async () => {
    const f = await fixture(),
      id = await item(f, 100, 2);
    await classify(f, id);
    const first = await runSearchRead(db, (tx) =>
        captureMoneyExport(tx, selection(f), completeOptions),
      ),
      digest = hash(first);
    expect(first.totals).toEqual([
      { currency: "AFN", unitKey: "iso4217-2026-09-17:AFN", exponent: 2, totalMinor: "200" },
    ]);
    expect(first.rows[0]).toMatchObject({
      quantity: "2",
      interpretation: { kind: "INTERPRETED", decimal: "1.00" },
    });
    expect(first.rows[0]?.fact?.originId).toBeTruthy();
    expect(Object.isFrozen(first.rows[0])).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(
      /Synthetic receipt|synthetic-test-record|OWNER_ATTESTATION|evidenceCategory|factToken/,
    );
    await db.$queryRaw`UPDATE "CollectibleItem" SET quantity=3 WHERE id=${id}::uuid RETURNING id`;
    const second = await runSearchRead(db, (tx) =>
      captureMoneyExport(tx, selection(f), completeOptions),
    );
    expect(second.totals?.[0]?.totalMinor).toBe("300");
    const subject: MoneySubject = { family: "PURCHASE", itemId: id };
    await runSearchRead(db, async (tx) => {
      const current = await readMoneyFact(tx, subject, { userId: f.actor });
      if (current.interpretation.kind !== "INTERPRETED") throw Error("fixture");
      const assertionId = current.interpretation.assertionId;
      const assertion = await readMoneyAssertion(tx, subject, { userId: f.actor }, assertionId);
      return revokeMoneyAssertion(
        tx,
        subject,
        { assertionId, ...assertion, reason: "Synthetic revoke" },
        { userId: f.actor },
      );
    });
    await expect(
      runSearchRead(db, (tx) => captureMoneyExport(tx, selection(f), completeOptions)),
    ).rejects.toMatchObject({ code: "MONEY_EXPORT_INCOMPLETE" });
    const third = await runSearchRead(db, (tx) => captureMoneyExport(tx, selection(f), rawOptions));
    expect(third.rows[0]?.interpretation.kind).toBe("UNKNOWN");
    expect(third.rows[0]?.fact?.revocationId).toBeTruthy();
    expect(hash(first)).toBe(digest);
  });
  it("counts before metadata/facts: 1000 owned rows succeed, 1001 closes the export", async () => {
    const f = await fixture();
    await db.collectibleItem.createMany({
      data: Array.from({ length: 1000 }, () => ({
        id: randomUUID(),
        ownerId: f.actor,
        collectionId: f.collection,
        title: "Synthetic bounded row",
        quantity: 1,
      })),
    });
    const result = await runSearchRead(db, (tx) =>
      captureMoneyExport(tx, selection(f), rawOptions),
    );
    expect(result.rows).toHaveLength(1000);
    expect(result.coverage.missingPaths).toBe(1000);
    await item(f, null);
    let calls = 0;
    await expect(
      runSearchRead(db, (tx) =>
        captureMoneyExport(
          {
            ...tx,
            $queryRaw: async <T>(query: Prisma.Sql) => {
              calls++;
              return tx.$queryRaw<T>(query);
            },
          },
          selection(f),
          rawOptions,
        ),
      ),
    ).rejects.toMatchObject({ code: "MONEY_EXPORT_LIMIT_EXCEEDED" });
    expect(calls).toBe(1);
  });
  it("validates empty custom references and preserves all custom paths without evidence leakage", async () => {
    const f = await fixture(),
      foreign = await fixture(),
      foreignId = await item(foreign, 100),
      foreignField = await custom(foreign, foreignId);
    await expect(
      runSearchRead(db, (tx) =>
        captureMoneyExport(
          tx,
          {
            scope: f.scope,
            selectors: [
              {
                family: "CUSTOM",
                collectionId: foreign.collection,
                definitionId: foreignField.definition,
              },
            ],
          },
          { measure: "CUSTOM", mode: "RAW" },
        ),
      ),
    ).rejects.toMatchObject({ code: "MONEY_TRANSFER_INVALID" });
    const id = await item(f, 50),
      a = await custom(f, id, 0),
      b = await custom(f, id, 100);
    await classifySubject(f, a.subject);
    await classifySubject(f, b.subject);
    const result = await runSearchRead(db, (tx) =>
      captureMoneyExport(
        tx,
        {
          scope: f.scope,
          selectors: [a, b].map((v) => ({
            family: "CUSTOM" as const,
            collectionId: f.collection,
            definitionId: v.definition,
          })),
        },
        { measure: "CUSTOM", mode: "INTERPRETED", completeness: "REQUIRE_COMPLETE" },
      ),
    );
    expect(result.coverage).toMatchObject({ selectedItems: 1, selectedPaths: 2, eligiblePaths: 2 });
    expect(result.rows.map((r) => r.raw?.amountMinor)).toEqual(["0", "100"]);
    expect(result.totals).toBeNull();
  });
  it("captures many current entry and selected variant paths under one catalogue item", async () => {
    const f = await fixture(),
      id = await item(f, null),
      c = await catalog(f, id, 12);
    const axes = c.definitions.flatMap((definition) =>
      (["ENTRY", "SELECTED_VARIANT"] as const).map((target) => ({ definition, target })),
    );
    for (const axis of axes) await classifySubject(f, c.subject(axis.target, axis.definition));
    const result = await runSearchRead(db, (tx) =>
      captureMoneyExport(
        tx,
        {
          scope: f.scope,
          selectors: axes.map((axis) => ({
            family: "CATALOG" as const,
            categoryTemplateId: c.category,
            definitionId: axis.definition,
            target: axis.target,
          })),
        },
        { measure: "CATALOG", mode: "INTERPRETED", completeness: "REQUIRE_COMPLETE" },
      ),
    );
    expect(result.coverage).toMatchObject({
      selectedItems: 1,
      selectedPaths: 24,
      eligiblePaths: 24,
    });
    expect(result.rows).toHaveLength(24);
    expect(new Set(result.rows.map((r) => r.requestedPath)).size).toBe(24);
    expect(
      result.rows.map((r) => (r.subject?.family === "CATALOG" ? r.subject.target.kind : null)),
    ).toEqual(axes.map((a) => (a.target === "ENTRY" ? "ENTRY" : "VARIANT")));
    expect(result.totals).toBeNull();
  });
  it("preserves structural historical codes without assigning scale, and rejects missing/ineligible complete facts", async () => {
    const f = await fixture(),
      id = await item(f, 0, 2);
    await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseCurrency"='ZZZ' WHERE id=${id}::uuid RETURNING id`;
    const raw = await runSearchRead(db, (tx) => captureMoneyExport(tx, selection(f), rawOptions));
    expect(raw.rows[0]).toMatchObject({
      raw: { amountMinor: "0", currency: "ZZZ" },
      interpretation: { kind: "UNKNOWN" },
    });
    expect(raw.rows[0]?.interpretation).not.toHaveProperty("decimal");
    expect(raw.rows[0]?.interpretation).not.toHaveProperty("exponent");
    await classifySubject(f, { family: "PURCHASE", itemId: id }, 0, true);
    await expect(
      runSearchRead(db, (tx) => captureMoneyExport(tx, selection(f), completeOptions)),
    ).rejects.toMatchObject({ code: "MONEY_EXPORT_INCOMPLETE" });
    const missing = await fixture();
    await item(missing, null);
    await expect(
      runSearchRead(db, (tx) => captureMoneyExport(tx, selection(missing), completeOptions)),
    ).rejects.toMatchObject({ code: "MONEY_EXPORT_INCOMPLETE" });
    const empty = await fixture();
    expect(
      (await runSearchRead(db, (tx) => captureMoneyExport(tx, selection(empty), completeOptions)))
        .totals,
    ).toEqual([]);
  });
  it("uses evidenced historical scale rather than today's authoring exponent", async () => {
    const f = await fixture(),
      id = await item(f, 100, 2);
    await classify(f, id, 0);
    const result = await runSearchRead(db, (tx) =>
      captureMoneyExport(tx, selection(f), completeOptions),
    );
    expect(result.rows[0]?.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 0,
      decimal: "100",
    });
    expect(result.totals?.[0]).toMatchObject({ exponent: 0, totalMinor: "200" });
  });
  it("honors the actual statement timeout without producing a snapshot", async () => {
    const f = await fixture();
    let result: unknown;
    await expect(
      runSearchRead(db, async (tx) => {
        let first = true;
        result = await captureMoneyExport(
          {
            ...tx,
            $queryRaw: async <T>(query: Prisma.Sql) => {
              if (first) {
                first = false;
                await tx.$queryRaw(Prisma.sql`SELECT pg_sleep(2.1)`);
              }
              return tx.$queryRaw<T>(query);
            },
          },
          selection(f),
          rawOptions,
        );
        return result;
      }),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    expect(result).toBeUndefined();
  });
});
