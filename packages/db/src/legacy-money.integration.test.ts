import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const migrations = new URL("../prisma/migrations/", import.meta.url);
const migrationName = "20261106004500_legacy_money_provenance";
async function upgrade(work: (client: Client) => Promise<void>) {
  const schema = `legacy_money_upgrade_${randomUUID().replaceAll("-", "_")}`;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const guard = await client.query(
      "SELECT current_database() AS name,current_setting('server_version') AS version",
    );
    if (
      !String(guard.rows[0].name).endsWith("_test") ||
      !String(guard.rows[0].version).startsWith("17.11")
    )
      throw Error("Guarded PostgreSQL17.11 test database required");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    for (const name of (await readdir(migrations)).filter((n) => /^\d+_/.test(n)).sort()) {
      if (name === migrationName) break;
      await client.query(await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"));
    }
    await work(client);
    // Force real deferred FK checks before rollback; no hidden invalid end-state.
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}
describe.runIf(enabled)("legacy money native upgrade", () => {
  it("migration_preserves_untracked_raw", async () =>
    upgrade(async (client) => {
      const actor = randomUUID(),
        collection = randomUUID(),
        item = randomUUID();
      await client.query(
        'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,\'Synthetic\',$2,false,now(),now())',
        [actor, `${actor}@example.invalid`],
      );
      await client.query(
        'INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES ($1,$2,\'Raw collection\',now())',
        [collection, actor],
      );
      await client.query(
        'INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES ($1,$2,$3,\'Raw amount\',1,\'AFN\',now())',
        [item, collection, actor],
      );
      const zeroItem = randomUUID(),
        definition = randomUUID();
      await client.query(
        `INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES ($1,$2,$3,'Historical zero',0,'ZZZ',now())`,
        [zeroItem, collection, actor],
      );
      await client.query(
        `INSERT INTO "CustomFieldDefinition" (id,"collectionId",name,"normalizedName",type,"updatedAt") VALUES ($1,$2,'Historical custom','historical custom','MONEY',now())`,
        [definition, collection],
      );
      await client.query(
        `INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES ($1,$2,$3,'MONEY',0,'ZZZ',now())`,
        [zeroItem, definition, collection],
      );
      const zeroBefore = (
        await client.query('SELECT to_jsonb(i) AS value FROM "CollectibleItem" i WHERE id=$1', [
          zeroItem,
        ])
      ).rows[0].value;
      const customBefore = (
        await client.query(
          'SELECT to_jsonb(v) AS value FROM "CustomFieldValue" v WHERE "itemId"=$1',
          [zeroItem],
        )
      ).rows[0].value;
      const before = (
        await client.query(
          'SELECT "purchaseAmountMinor"::text AS amount,"purchaseCurrency" AS currency FROM "CollectibleItem" WHERE id=$1',
          [item],
        )
      ).rows[0];
      await client.query(
        await readFile(new URL(`${migrationName}/migration.sql`, migrations), "utf8"),
      );
      const after = (
        await client.query('SELECT to_jsonb(i) AS value FROM "CollectibleItem" i WHERE id=$1', [
          item,
        ])
      ).rows[0].value;
      expect(Object.hasOwn(after, "purchaseMoneyGeneration")).toBe(true);
      expect(after.purchaseMoneyGeneration).toBeNull();
      expect({
        amount: String(after.purchaseAmountMinor),
        currency: after.purchaseCurrency,
      }).toEqual(before);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM "PurchaseMoneyInterpretationEvent"',
          )
        ).rows[0].count,
      ).toBe(0);
      expect(after).not.toHaveProperty("exponent");
      const zeroAfter = (
        await client.query('SELECT to_jsonb(i) AS value FROM "CollectibleItem" i WHERE id=$1', [
          zeroItem,
        ])
      ).rows[0].value;
      const customAfter = (
        await client.query(
          'SELECT to_jsonb(v) AS value FROM "CustomFieldValue" v WHERE "itemId"=$1',
          [zeroItem],
        )
      ).rows[0].value;
      expect(zeroAfter.purchaseMoneyGeneration).toBeNull();
      delete zeroAfter.purchaseMoneyGeneration;
      expect(zeroAfter).toEqual(zeroBefore);
      expect(customAfter.moneyGeneration).toBeNull();
      delete customAfter.moneyGeneration;
      expect(customAfter).toEqual(customBefore);
      expect(
        (await client.query('SELECT count(*)::int AS count FROM "CustomMoneyInterpretationEvent"'))
          .rows[0].count,
      ).toBe(0);
    }));
});

