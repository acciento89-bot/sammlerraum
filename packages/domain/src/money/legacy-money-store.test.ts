import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { Prisma } from "@sammlerraum/db/search-sql";
import { runSearchTransaction } from "../search/search-read";
import { parseLegacyMoneyAuthoring } from "./legacy-money-policy";
import { decodeMoneyFactToken, encodeMoneyFactToken } from "./legacy-money-tokens";
import {
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
  copyMoneyFact,
  readMoneyAssertion,
  revokeMoneyAssertion,
  eraseMoneyEvidenceForActor,
} from "./legacy-money-store";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const legacy = {
  actor: randomUUID(),
  collection: randomUUID(),
  item: randomUUID(),
  definition: randomUUID(),
};
let db: ReturnType<typeof createTestDatabaseClient>;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(enabled)("legacy money real Prisma transaction store", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema(async (client) => {
      await client.query(
        `INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,'Legacy synthetic',$2,false,now(),now())`,
        [legacy.actor, `${legacy.actor}@example.invalid`],
      );
      await client.query(
        `INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES ($1,$2,'Legacy zero',now())`,
        [legacy.collection, legacy.actor],
      );
      await client.query(
        `INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES ($1,$2,$3,'Legacy zero',0,'ZZZ',now())`,
        [legacy.item, legacy.collection, legacy.actor],
      );
      await client.query(
        `INSERT INTO "CustomFieldDefinition" (id,"collectionId",name,"normalizedName",type,"updatedAt") VALUES ($1,$2,'Old money','old money','MONEY',now())`,
        [legacy.definition, legacy.collection],
      );
      await client.query(
        `INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES ($1,$2,$3,'MONEY',0,'ZZZ',now())`,
        [legacy.item, legacy.definition, legacy.collection],
      );
    });
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl });
    const [scope] = await db.$queryRaw<
      Array<{ schema: string }>
    >`SELECT current_schema() AS schema`;
    expect(scope!.schema).toBe(isolated.schema);
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  async function fixture() {
    const actor = randomUUID(),
      collection = randomUUID(),
      item = randomUUID();
    await db.$queryRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${actor},'Synthetic',${`${actor}@example.invalid`},false,now(),now()) RETURNING id`;
    await db.$queryRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${actor},'Money store',now()) RETURNING id`;
    await db.$queryRaw`INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES (${item}::uuid,${collection}::uuid,${actor},'Money fact',1,'AFN',now()) RETURNING id`;
    return { actor, collection, item, subject: { family: "PURCHASE" as const, itemId: item } };
  }
  it("reads actual present raw money as unknown rather than inventing absence", async () => {
    const f = await fixture();
    const [producer] = await db.$queryRaw<Array<{ operation: string; raw: string }>>(
      Prisma.sql`SELECT operation::text,"rawAmountMinor"::text AS raw FROM "PurchaseMoneyInterpretationEvent" WHERE "itemId"=${f.item}::uuid`,
    );
    expect(producer).toEqual({ operation: "RAW_WRITE", raw: "1" });
    const view = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, f.subject, { userId: f.actor }),
    );
    expect(view.raw).toEqual({ amountMinor: "1", currency: "AFN" });
    expect(view.interpretation).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
  });
  async function classifyFact(f: Awaited<ReturnType<typeof fixture>>, unsupported = false) {
    return runSearchTransaction(db, async (tx) => {
      const view = await readMoneyFact(tx, f.subject, { userId: f.actor });
      const fact = await requireMoneyToken(tx, f.subject, { userId: f.actor }, view.factToken);
      return appendMoneyAssertion(tx, fact, {
        kind: "CLASSIFY",
        input: {
          expectedFactToken: view.factToken,
          exponent: 0,
          unit: unsupported
            ? { kind: "UNSUPPORTED", label: "Historic unit" }
            : { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
          evidence: { category: "OWNER_ATTESTATION", reason: "Observed synthetic receipt" },
        },
      });
    });
  }
  async function copyFact(f: Awaited<ReturnType<typeof fixture>>) {
    const id = randomUUID(),
      target = { family: "PURCHASE" as const, itemId: id };
    const view = await runSearchTransaction(db, async (tx) => {
      const source = await readMoneyFact(tx, f.subject, { userId: f.actor });
      const sourceFact = await requireMoneyToken(
        tx,
        f.subject,
        { userId: f.actor },
        source.factToken,
      );
      await tx.$queryRaw(
        Prisma.sql`INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES (${id}::uuid,${f.collection}::uuid,${f.actor},'Copied raw',1,'AFN',now()) RETURNING id`,
      );
      const destination = await readMoneyFact(tx, target, { userId: f.actor });
      const destinationFact = await requireMoneyToken(
        tx,
        target,
        { userId: f.actor },
        destination.factToken,
      );
      return copyMoneyFact(tx, sourceFact, destinationFact, { userId: f.actor });
    });
    return { subject: target, view };
  }
  async function canonical(money: unknown, variants: unknown[] = [], version: unknown = 1) {
    const category = randomUUID(),
      entry = randomUUID(),
      definition = randomUUID();
    await db.$queryRaw`INSERT INTO "CategoryTemplate" (id,key) VALUES (${category}::uuid,${`store_${category.replaceAll("-", "")}`}) RETURNING id`;
    await db.$queryRaw`INSERT INTO "CatalogAttributeDefinition" (id,"categoryTemplateId",key,type,position) VALUES (${definition}::uuid,${category}::uuid,'price','MONEY',0) RETURNING id`;
    const snapshot = {
      schemaVersion: version,
      id: entry,
      categoryTemplateId: category,
      text: { language: "en", title: "Raw catalog" },
      attributes:
        money === null
          ? []
          : [{ definitionId: definition, key: "price", type: "MONEY", value: money }],
      variants,
      identifiers: [],
    };
    await db.$queryRaw`INSERT INTO "CatalogEntry" (id,"categoryTemplateId",authored) VALUES (${entry}::uuid,${category}::uuid,${JSON.stringify(snapshot)}::jsonb) RETURNING id`;
    await db.$queryRaw`INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) VALUES (${entry}::uuid,1,${JSON.stringify(snapshot)}::jsonb) RETURNING "entryId"`;
    return {
      family: "CATALOG" as const,
      entryId: entry,
      revision: 1,
      target: { kind: "ENTRY" as const },
      definitionId: definition,
    };
  }
  it("rejects malformed selected catalog money rather than turning it into missing", async () => {
    const f = await fixture(),
      s = await canonical({ amountMinor: "1", currency: 1 });
    await expect(
      runSearchTransaction(db, (tx) => readMoneyFact(tx, s, { userId: f.actor })),
    ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
  });
  it("rejects oversized selected variant arrays rather than reporting an absent target", async () => {
    const f = await fixture(),
      id = randomUUID(),
      s = await canonical(
        { amountMinor: 1, currency: "AFN" },
        Array.from({ length: 101 }, () => ({ id, attributes: [] })),
      );
    await expect(
      runSearchTransaction(db, (tx) =>
        readMoneyFact(
          tx,
          { ...s, target: { kind: "VARIANT", variantId: id } },
          { userId: f.actor },
        ),
      ),
    ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
  });
  it("reads real missing and valid historical catalog values without current-unit inference", async () => {
    const f = await fixture();
    const missing = await canonical(null),
      valid = await canonical({ amountMinor: 1, currency: "ZZZ" });
    expect(
      (await runSearchTransaction(db, (tx) => readMoneyFact(tx, missing, { userId: f.actor })))
        .interpretation,
    ).toEqual({ kind: "MISSING" });
    expect(
      await runSearchTransaction(db, (tx) => readMoneyFact(tx, valid, { userId: f.actor })),
    ).toMatchObject({
      raw: { amountMinor: "1", currency: "ZZZ" },
      interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
    });
  });
  it("authorizes before decoding foreign tokens and compares every actual fact field", async () => {
    const f = await fixture(),
      view = await runSearchTransaction(db, (tx) =>
        readMoneyFact(tx, f.subject, { userId: f.actor }),
      );
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, f.subject, { userId: randomUUID() }, "a"),
      ),
    ).rejects.toMatchObject({ code: "MONEY_NOT_FOUND" });
    await expect(
      runSearchTransaction(db, (tx) => requireMoneyToken(tx, f.subject, { userId: f.actor }, "a")),
    ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
    const content = decodeMoneyFactToken(view.factToken);
    const changed = encodeMoneyFactToken({
      ...content,
      raw: { amountMinor: "2", currency: "AFN" },
    });
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, f.subject, { userId: f.actor }, changed),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("classifies the actual raw generation without changing its amount or generation", async () => {
    const f = await fixture();
    const [before] = await db.$queryRaw<
      Array<{ generation: string }>
    >`SELECT "purchaseMoneyGeneration"::text AS generation FROM "CollectibleItem" WHERE id=${f.item}::uuid`;
    const view = await classifyFact(f);
    expect(view).toMatchObject({
      raw: { amountMinor: "1", currency: "AFN" },
      interpretation: { kind: "INTERPRETED", exponent: 0, decimal: "1", eligibility: "ELIGIBLE" },
    });
    const [after] = await db.$queryRaw<
      Array<{ generation: string; amount: string }>
    >`SELECT "purchaseMoneyGeneration"::text AS generation,"purchaseAmountMinor"::text AS amount FROM "CollectibleItem" WHERE id=${f.item}::uuid`;
    expect(after).toEqual({ generation: before!.generation, amount: "1" });
  });
  it("copies ineligible declared units using the original assertion identity", async () => {
    const f = await fixture(),
      source = await classifyFact(f, true),
      target = await copyFact(f);
    expect(target.view.interpretation).toMatchObject({
      kind: "INTERPRETED",
      eligibility: "UNIT_UNSUPPORTED",
      assertionId:
        source.interpretation.kind === "INTERPRETED"
          ? source.interpretation.assertionId
          : "missing",
    });
    if (source.interpretation.kind !== "INTERPRETED") throw Error("Expected source assertion");
    expect(target.view.interpretation).toMatchObject({
      unitKey: `unsupported:${source.interpretation.assertionId}`,
    });
  });
  it("origin revocation makes dependent copies unknown and invalidates stale retain", async () => {
    const f = await fixture(),
      source = await classifyFact(f),
      target = await copyFact(f);
    if (source.interpretation.kind !== "INTERPRETED") throw Error("Expected source assertion");
    await runSearchTransaction(db, async (tx) => {
      const origin = await readMoneyAssertion(
        tx,
        f.subject,
        { userId: f.actor },
        source.interpretation.kind === "INTERPRETED" ? source.interpretation.assertionId : "",
      );
      await revokeMoneyAssertion(
        tx,
        f.subject,
        {
          assertionId:
            source.interpretation.kind === "INTERPRETED" ? source.interpretation.assertionId : "",
          expectedAssertionToken: origin.expectedAssertionToken,
          reason: "Corrected evidence",
        },
        { userId: f.actor },
      );
    });
    const current = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, target.subject, { userId: f.actor }),
    );
    expect(current.interpretation).toEqual({ kind: "UNKNOWN", reason: "REVOKED" });
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, target.subject, { userId: f.actor }, target.view.factToken),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("evidence erasure invalidates the old token without inventing revocation", async () => {
    const f = await fixture();
    await classifyFact(f);
    const target = await copyFact(f);
    await expect(
      runSearchTransaction(db, (tx) =>
        eraseMoneyEvidenceForActor(tx, { userId: randomUUID() }, f.actor),
      ),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    await runSearchTransaction(db, (tx) =>
      eraseMoneyEvidenceForActor(tx, { userId: f.actor }, f.actor),
    );
    const current = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, target.subject, { userId: f.actor }),
    );
    expect(current.interpretation).toEqual({ kind: "UNKNOWN", reason: "EVIDENCE_ERASED" });
    const decoded = decodeMoneyFactToken(current.factToken);
    expect(decoded.originEvidenceErasedAt).not.toBeNull();
    expect(decoded.revocationId).toBeNull();
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, target.subject, { userId: f.actor }, target.view.factToken),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("authoring receipts survive actor-only redaction", async () => {
    const f = await fixture();
    const view = await runSearchTransaction(db, async (tx) => {
      const old = await readMoneyFact(tx, f.subject, { userId: f.actor });
      const fact = await requireMoneyToken(tx, f.subject, { userId: f.actor }, old.factToken);
      return appendMoneyAssertion(tx, fact, {
        kind: "AUTHOR",
        receipt: parseLegacyMoneyAuthoring({
          kind: "DECIMAL",
          profileId: "legacy-money-iso-2026-09-17-v1",
          currency: "AFN",
          decimal: "0.01",
        }),
      });
    });
    expect(view.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 2,
      decimal: "0.01",
    });
    await runSearchTransaction(db, (tx) =>
      eraseMoneyEvidenceForActor(tx, { userId: f.actor }, f.actor),
    );
    const current = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, f.subject, { userId: f.actor }),
    );
    expect(current.interpretation).toMatchObject({
      kind: "INTERPRETED",
      exponent: 2,
      decimal: "0.01",
    });
    expect(current.factToken).toBe(view.factToken);
  });

  it("detects equal-value ABA raw writes and serializes concurrent classifications", async () => {
    const f = await fixture(),
      old = await runSearchTransaction(db, (tx) =>
        readMoneyFact(tx, f.subject, { userId: f.actor }),
      );
    await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseAmountMinor"=1,"purchaseCurrency"='AFN' WHERE id=${f.item}::uuid RETURNING id`;
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, f.subject, { userId: f.actor }, old.factToken),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
    const current = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, f.subject, { userId: f.actor }),
    );
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        runSearchTransaction(db, async (tx) => {
          const fact = await requireMoneyToken(
            tx,
            f.subject,
            { userId: f.actor },
            current.factToken,
          );
          return appendMoneyAssertion(tx, fact, {
            kind: "CLASSIFY",
            input: {
              expectedFactToken: current.factToken,
              exponent: 0,
              unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
              evidence: { category: "OWNER_ATTESTATION", reason: `Concurrent ${n}` },
            },
          });
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "MONEY_CONFLICT" },
    });
  });
  it("revokes an old assertion after a raw generation replacement without reinterpreting the new raw", async () => {
    const f = await fixture(),
      source = await classifyFact(f),
      target = await copyFact(f);
    if (source.interpretation.kind !== "INTERPRETED") throw Error("Expected assertion");
    const id = source.interpretation.assertionId;
    const precondition = await runSearchTransaction(db, (tx) =>
      readMoneyAssertion(tx, f.subject, { userId: f.actor }, id),
    );
    await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseAmountMinor"=2 WHERE id=${f.item}::uuid RETURNING id`;
    await runSearchTransaction(db, (tx) =>
      revokeMoneyAssertion(
        tx,
        f.subject,
        { assertionId: id, ...precondition, reason: "Historical correction" },
        { userId: f.actor },
      ),
    );
    expect(
      (await runSearchTransaction(db, (tx) => readMoneyFact(tx, f.subject, { userId: f.actor })))
        .interpretation,
    ).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
    expect(
      (
        await runSearchTransaction(db, (tx) =>
          readMoneyFact(tx, target.subject, { userId: f.actor }),
        )
      ).interpretation,
    ).toEqual({ kind: "UNKNOWN", reason: "REVOKED" });
    await expect(
      runSearchTransaction(db, (tx) =>
        revokeMoneyAssertion(
          tx,
          f.subject,
          { assertionId: id, ...precondition, reason: "Repeat" },
          { userId: f.actor },
        ),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("origin deletion produces unknown copies and invalidates the previous token", async () => {
    const f = await fixture();
    await classifyFact(f);
    const target = await copyFact(f);
    await db.$queryRaw`DELETE FROM "CollectibleItem" WHERE id=${f.item}::uuid RETURNING id`;
    const current = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, target.subject, { userId: f.actor }),
    );
    expect(current.interpretation).toEqual({ kind: "UNKNOWN", reason: "ORIGIN_ERASED" });
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, target.subject, { userId: f.actor }, target.view.factToken),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
  });
  it("rejects database receipts that satisfy shape but contradict the pinned authoring scale", async () => {
    const f = await fixture(),
      receipt = {
        ...parseLegacyMoneyAuthoring({
          kind: "DECIMAL",
          profileId: "legacy-money-iso-2026-09-17-v1",
          currency: "AFN",
          decimal: "0.01",
        }),
        exponent: 0,
        normalizedDecimal: "1",
      };
    await db.$queryRaw`INSERT INTO "PurchaseMoneyInterpretationEvent" ("itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId",receipt,"actorId") SELECT id,"purchaseMoneyGeneration",2,'AUTHOR',1,'AFN',0,'iso4217-2026-09-17:AFN','legacy-money-iso-2026-09-17-v1',${JSON.stringify(receipt)}::jsonb,${f.actor} FROM "CollectibleItem" WHERE id=${f.item}::uuid RETURNING id`;
    await expect(
      runSearchTransaction(db, (tx) => readMoneyFact(tx, f.subject, { userId: f.actor })),
    ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
  });
  it("does not mark an unsupported historical currency as eligible from a shaped database assertion", async () => {
    const f = await fixture();
    await db.$queryRaw`UPDATE "CollectibleItem" SET "purchaseCurrency"='ZZZ' WHERE id=${f.item}::uuid RETURNING id`;
    await db.$queryRaw`INSERT INTO "PurchaseMoneyInterpretationEvent" ("itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","actorId","evidenceCategory",reason) SELECT id,"purchaseMoneyGeneration",3,'CLASSIFY',1,'ZZZ',0,'iso4217-2026-09-17:ZZZ','OWNER_ATTESTATION:v1',${f.actor},'OWNER_ATTESTATION','Synthetic' FROM "CollectibleItem" WHERE id=${f.item}::uuid RETURNING id`;
    await expect(
      runSearchTransaction(db, (tx) => readMoneyFact(tx, f.subject, { userId: f.actor })),
    ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
  });
  it("requires persisted operator authority and forbids catalog owner attestations", async () => {
    const f = await fixture(),
      s = await canonical({ amountMinor: 1, currency: "AFN" });
    const initial = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, s, { userId: f.actor }),
    );
    await expect(
      runSearchTransaction(db, (tx) => requireMoneyToken(tx, s, { userId: f.actor }, "a")),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    await db.$queryRaw`INSERT INTO "ApplicationRoleGrant" ("userId",role,"grantedBy",reason) VALUES (${f.actor},'MODERATOR','synthetic','Synthetic operator') RETURNING "userId"`;
    await expect(
      runSearchTransaction(db, async (tx) => {
        const fact = await requireMoneyToken(tx, s, { userId: f.actor }, initial.factToken);
        return appendMoneyAssertion(tx, fact, {
          kind: "CLASSIFY",
          input: {
            expectedFactToken: initial.factToken,
            exponent: 0,
            unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
            evidence: { category: "OWNER_ATTESTATION", reason: "Not a canonical authority" },
          },
        });
      }),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    const view = await runSearchTransaction(db, async (tx) => {
      const fact = await requireMoneyToken(tx, s, { userId: f.actor }, initial.factToken);
      return appendMoneyAssertion(tx, fact, {
        kind: "CLASSIFY",
        input: {
          expectedFactToken: initial.factToken,
          exponent: 0,
          unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
          evidence: {
            category: "OPERATOR_VERIFIED_RECORD",
            reason: "Verified synthetic record",
            reference: "OFFLINE-PRIVATE-REF",
          },
        },
      });
    });
    expect(view.interpretation).toMatchObject({
      kind: "INTERPRETED",
      evidenceCategory: "OPERATOR_VERIFIED_RECORD",
    });
    expect(JSON.stringify(view)).not.toContain("OFFLINE-PRIVATE-REF");
    expect(JSON.stringify(view)).not.toContain(f.actor);
    await db.$queryRaw`DELETE FROM "ApplicationRoleGrant" WHERE "userId"=${f.actor} RETURNING "userId"`;
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, s, { userId: f.actor }, view.factToken),
      ),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
  });
  it("never gives a moderator access to somebody else's private money", async () => {
    const owner = await fixture(),
      operator = await fixture();
    await db.$queryRaw`INSERT INTO "ApplicationRoleGrant" ("userId",role,"grantedBy",reason) VALUES (${operator.actor},'ADMIN','synthetic','Synthetic operator') RETURNING "userId"`;
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, owner.subject, { userId: operator.actor }, "a"),
      ),
    ).rejects.toMatchObject({ code: "MONEY_NOT_FOUND" });
  });
  it("resolved facts cannot cross transactions or survive another assertion in the same transaction", async () => {
    const f = await fixture(),
      receipt = parseLegacyMoneyAuthoring({
        kind: "DECIMAL",
        profileId: "legacy-money-iso-2026-09-17-v1",
        currency: "AFN",
        decimal: "0.01",
      });
    const fact = await runSearchTransaction(db, async (tx) => {
      const view = await readMoneyFact(tx, f.subject, { userId: f.actor });
      return requireMoneyToken(tx, f.subject, { userId: f.actor }, view.factToken);
    });
    await expect(
      runSearchTransaction(db, (tx) => appendMoneyAssertion(tx, fact, { kind: "AUTHOR", receipt })),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    await runSearchTransaction(db, async (tx) => {
      const view = await readMoneyFact(tx, f.subject, { userId: f.actor }),
        current = await requireMoneyToken(tx, f.subject, { userId: f.actor }, view.factToken);
      await appendMoneyAssertion(tx, current, { kind: "AUTHOR", receipt });
      await expect(
        appendMoneyAssertion(tx, current, { kind: "AUTHOR", receipt }),
      ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
    });
  });
  it("custom money deletion creates a durable missing token and reinsertion cannot pass its ABA precondition", async () => {
    const f = await fixture(),
      definition = randomUUID(),
      s = { family: "CUSTOM" as const, itemId: f.item, fieldDefinitionId: definition };
    await db.$queryRaw`INSERT INTO "CustomFieldDefinition" (id,"collectionId",name,"normalizedName",type,"updatedAt") VALUES (${definition}::uuid,${f.collection}::uuid,'Value','value','MONEY',now()) RETURNING id`;
    const absent = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, s, { userId: f.actor }),
    );
    const put = () =>
      db.$queryRaw`INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES (${f.item}::uuid,${definition}::uuid,${f.collection}::uuid,'MONEY',1,'AFN',now()) RETURNING "itemId"`;
    await put();
    await db.$queryRaw`DELETE FROM "CustomFieldValue" WHERE "itemId"=${f.item}::uuid AND "fieldDefinitionId"=${definition}::uuid RETURNING "itemId"`;
    const tombstone = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, s, { userId: f.actor }),
    );
    expect(tombstone.interpretation).toEqual({ kind: "MISSING" });
    expect(tombstone.factToken).not.toBe(absent.factToken);
    await put();
    await expect(
      runSearchTransaction(db, (tx) =>
        requireMoneyToken(tx, s, { userId: f.actor }, tombstone.factToken),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
    await db.$queryRaw`DELETE FROM "CustomFieldDefinition" WHERE id=${definition}::uuid RETURNING id`;
    await expect(
      runSearchTransaction(db, (tx) => readMoneyFact(tx, s, { userId: f.actor })),
    ).rejects.toMatchObject({ code: "MONEY_NOT_FOUND" });
  });
  it("supports actual outer ReadCommitted writers without opening a nested transaction", async () => {
    const f = await fixture();
    const view = await db.$transaction(
      async (tx) => {
        const wrapped = { $queryRaw: <T>(query: Prisma.Sql) => tx.$queryRaw<T>(query) };
        const old = await readMoneyFact(wrapped, f.subject, { userId: f.actor }),
          fact = await requireMoneyToken(wrapped, f.subject, { userId: f.actor }, old.factToken);
        return appendMoneyAssertion(wrapped, fact, {
          kind: "AUTHOR",
          receipt: parseLegacyMoneyAuthoring({
            kind: "DECIMAL",
            profileId: "legacy-money-iso-2026-09-17-v1",
            currency: "AFN",
            decimal: "0.01",
          }),
        });
      },
      { isolationLevel: "ReadCommitted", timeout: 5000, maxWait: 2000 },
    );
    expect(view.interpretation).toMatchObject({ kind: "INTERPRETED", exponent: 2 });
  });
  it("cannot silently retain independently interpreted destination meaning when copying an unknown source", async () => {
    const source = await fixture(),
      destination = await fixture();
    await classifyFact(destination);
    // Same owner and collection are required even for the unknown-copy branch.
    await db.$queryRaw`UPDATE "CollectibleItem" SET "ownerId"=${source.actor},"collectionId"=${source.collection}::uuid WHERE id=${destination.item}::uuid RETURNING id`;
    await expect(
      runSearchTransaction(db, async (tx) => {
        const a = await readMoneyFact(tx, source.subject, { userId: source.actor }),
          b = await readMoneyFact(tx, destination.subject, { userId: source.actor });
        const af = await requireMoneyToken(
            tx,
            source.subject,
            { userId: source.actor },
            a.factToken,
          ),
          bf = await requireMoneyToken(
            tx,
            destination.subject,
            { userId: source.actor },
            b.factToken,
          );
        return copyMoneyFact(tx, af, bf, { userId: source.actor });
      }),
    ).rejects.toMatchObject({ code: "LEGACY_MONEY_INVALID" });
  });
  it("deleting an intermediate copy preserves the flattened original evidence", async () => {
    const f = await fixture();
    await classifyFact(f);
    const intermediate = await copyFact(f);
    const final = await copyFact({
      ...f,
      item: intermediate.subject.itemId,
      subject: intermediate.subject,
    });
    await db.$queryRaw`DELETE FROM "CollectibleItem" WHERE id=${intermediate.subject.itemId}::uuid RETURNING id`;
    const current = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, final.subject, { userId: f.actor }),
    );
    expect(current.interpretation).toMatchObject({ kind: "INTERPRETED", exponent: 0 });
    expect(decodeMoneyFactToken(current.factToken).originId).toBe(
      decodeMoneyFactToken(final.view.factToken).originId,
    );
  });
  it("authoritative custom assertions use the actual definition/generation and erase idempotently", async () => {
    const f = await fixture(),
      definition = randomUUID(),
      s = { family: "CUSTOM" as const, itemId: f.item, fieldDefinitionId: definition };
    await db.$queryRaw`INSERT INTO "CustomFieldDefinition" (id,"collectionId",name,"normalizedName",type,"updatedAt") VALUES (${definition}::uuid,${f.collection}::uuid,'Custom value','custom value','MONEY',now()) RETURNING id`;
    await db.$queryRaw`INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES (${f.item}::uuid,${definition}::uuid,${f.collection}::uuid,'MONEY',1,'AFN',now()) RETURNING "itemId"`;
    const view = await runSearchTransaction(db, async (tx) => {
      const old = await readMoneyFact(tx, s, { userId: f.actor }),
        fact = await requireMoneyToken(tx, s, { userId: f.actor }, old.factToken);
      return appendMoneyAssertion(tx, fact, {
        kind: "CLASSIFY",
        input: {
          expectedFactToken: old.factToken,
          exponent: 0,
          unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
          evidence: { category: "OWNER_ATTESTATION", reason: "Actual custom record" },
        },
      });
    });
    expect(view.interpretation).toMatchObject({ kind: "INTERPRETED", decimal: "1" });
    await runSearchTransaction(db, (tx) =>
      eraseMoneyEvidenceForActor(tx, { userId: f.actor }, f.actor),
    );
    const erased = await runSearchTransaction(db, (tx) =>
      readMoneyFact(tx, s, { userId: f.actor }),
    );
    expect(erased.interpretation).toEqual({ kind: "UNKNOWN", reason: "EVIDENCE_ERASED" });
    await runSearchTransaction(db, (tx) =>
      eraseMoneyEvidenceForActor(tx, { userId: f.actor }, f.actor),
    );
    const again = await runSearchTransaction(db, (tx) => readMoneyFact(tx, s, { userId: f.actor }));
    expect(again.factToken).toBe(erased.factToken);
  });
  it("preserves actual pre-migration zero values as unknown in both personal families", async () => {
    for (const s of [
      { family: "PURCHASE" as const, itemId: legacy.item },
      { family: "CUSTOM" as const, itemId: legacy.item, fieldDefinitionId: legacy.definition },
    ]) {
      const view = await runSearchTransaction(db, (tx) =>
        readMoneyFact(tx, s, { userId: legacy.actor }),
      );
      expect(view.raw).toEqual({ amountMinor: "0", currency: "ZZZ" });
      expect(view.interpretation).toEqual({ kind: "UNKNOWN", reason: "NO_EVIDENCE" });
      expect(decodeMoneyFactToken(view.factToken)).toMatchObject({
        generation: "00000000-0000-0000-0000-000000000000",
        sequence: "0",
        effectiveEventId: null,
      });
    }
  });
  it("requires the actual numeric catalog snapshot version rather than a string lookalike", async () => {
    const f = await fixture(),
      s = await canonical({ amountMinor: 1, currency: "AFN" }, [], "1");
    await expect(
      runSearchTransaction(db, (tx) => readMoneyFact(tx, s, { userId: f.actor })),
    ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
  });
  for (const invalidation of ["ERASE", "REVOKE"] as const) {
    it(`closes ReadCommitted COPY origin ${invalidation} races without partial copy`, async () => {
      const f = await fixture(),
        origin = await classifyFact(f),
        otherCollection = randomUUID();
      if (origin.interpretation.kind !== "INTERPRETED") throw Error("Expected assertion");
      const assertionId = origin.interpretation.assertionId;
      const precondition = await runSearchTransaction(db, (tx) =>
        readMoneyAssertion(tx, f.subject, { userId: f.actor }, assertionId),
      );
      await db.$queryRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${otherCollection}::uuid,${f.actor},'Other owned collection',now()) RETURNING id`;
      const source = await copyFact({ ...f, collection: otherCollection });
      const destination = { family: "PURCHASE" as const, itemId: randomUUID() };
      await db.$queryRaw`INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES (${destination.itemId}::uuid,${otherCollection}::uuid,${f.actor},'Concurrent destination',1,'AFN',now()) RETURNING id`;
      let reached = () => {},
        release = () => {};
      const entered = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pending = db
        .$transaction(
          async (tx) => {
            const wrapped = {
              $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
                if (
                  query.sql.includes('INSERT INTO "PurchaseMoneyInterpretationEvent"') &&
                  query.values.includes("COPY")
                ) {
                  reached();
                  await resume;
                }
                return tx.$queryRaw<T>(query);
              },
            };
            const a = await readMoneyFact(wrapped, source.subject, { userId: f.actor }),
              b = await readMoneyFact(wrapped, destination, { userId: f.actor });
            const af = await requireMoneyToken(
                wrapped,
                source.subject,
                { userId: f.actor },
                a.factToken,
              ),
              bf = await requireMoneyToken(wrapped, destination, { userId: f.actor }, b.factToken);
            return copyMoneyFact(wrapped, af, bf, { userId: f.actor });
          },
          { isolationLevel: "ReadCommitted", timeout: 5000, maxWait: 2000 },
        )
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          entered,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(Error("COPY did not reach insert gate")), 2000);
          }),
        ]);
        if (invalidation === "ERASE")
          await runSearchTransaction(db, (tx) =>
            eraseMoneyEvidenceForActor(tx, { userId: f.actor }, f.actor),
          );
        else
          await runSearchTransaction(db, (tx) =>
            revokeMoneyAssertion(
              tx,
              f.subject,
              { assertionId, ...precondition, reason: "Concurrent correction" },
              { userId: f.actor },
            ),
          );
      } finally {
        clearTimeout(timer);
        release();
      }
      const result = await pending;
      expect(result.error).toMatchObject({ code: "MONEY_CONFLICT" });
      const current = await runSearchTransaction(db, (tx) =>
        readMoneyFact(tx, destination, { userId: f.actor }),
      );
      expect(current.interpretation).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
      const [count] = await db.$queryRaw<
        Array<{ count: string }>
      >`SELECT count(*)::text AS count FROM "PurchaseMoneyInterpretationEvent" WHERE "itemId"=${destination.itemId}::uuid AND operation='COPY'`;
      expect(count!.count).toBe("0");
    });
  }
});