async function seed(client: Client) {
  const actor = randomUUID(),
    collection = randomUUID(),
    item = randomUUID(),
    definition = randomUUID();
  await client.query(
    'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,\'Synthetic\',$2,false,now(),now())',
    [actor, `${actor}@example.invalid`],
  );
  await client.query(
    'INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES ($1,$2,\'Raw collection\',now())',
    [collection, actor],
  );
  await client.query(
    'INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES ($1,$2,$3,\'Raw amount\',1,\'AFN\',now())',
    [item, collection, actor],
  );
  await client.query(
    'INSERT INTO "CustomFieldDefinition" (id,"collectionId",name,"normalizedName",type,"updatedAt") VALUES ($1,$2,\'Old money\',\'old money\',\'MONEY\',now())',
    [definition, collection],
  );
  await client.query(
    'INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES ($1,$2,$3,\'MONEY\',1,\'AFN\',now())',
    [item, definition, collection],
  );
  return { actor, collection, item, definition };
}
async function apply(client: Client) {
  await client.query(await readFile(new URL(`${migrationName}/migration.sql`, migrations), "utf8"));
}
async function rejects(client: Client, sql: string, values: unknown[] = [], code = "23514") {
  await client.query("SAVEPOINT expected_rejection");
  let error: unknown;
  try {
    await client.query(sql, values);
  } catch (caught) {
    error = caught;
  }
  await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
  await client.query("RELEASE SAVEPOINT expected_rejection");
  expect(error).toMatchObject({ code });
}
const nil = "00000000-0000-0000-0000-000000000000";
async function classify(client: Client, f: Awaited<ReturnType<typeof seed>>, id = randomUUID()) {
  await client.query(
    'INSERT INTO "PurchaseMoneyInterpretationEvent" (id,"itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","actorId","evidenceCategory",reason) VALUES ($1,$2,$3,1,\'CLASSIFY\',1,\'AFN\',0,\'iso4217-2026-09-17:AFN\',\'OWNER_ATTESTATION:v1\',$4,\'OWNER_ATTESTATION\',\'Observed old receipt\')',
    [id, f.item, nil, f.actor],
  );
  return id;
}
describe.runIf(enabled)("legacy money native behavior", () => {
  it("same_pair_sql_invalidates", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      const first = (
        await client.query(
          'UPDATE "CollectibleItem" SET "purchaseAmountMinor"="purchaseAmountMinor" WHERE id=$1 RETURNING "purchaseMoneyGeneration" AS generation',
          [f.item],
        )
      ).rows[0].generation;
      expect(first).not.toBeNull();
      const second = (
        await client.query(
          'UPDATE "CollectibleItem" SET "purchaseCurrency"="purchaseCurrency" WHERE id=$1 RETURNING "purchaseMoneyGeneration" AS generation',
          [f.item],
        )
      ).rows[0].generation;
      expect(second).not.toBe(first);
      const events = (
        await client.query(
          'SELECT operation,"rawAmountMinor"::text AS raw,generation,sequence::text AS sequence FROM "PurchaseMoneyInterpretationEvent" WHERE "itemId"=$1 ORDER BY sequence',
          [f.item],
        )
      ).rows;
      expect(events.map((e) => e.operation)).toEqual(["BASELINE", "RAW_WRITE", "RAW_WRITE"]);
      expect(events.map((e) => e.raw)).toEqual(["1", "1", "1"]);
      expect(events.map((e) => e.sequence)).toEqual(["1", "2", "3"]);
    }));
  it("aba_and_custom_absence_stale_tokens", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      await client.query(
        'DELETE FROM "CustomFieldValue" WHERE "itemId"=$1 AND "fieldDefinitionId"=$2',
        [f.item, f.definition],
      );
      const events = (
        await client.query(
          'SELECT operation,generation FROM "CustomMoneyInterpretationEvent" WHERE "itemId"=$1 ORDER BY sequence',
          [f.item],
        )
      ).rows;
      expect(events.map((e) => e.operation)).toEqual(["BASELINE", "CLEAR"]);
      const absent = events[1]!.generation;
      expect(absent).not.toBeNull();
      await client.query(
        'INSERT INTO "CustomFieldValue" ("itemId","fieldDefinitionId","collectionId","fieldType","moneyAmountMinor","moneyCurrency","updatedAt") VALUES ($1,$2,$3,\'MONEY\',1,\'AFN\',now())',
        [f.item, f.definition, f.collection],
      );
      const current = (
        await client.query(
          'SELECT "moneyGeneration" FROM "CustomFieldValue" WHERE "itemId"=$1 AND "fieldDefinitionId"=$2',
          [f.item, f.definition],
        )
      ).rows[0].moneyGeneration;
      expect(current).not.toBe(absent);
      expect(
        (
          await client.query(
            'SELECT operation FROM "CustomMoneyInterpretationEvent" WHERE "itemId"=$1 ORDER BY sequence DESC LIMIT 1',
            [f.item],
          )
        ).rows[0].operation,
      ).toBe("RAW_WRITE");
    }));
  it("classification_never_changes_raw and rejects mismatched raw facts", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      await classify(client, f);
      const raw = (
        await client.query(
          'SELECT "purchaseAmountMinor"::text AS amount,"purchaseCurrency" AS currency,"purchaseMoneyGeneration" AS generation FROM "CollectibleItem" WHERE id=$1',
          [f.item],
        )
      ).rows[0];
      expect(raw).toEqual({ amount: "1", currency: "AFN", generation: null });
      await rejects(
        client,
        'INSERT INTO "PurchaseMoneyInterpretationEvent" ("itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","actorId","evidenceCategory",reason) VALUES ($1,$2,2,\'CLASSIFY\',2,\'AFN\',0,\'iso4217-2026-09-17:AFN\',\'OWNER_ATTESTATION:v1\',$3,\'OWNER_ATTESTATION\',\'Wrong amount\')',
        [f.item, nil, f.actor],
      );
    }));
  it("event_failure_rolls_back_raw", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      await client.query(
        "CREATE FUNCTION reject_synthetic_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic event failure' USING ERRCODE='23514'; END $$",
      );
      await client.query(
        'CREATE TRIGGER reject_synthetic_event BEFORE INSERT ON "PurchaseMoneyInterpretationEvent" FOR EACH ROW EXECUTE FUNCTION reject_synthetic_event()',
      );
      await rejects(client, 'UPDATE "CollectibleItem" SET "purchaseAmountMinor"=2 WHERE id=$1', [
        f.item,
      ]);
      expect(
        (
          await client.query(
            'SELECT "purchaseAmountMinor"::text AS amount,"purchaseMoneyGeneration" AS generation FROM "CollectibleItem" WHERE id=$1',
            [f.item],
          )
        ).rows[0],
      ).toEqual({ amount: "1", generation: null });
    }));
  it("event_and_proposal_immutability", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      const event = await classify(client, f);
      await rejects(
        client,
        'UPDATE "PurchaseMoneyInterpretationEvent" SET "rawAmountMinor"=2 WHERE id=$1',
        [event],
      );
      await rejects(client, 'DELETE FROM "PurchaseMoneyInterpretationEvent" WHERE id=$1', [event]);
      const proposal = randomUUID();
      await client.query(
        'INSERT INTO "CatalogProposal" (id,"proposerId",patch,summary) VALUES ($1,$2,$3::jsonb,\'Submitted\')',
        [proposal, f.actor, JSON.stringify({ kind: "CREATE_ENTRY", input: {} })],
      );
      await rejects(client, 'UPDATE "CatalogProposal" SET patch=$2::jsonb WHERE id=$1', [
        proposal,
        JSON.stringify({ kind: "CHANGED" }),
      ]);
      await rejects(
        client,
        'UPDATE "CatalogProposal" SET "moneyInterpretation"=$2::jsonb WHERE id=$1',
        [proposal, JSON.stringify({ schemaVersion: 1 })],
      );
      await client.query("UPDATE \"CatalogProposal\" SET state='REJECTED' WHERE id=$1", [proposal]);
    }));
  it("copy_origin_rejects_cross_owner", async () =>
    upgrade(async (client) => {
      const source = await seed(client),
        destination = await seed(client);
      await apply(client);
      const origin = await classify(client, source);
      await rejects(
        client,
        'INSERT INTO "PurchaseMoneyInterpretationEvent" ("itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","sourceEventId","originEventId","actorId") VALUES ($1,$2,1,\'COPY\',1,\'AFN\',0,\'iso4217-2026-09-17:AFN\',\'OWNER_ATTESTATION:v1\',$3,$3,$4)',
        [destination.item, nil, origin, destination.actor],
      );
    }));
});

async function child(client: Client, f: Awaited<ReturnType<typeof seed>>) {
  const id = randomUUID();
  const row = (
    await client.query(
      'INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,"purchaseAmountMinor","purchaseCurrency","updatedAt") VALUES ($1,$2,$3,\'Child raw\',1,\'AFN\',now()) RETURNING "purchaseMoneyGeneration" AS generation',
      [id, f.collection, f.actor],
    )
  ).rows[0];
  return { id, generation: row.generation };
}
async function copy(
  client: Client,
  f: Awaited<ReturnType<typeof seed>>,
  source: string,
  origin: string,
) {
  const c = await child(client, f),
    id = randomUUID();
  await client.query(
    'INSERT INTO "PurchaseMoneyInterpretationEvent" (id,"itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","sourceEventId","originEventId","actorId") VALUES ($1,$2,$3,2,\'COPY\',1,\'AFN\',0,\'iso4217-2026-09-17:AFN\',\'OWNER_ATTESTATION:v1\',$4,$5,$6)',
    [id, c.id, c.generation, source, origin, f.actor],
  );
  return { event: id, item: c.id };
}
async function catalog(client: Client) {
  const category = randomUUID(),
    entry = randomUUID(),
    definition = randomUUID();
  await client.query('INSERT INTO "CategoryTemplate" (id,key) VALUES ($1,$2)', [
    category,
    `money_${randomUUID().replaceAll("-", "")}`,
  ]);
  await client.query(
    "INSERT INTO \"CatalogAttributeDefinition\" (id,\"categoryTemplateId\",key,type,position) VALUES ($1,$2,'price','MONEY',0)",
    [definition, category],
  );
  const snapshot = {
    schemaVersion: 1,
    id: entry,
    categoryTemplateId: category,
    text: { language: "en", title: "Raw canonical", translations: [] },
    sources: [],
    attributes: [
      {
        definitionId: definition,
        key: "price",
        type: "MONEY",
        value: { amountMinor: 1, currency: "AFN" },
      },
    ],
    variants: [],
    identifiers: [],
  };
  await client.query(
    'INSERT INTO "CatalogEntry" (id,"categoryTemplateId",revision,authored) VALUES ($1,$2,1,$3::jsonb)',
    [entry, category, JSON.stringify(snapshot)],
  );
  await client.query(
    'INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) VALUES ($1,1,$2::jsonb)',
    [entry, JSON.stringify(snapshot)],
  );
  return { category, entry, definition, snapshot };
}
describe.runIf(enabled)("legacy money native erasure and history", () => {
  it("native_redaction_content_transitions", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      const event = await classify(client, f);
      for (const change of [
        '"rawAmountMinor"=2',
        "\"rawCurrency\"='EUR'",
        "exponent=2",
        "\"unitKey\"='iso4217-2026-09-17:EUR'",
        "\"basisId\"='OTHER'",
        "operation='RAW_WRITE'",
        "sequence=2",
        "\"createdAt\"=now()-interval '1 day'",
        "reason='Rewritten'",
        '"actorId"=NULL',
        "\"evidenceErasedAt\"=now()-interval '1 day'",
      ])
        await rejects(
          client,
          `UPDATE "PurchaseMoneyInterpretationEvent" SET ${change} WHERE id=$1`,
          [event],
        );
      await client.query(
        'UPDATE "PurchaseMoneyInterpretationEvent" SET "actorId"=NULL,"evidenceReference"=NULL,reason=NULL,"evidenceErasedAt"=transaction_timestamp() WHERE id=$1',
        [event],
      );
      const row = (
        await client.query(
          'SELECT "actorId","evidenceReference",reason,"evidenceErasedAt",exponent,"rawAmountMinor"::text AS raw FROM "PurchaseMoneyInterpretationEvent" WHERE id=$1',
          [event],
        )
      ).rows[0];
      expect(row).toMatchObject({
        actorId: null,
        evidenceReference: null,
        reason: null,
        exponent: 0,
        raw: "1",
      });
      expect(row.evidenceErasedAt).not.toBeNull();
      for (const change of [
        '"evidenceErasedAt"=NULL',
        "reason='Restored'",
        "\"actorId\"='restored'",
        "\"evidenceErasedAt\"=now()+interval '1 second'",
      ])
        await rejects(
          client,
          `UPDATE "PurchaseMoneyInterpretationEvent" SET ${change} WHERE id=$1`,
          [event],
        );
    }));
  it("native_actor_and_origin_fk_erasure", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      const origin = await classify(client, f);
      const first = await copy(client, f, origin, origin),
        second = await copy(client, f, first.event, origin);
      await rejects(
        client,
        'UPDATE "PurchaseMoneyInterpretationEvent" SET "originEventId"=NULL WHERE id=$1',
        [second.event],
      );
      await client.query('DELETE FROM "CollectibleItem" WHERE id=$1', [first.item]);
      expect(
        (
          await client.query(
            'SELECT "sourceEventId","originEventId" FROM "PurchaseMoneyInterpretationEvent" WHERE id=$1',
            [second.event],
          )
        ).rows[0],
      ).toEqual({ sourceEventId: null, originEventId: origin });
      await client.query('DELETE FROM "CollectibleItem" WHERE id=$1', [f.item]);
      expect(
        (
          await client.query(
            'SELECT "sourceEventId","originEventId","rawAmountMinor"::text AS raw FROM "PurchaseMoneyInterpretationEvent" WHERE id=$1',
            [second.event],
          )
        ).rows[0],
      ).toEqual({ sourceEventId: null, originEventId: null, raw: "1" });
      await client.query('DELETE FROM "user" WHERE id=$1', [f.actor]);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM "PurchaseMoneyInterpretationEvent"',
          )
        ).rows[0].count,
      ).toBe(0);
      expect(
        (await client.query('SELECT count(*)::int AS count FROM "CustomMoneyInterpretationEvent"'))
          .rows[0].count,
      ).toBe(0);
    }));
  it("definition cascade removes personal events without absence resurrection", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      await client.query(
        'INSERT INTO "CustomMoneyInterpretationEvent" ("itemId","fieldDefinitionId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","actorId","evidenceCategory",reason) VALUES ($1,$2,$3,1,\'CLASSIFY\',1,\'AFN\',0,\'iso4217-2026-09-17:AFN\',\'OWNER_ATTESTATION:v1\',$4,\'OWNER_ATTESTATION\',\'Old record\')',
        [f.item, f.definition, nil, f.actor],
      );
      await client.query('DELETE FROM "CustomFieldDefinition" WHERE id=$1', [f.definition]);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM "CustomFieldValue" WHERE "itemId"=$1',
            [f.item],
          )
        ).rows[0].count,
      ).toBe(0);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM "CustomMoneyInterpretationEvent" WHERE "itemId"=$1',
            [f.item],
          )
        ).rows[0].count,
      ).toBe(0);
      expect(
        (
          await client.query(
            'SELECT "purchaseAmountMinor"::text AS raw FROM "CollectibleItem" WHERE id=$1',
            [f.item],
          )
        ).rows[0].raw,
      ).toBe("1");
    }));
  it("a classified logical baseline is not hidden by a later raw write", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      const origin = await classify(client, f);
      await client.query(
        'UPDATE "CollectibleItem" SET "purchaseAmountMinor"="purchaseAmountMinor" WHERE id=$1',
        [f.item],
      );
      expect(
        (
          await client.query(
            'SELECT id,operation FROM "PurchaseMoneyInterpretationEvent" WHERE "itemId"=$1 ORDER BY sequence',
            [f.item],
          )
        ).rows.map((e) => e.operation),
      ).toEqual(["CLASSIFY", "RAW_WRITE"]);
      const before = (
        await client.query(
          'SELECT "purchaseMoneyGeneration" AS generation FROM "CollectibleItem" WHERE id=$1',
          [f.item],
        )
      ).rows[0].generation;
      await client.query("UPDATE \"CollectibleItem\" SET title='Changed title only' WHERE id=$1", [
        f.item,
      ]);
      expect(
        (
          await client.query(
            'SELECT "purchaseMoneyGeneration" AS generation FROM "CollectibleItem" WHERE id=$1',
            [f.item],
          )
        ).rows[0].generation,
      ).toBe(before);
      expect(
        (
          await client.query('SELECT reason FROM "PurchaseMoneyInterpretationEvent" WHERE id=$1', [
            origin,
          ])
        ).rows[0].reason,
      ).toBe("Observed old receipt");
      await rejects(
        client,
        'UPDATE "CollectibleItem" SET "purchaseMoneyGeneration"=$2 WHERE id=$1',
        [f.item, randomUUID()],
      );
      await rejects(
        client,
        'UPDATE "CustomFieldValue" SET "moneyGeneration"=$2 WHERE "itemId"=$1',
        [f.item, randomUUID()],
      );
    }));
  it("snapshot_target_guard", async () =>
    upgrade(async (client) => {
      const f = await seed(client),
        c = await catalog(client);
      await apply(client);
      const initial = JSON.stringify(
        (
          await client.query(
            'SELECT snapshot FROM "CatalogRevision" WHERE "entryId"=$1 AND revision=1',
            [c.entry],
          )
        ).rows[0].snapshot,
      );
      const event = randomUUID();
      const insert =
        'INSERT INTO "CatalogMoneyInterpretationEvent" (id,"entryId",revision,"targetKey","variantId","definitionId",sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","actorId","evidenceCategory","evidenceReference",reason) VALUES ($1,$2,1,$3,$4,$5,$6,\'CLASSIFY\',$7,\'AFN\',0,\'iso4217-2026-09-17:AFN\',\'OPERATOR_VERIFIED_RECORD:v1\',$8,\'OPERATOR_VERIFIED_RECORD\',\'archive:old-receipt\',\'Operator reviewed\')';
      await client.query(insert, [event, c.entry, "entry", null, c.definition, 1, 1, f.actor]);
      await rejects(client, insert, [
        randomUUID(),
        c.entry,
        "entry",
        null,
        c.definition,
        2,
        2,
        f.actor,
      ]);
      const variant = randomUUID();
      await rejects(client, insert, [
        randomUUID(),
        c.entry,
        variant,
        variant,
        c.definition,
        1,
        1,
        f.actor,
      ]);
      await rejects(client, 'DELETE FROM "CatalogMoneyInterpretationEvent" WHERE id=$1', [event]);
      expect(
        JSON.stringify(
          (
            await client.query(
              'SELECT snapshot FROM "CatalogRevision" WHERE "entryId"=$1 AND revision=1',
              [c.entry],
            )
          ).rows[0].snapshot,
        ),
      ).toBe(initial);
    }));
  for (const operation of ["CLASSIFY", "AUTHOR"] as const) {
    it(`actual catalog actor FK erasure distinguishes ${operation} origin`, async () =>
      upgrade(async (client) => {
        const f = await seed(client),
          g = await seed(client),
          c = await catalog(client);
        await apply(client);
        const origin = randomUUID();
        const receipt = {
          schemaVersion: 1,
          profileId: "legacy-money-iso-2026-09-17-v1",
          authorityHash: "33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff",
          raw: { amountMinor: "1", currency: "AFN" },
          exponent: 2,
          unitKey: "iso4217-2026-09-17:AFN",
          normalizedDecimal: "0.01",
        };
        if (operation === "CLASSIFY")
          await client.query(
            'INSERT INTO "CatalogMoneyInterpretationEvent" (id,"entryId",revision,"targetKey","definitionId",sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","actorId","evidenceCategory","evidenceReference",reason) VALUES ($1,$2,1,\'entry\',$3,1,\'CLASSIFY\',1,\'AFN\',0,\'iso4217-2026-09-17:AFN\',\'OPERATOR_VERIFIED_RECORD:v1\',$4,\'OPERATOR_VERIFIED_RECORD\',\'archive:old\',\'Reviewed\')',
            [origin, c.entry, c.definition, f.actor],
          );
        else
          await client.query(
            'INSERT INTO "CatalogMoneyInterpretationEvent" (id,"entryId",revision,"targetKey","definitionId",sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId",receipt,"actorId") VALUES ($1,$2,1,\'entry\',$3,1,\'AUTHOR\',1,\'AFN\',2,\'iso4217-2026-09-17:AFN\',\'legacy-money-iso-2026-09-17-v1\',$4::jsonb,$5)',
            [origin, c.entry, c.definition, JSON.stringify(receipt), f.actor],
          );
        await client.query(
          'INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) VALUES ($1,2,$2::jsonb)',
          [c.entry, JSON.stringify(c.snapshot)],
        );
        const copy = randomUUID();
        await client.query(
          'INSERT INTO "CatalogMoneyInterpretationEvent" (id,"entryId",revision,"targetKey","definitionId",sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId","sourceEventId","originEventId","actorId") SELECT $1,"entryId",2,\'entry\',"definitionId",1,\'COPY\',"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId",id,id,$2 FROM "CatalogMoneyInterpretationEvent" WHERE id=$3',
          [copy, g.actor, origin],
        );
        await client.query('DELETE FROM "user" WHERE id=$1', [f.actor]);
        const row = (
          await client.query(
            'SELECT "actorId","evidenceReference",reason,"evidenceErasedAt",receipt,"rawAmountMinor"::text AS raw FROM "CatalogMoneyInterpretationEvent" WHERE id=$1',
            [origin],
          )
        ).rows[0];
        expect(row).toMatchObject({
          actorId: null,
          evidenceReference: null,
          reason: null,
          raw: "1",
        });
        if (operation === "CLASSIFY") expect(row.evidenceErasedAt).not.toBeNull();
        else {
          expect(row.evidenceErasedAt).toBeNull();
          expect(row.receipt).toEqual(receipt);
        }
        expect(
          (
            await client.query(
              'SELECT "originEventId" FROM "CatalogMoneyInterpretationEvent" WHERE id=$1',
              [copy],
            )
          ).rows[0].originEventId,
        ).toBe(origin);
        await client.query('DELETE FROM "user" WHERE id=$1', [g.actor]);
        expect(
          (
            await client.query(
              'SELECT "actorId","originEventId" FROM "CatalogMoneyInterpretationEvent" WHERE id=$1',
              [copy],
            )
          ).rows[0],
        ).toEqual({ actorId: null, originEventId: origin });
      }));
  }
  it("authoring receipts have a native byte bound, including otherwise valid extra content", async () =>
    upgrade(async (client) => {
      const f = await seed(client);
      await apply(client);
      const receipt = {
        schemaVersion: 1,
        profileId: "legacy-money-iso-2026-09-17-v1",
        authorityHash: "33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff",
        raw: { amountMinor: "1", currency: "AFN" },
        exponent: 2,
        unitKey: "iso4217-2026-09-17:AFN",
        normalizedDecimal: "0.01",
        padding: "x".repeat(5000),
      };
      await rejects(
        client,
        `INSERT INTO "PurchaseMoneyInterpretationEvent" ("itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","basisId",receipt,"actorId") VALUES ($1,$2,1,'AUTHOR',1,'AFN',2,'iso4217-2026-09-17:AFN','legacy-money-iso-2026-09-17-v1',$3::jsonb,$4)`,
        [f.item, nil, JSON.stringify(receipt), f.actor],
      );
    }));
});
