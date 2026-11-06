import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import {
  readMoneyFact,
  readCatalogMoneyMap,
  applyCatalogMoneyRevision,
  requireMoneyToken,
  appendMoneyAssertion,
  readMoneyAssertion,
  revokeMoneyAssertion,
  eraseMoneyEvidenceForActor,
} from "../money/legacy-money-store";
import { parseLegacyMoneyAuthoring } from "../money/legacy-money-policy";
import { moneyTransaction } from "../money/legacy-money-transaction";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>;
let category: string, money: string, label: string;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const actor = randomUUID();
const text = { language: "en", title: "Synthetic financial reference" };
const raw = { amountMinor: 100, currency: "AFN" };
const authoring = {
  kind: "DECIMAL",
  profileId: "legacy-money-iso-2026-09-17-v1",
  currency: "AFN",
  decimal: "1",
};
describe.runIf(enabled)("native coherent catalog money map", () => {
  async function template(count: number) {
    const id = randomUUID();
    await db.$queryRaw`INSERT INTO "CategoryTemplate" (id,key) VALUES (${id}::uuid,${`map_${id.replaceAll("-", "")}`}) RETURNING id`;
    const definitions = Array.from({ length: count }, (_, n) => ({
      id: randomUUID(),
      key: `price_${n}`,
      position: n,
    }));
    await db.$queryRaw`INSERT INTO "CatalogAttributeDefinition" (id,"categoryTemplateId",key,type,position) SELECT x.id::uuid,${id}::uuid,x.key,'MONEY',x.position FROM jsonb_to_recordset(${JSON.stringify(definitions)}::jsonb) AS x(id text,key text,position integer) RETURNING id`;
    return { id, definitions };
  }
  async function snapshot(categoryId: string, attributes: unknown, variants: unknown = []) {
    const id = randomUUID();
    const state = {
      schemaVersion: 1,
      id,
      categoryTemplateId: categoryId,
      text,
      sources: [],
      attributes,
      variants,
      identifiers: [],
    };
    await db.$queryRaw`INSERT INTO "CatalogEntry" (id,"categoryTemplateId",authored) VALUES (${id}::uuid,${categoryId}::uuid,${JSON.stringify({ text, sources: [] })}::jsonb) RETURNING id`;
    await db.$queryRaw`INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) VALUES (${id}::uuid,1,${JSON.stringify(state)}::jsonb) RETURNING "entryId"`;
    return id;
  }
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl });
    await db.$queryRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${actor},'Synthetic map moderator',${`${actor}@example.invalid`},false,now(),now()) RETURNING id`;
    await db.$queryRaw`INSERT INTO "ApplicationRoleGrant" ("userId",role,"grantedBy",reason) VALUES (${actor},'MODERATOR','synthetic fixture','Map conformance evidence only') RETURNING "userId"`;
    const t = await template(1);
    category = t.id;
    money = t.definitions[0]!.id;
    label = randomUUID();
    await db.$queryRaw`INSERT INTO "CatalogAttributeDefinition" (id,"categoryTemplateId",key,type,position) VALUES (${label}::uuid,${category}::uuid,'label','SHORT_TEXT',1) RETURNING id`;
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("matches exact single-fact reads and observes revocation without leaking evidence", async () => {
    const variant = { id: randomUUID() };
    const entryId = await snapshot(
      category,
      [
        { definitionId: money, key: "price_0", type: "MONEY", value: raw },
        { definitionId: label, key: "label", type: "SHORT_TEXT", value: "Not financial" },
      ],
      [
        {
          id: variant.id,
          text,
          sources: [],
          attributes: [
            {
              definitionId: money,
              key: "price_0",
              type: "MONEY",
              value: { ...raw, amountMinor: 200 },
            },
          ],
        },
      ],
    );
    const s = {
      family: "CATALOG" as const,
      entryId: entryId,
      revision: 1,
      target: { kind: "ENTRY" as const },
      definitionId: money,
    };
    const authored = await db.$transaction(async (tx) => {
      const m = moneyTransaction(tx);
      const current = await readMoneyFact(m, s, { userId: actor });
      return appendMoneyAssertion(
        m,
        await requireMoneyToken(m, s, { userId: actor }, current.factToken),
        {
          kind: "AUTHOR",
          receipt: parseLegacyMoneyAuthoring(authoring),
          correctionReason: "private synthetic correction note",
        },
      );
    });
    const map = () =>
      db.$transaction((tx) =>
        readCatalogMoneyMap(moneyTransaction(tx), entryId, 1, { userId: actor }),
      );
    const views = await map();
    expect(views).toHaveLength(2);
    expect(
      views.find((v) => v.subject.family === "CATALOG" && v.subject.target.kind === "ENTRY"),
    ).toEqual(authored);
    expect(JSON.stringify(views)).not.toContain("private synthetic correction note");
    const assertion = authored.interpretation;
    if (assertion.kind !== "INTERPRETED") throw Error("Expected actual authored native fact");
    await db.$transaction(async (tx) => {
      const m = moneyTransaction(tx);
      const a = await readMoneyAssertion(m, s, { userId: actor }, assertion.assertionId);
      await revokeMoneyAssertion(
        m,
        s,
        {
          assertionId: assertion.assertionId,
          expectedAssertionToken: a.expectedAssertionToken,
          reason: "Synthetic withdrawal",
        },
        { userId: actor },
      );
    });
    expect(
      (await map()).find((v) => v.subject.family === "CATALOG" && v.subject.target.kind === "ENTRY")
        ?.interpretation,
    ).toMatchObject({ kind: "UNKNOWN", reason: "REVOKED" });
  });
  it("keeps all 10100 supported snapshot paths with bounded database round trips", async () => {
    const t = await template(100);
    const attrs = t.definitions.map((d) => ({
      definitionId: d.id,
      key: d.key,
      type: "MONEY",
      value: raw,
    }));
    const id = await snapshot(
      t.id,
      attrs,
      Array.from({ length: 100 }, () => ({
        id: randomUUID(),
        text,
        sources: [],
        attributes: attrs,
      })),
    );
    let queries = 0;
    const views = await db.$transaction(
      (tx) => {
        const actual = moneyTransaction(tx);
        return readCatalogMoneyMap(
          {
            $queryRaw: (query) => {
              queries++;
              return actual.$queryRaw(query);
            },
          },
          id,
          1,
          { userId: actor },
        );
      },
      { timeout: 10000 },
    );
    expect(views).toHaveLength(10100);
    expect(queries).toBeLessThanOrEqual(22);
    expect(
      views.every((v) => v.raw?.amountMinor === "100" && v.interpretation.kind === "UNKNOWN"),
    ).toBe(true);
  });
  it("distinguishes an empty existing map from a nonexistent revision", async () => {
    const entryId = await snapshot(category, []);
    expect(
      await db.$transaction((tx) =>
        readCatalogMoneyMap(moneyTransaction(tx), entryId, 1, { userId: actor }),
      ),
    ).toEqual([]);
    await expect(
      db.$transaction((tx) =>
        readCatalogMoneyMap(moneyTransaction(tx), entryId, 99, { userId: actor }),
      ),
    ).rejects.toMatchObject({ code: "MONEY_NOT_FOUND" });
  });
  it("rejects ambiguous variant identities even if their money definitions do not overlap", async () => {
    const variantId = randomUUID();
    const id = await snapshot(
      category,
      [],
      [
        {
          id: variantId,
          text,
          attributes: [{ definitionId: money, key: "price_0", type: "MONEY", value: raw }],
        },
        { id: variantId, text, attributes: [] },
      ],
    );
    await expect(
      db.$transaction((tx) => readCatalogMoneyMap(moneyTransaction(tx), id, 1, { userId: actor })),
    ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
  });
  it("fails closed on malformed stored arrays instead of exposing a database exception", async () => {
    for (const [attributes, variants] of [
      [{}, []],
      [[], {}],
    ]) {
      const id = await snapshot(category, attributes, variants);
      await expect(
        db.$transaction((tx) =>
          readCatalogMoneyMap(moneyTransaction(tx), id, 1, { userId: actor }),
        ),
      ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
    }
  });
  it("authors, carries a direct origin, and invalidates equal raw money without changing snapshots", async () => {
    const id = await snapshot(category, [
      { definitionId: money, key: "price_0", type: "MONEY", value: raw },
    ]);
    const target = { kind: "ENTRY" };
    const receipt = parseLegacyMoneyAuthoring(authoring);
    const apply = (destinationRevision: number, sourceRevision: number | null, actions: object[]) =>
      db.$transaction((tx) =>
        applyCatalogMoneyRevision(
          moneyTransaction(tx),
          { userId: actor },
          { entryId: id, destinationRevision, sourceRevision, actions },
        ),
      );
    await apply(1, null, [{ target, definitionId: money, op: "AUTHOR", receipt }]);
    await db.$queryRaw`INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) SELECT "entryId",2,snapshot FROM "CatalogRevision" WHERE "entryId"=${id}::uuid AND revision=1 RETURNING revision`;
    await db.$queryRaw`UPDATE "CatalogEntry" SET revision=2 WHERE id=${id}::uuid RETURNING id`;
    const read = (revision: number) =>
      db.$transaction((tx) =>
        readCatalogMoneyMap(moneyTransaction(tx), id, revision, { userId: actor }),
      );
    const first = (await read(1))[0]!;
    await apply(2, 1, [
      { target, definitionId: money, op: "COPY", expectedFactToken: first.factToken },
    ]);
    const second = (await read(2))[0]!;
    expect(first.interpretation.kind).toBe("INTERPRETED");
    expect(second.interpretation).toMatchObject({
      kind: "INTERPRETED",
      assertionId:
        first.interpretation.kind === "INTERPRETED" ? first.interpretation.assertionId : "missing",
      decimal: "1.00",
    });
    expect(second.factToken).not.toBe(first.factToken);
    await apply(2, null, [{ target, definitionId: money, op: "RAW_WRITE" }]);
    expect((await read(2))[0]!.interpretation).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
    const unknown = (await read(2))[0]!;
    await apply(1, 2, [
      { target, definitionId: money, op: "COPY", expectedFactToken: unknown.factToken },
    ]);
    expect((await read(1))[0]!.interpretation.kind).toBe("UNKNOWN");
    const rows = await db.$queryRaw<
      Array<{ count: number; identical: boolean }>
    >`SELECT count(*)::integer AS count, count(DISTINCT snapshot)=1 AS identical FROM "CatalogRevision" WHERE "entryId"=${id}::uuid`;
    expect(rows).toEqual([{ count: 2, identical: true }]);
  });
  it("rejects stale same-raw interpretation tokens and non-moderator writes before any event is inserted", async () => {
    const id = await snapshot(category, [
      { definitionId: money, key: "price_0", type: "MONEY", value: raw },
    ]);
    await db.$queryRaw`INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) SELECT "entryId",2,snapshot FROM "CatalogRevision" WHERE "entryId"=${id}::uuid AND revision=1 RETURNING revision`;
    const receipt = parseLegacyMoneyAuthoring(authoring),
      target = { kind: "ENTRY" };
    const old = await db.$transaction((tx) =>
      readCatalogMoneyMap(moneyTransaction(tx), id, 1, { userId: actor }),
    );
    await db.$transaction((tx) =>
      applyCatalogMoneyRevision(
        moneyTransaction(tx),
        { userId: actor },
        {
          entryId: id,
          destinationRevision: 1,
          sourceRevision: null,
          actions: [{ target, definitionId: money, op: "AUTHOR", receipt }],
        },
      ),
    );
    await expect(
      db.$transaction((tx) =>
        applyCatalogMoneyRevision(
          moneyTransaction(tx),
          { userId: actor },
          {
            entryId: id,
            destinationRevision: 2,
            sourceRevision: 1,
            actions: [
              { target, definitionId: money, op: "COPY", expectedFactToken: old[0]!.factToken },
            ],
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
    await expect(
      db.$transaction((tx) =>
        applyCatalogMoneyRevision(
          moneyTransaction(tx),
          { userId: "no-authority" },
          {
            entryId: id,
            destinationRevision: 2,
            sourceRevision: null,
            actions: [{ target, definitionId: money, op: "AUTHOR", receipt }],
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    expect(
      await db.$queryRaw`SELECT id FROM "CatalogMoneyInterpretationEvent" WHERE "entryId"=${id}::uuid AND revision=2`,
    ).toEqual([]);
  });
  it("allows actorless legacy invalidation only, never authoring or interpretation carry", async () => {
    const id = await snapshot(category, [
      { definitionId: money, key: "price_0", type: "MONEY", value: raw },
    ]);
    const target = { kind: "ENTRY" };
    await db.$transaction((tx) =>
      applyCatalogMoneyRevision(moneyTransaction(tx), null, {
        entryId: id,
        sourceRevision: null,
        destinationRevision: 1,
        actions: [{ target, definitionId: money, op: "RAW_WRITE" }],
      }),
    );
    const views = await db.$transaction((tx) =>
      readCatalogMoneyMap(moneyTransaction(tx), id, 1, { userId: actor }),
    );
    expect(views[0]!.interpretation).toEqual({ kind: "UNKNOWN", reason: "RAW_WRITER" });
    await expect(
      db.$transaction((tx) =>
        applyCatalogMoneyRevision(moneyTransaction(tx), null, {
          entryId: id,
          sourceRevision: null,
          destinationRevision: 1,
          actions: [
            {
              target,
              definitionId: money,
              op: "AUTHOR",
              receipt: parseLegacyMoneyAuthoring(authoring),
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
    await expect(
      db.$transaction((tx) =>
        applyCatalogMoneyRevision(moneyTransaction(tx), null, {
          entryId: id,
          sourceRevision: 1,
          destinationRevision: 1,
          actions: [
            { target, definitionId: money, op: "COPY", expectedFactToken: views[0]!.factToken },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "MONEY_FORBIDDEN" });
  });
  it("verifies retained meaning without appending an event and checks replacement tokens", async () => {
    const id = await snapshot(category, [
      { definitionId: money, key: "price_0", type: "MONEY", value: raw },
    ]);
    const target = { kind: "ENTRY" };
    const read = () =>
      db.$transaction((tx) => readCatalogMoneyMap(moneyTransaction(tx), id, 1, { userId: actor }));
    const first = (await read())[0]!;
    const apply = (action: object) =>
      db.$transaction((tx) =>
        applyCatalogMoneyRevision(
          moneyTransaction(tx),
          { userId: actor },
          {
            entryId: id,
            sourceRevision: 1,
            destinationRevision: 1,
            actions: [{ target, definitionId: money, ...action }],
          },
        ),
      );
    await apply({ op: "VERIFY", expectedFactToken: first.factToken });
    expect((await read())[0]).toEqual(first);
    await apply({
      op: "AUTHOR",
      expectedFactToken: first.factToken,
      receipt: parseLegacyMoneyAuthoring(authoring),
    });
    const authored = (await read())[0]!;
    await expect(
      apply({
        op: "AUTHOR",
        expectedFactToken: first.factToken,
        receipt: parseLegacyMoneyAuthoring(authoring),
      }),
    ).rejects.toMatchObject({ code: "MONEY_CONFLICT" });
    await apply({ op: "VERIFY", expectedFactToken: authored.factToken });
    expect((await read())[0]).toEqual(authored);
  });
  it("observes fresh erasure before acquiring direct-origin locks and rolls back the destination", async () => {
    const id = await snapshot(category, [
      { definitionId: money, key: "price_0", type: "MONEY", value: raw },
    ]);
    const s = {
      family: "CATALOG" as const,
      entryId: id,
      revision: 1,
      target: { kind: "ENTRY" as const },
      definitionId: money,
    };
    const classified = await db.$transaction(async (tx) => {
      const m = moneyTransaction(tx),
        current = await readMoneyFact(m, s, { userId: actor });
      return appendMoneyAssertion(
        m,
        await requireMoneyToken(m, s, { userId: actor }, current.factToken),
        {
          kind: "CLASSIFY",
          input: {
            expectedFactToken: current.factToken,
            exponent: 2,
            unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
            evidence: {
              category: "OPERATOR_VERIFIED_RECORD",
              reason: "Private source evidence",
              reference: "PRIVATE-SYNTHETIC-RECORD",
            },
          },
        },
      );
    });
    await db.$queryRaw`INSERT INTO "CatalogRevision" ("entryId",revision,snapshot) SELECT "entryId",2,snapshot FROM "CatalogRevision" WHERE "entryId"=${id}::uuid AND revision=1 RETURNING revision`;
    let enter!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const applying = db
      .$transaction(
        (tx) => {
          const actual = moneyTransaction(tx);
          return applyCatalogMoneyRevision(
            {
              $queryRaw: async (query) => {
                if (query.sql.includes("FOR SHARE OF e")) {
                  enter();
                  await held;
                }
                return actual.$queryRaw(query);
              },
            },
            { userId: actor },
            {
              entryId: id,
              sourceRevision: 1,
              destinationRevision: 2,
              actions: [
                {
                  target: s.target,
                  definitionId: money,
                  op: "COPY",
                  expectedFactToken: classified.factToken,
                },
              ],
            },
          );
        },
        { timeout: 10000 },
      )
      .then(
        () => ({ success: true as const }),
        (error) => ({ error }),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        reached,
        applying.then(() => {
          throw Error("Batch settled before its native origin-lock gate");
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("Native origin-lock gate timeout")), 2000);
        }),
      ]);
      await db.$transaction((tx) =>
        eraseMoneyEvidenceForActor(moneyTransaction(tx), { userId: actor }, actor),
      );
    } finally {
      if (timer) clearTimeout(timer);
      release();
    }
    expect(await applying).toMatchObject({ error: { code: "MONEY_CONFLICT" } });
    expect(
      await db.$queryRaw`SELECT id FROM "CatalogMoneyInterpretationEvent" WHERE "entryId"=${id}::uuid AND revision=2`,
    ).toEqual([]);
  });
  it("rolls back all earlier chunks when a later native batch fails", async () => {
    const t = await template(100);
    const attrs = t.definitions.map((d) => ({
      definitionId: d.id,
      key: d.key,
      type: "MONEY",
      value: raw,
    }));
    const variants = Array.from({ length: 5 }, () => ({
      id: randomUUID(),
      text,
      attributes: attrs,
    }));
    const id = await snapshot(t.id, attrs, variants);
    const receipt = parseLegacyMoneyAuthoring(authoring);
    const actions = [
      ...attrs.map((a) => ({
        target: { kind: "ENTRY" },
        definitionId: a.definitionId,
        op: "AUTHOR",
        receipt,
      })),
      ...variants.flatMap((v) =>
        attrs.map((a) => ({
          target: { kind: "VARIANT", variantId: v.id },
          definitionId: a.definitionId,
          op: "AUTHOR",
          receipt,
        })),
      ),
    ];
    let batches = 0;
    await expect(
      db.$transaction(
        (tx) => {
          const actual = moneyTransaction(tx);
          return applyCatalogMoneyRevision(
            {
              $queryRaw: (query) => {
                if (query.sql.includes('INSERT INTO "CatalogMoneyInterpretationEvent"')) {
                  batches++;
                  if (batches === 2) throw Error("synthetic later chunk failure");
                }
                return actual.$queryRaw(query);
              },
            },
            { userId: actor },
            { entryId: id, sourceRevision: null, destinationRevision: 1, actions },
          );
        },
        { timeout: 15000 },
      ),
    ).rejects.toThrow("synthetic later chunk failure");
    expect(batches).toBe(2);
    expect(
      await db.$queryRaw`SELECT id FROM "CatalogMoneyInterpretationEvent" WHERE "entryId"=${id}::uuid`,
    ).toEqual([]);
  });
  it("writes all 10100 supported money paths in native batches of at most 500", async () => {
    const t = await template(100);
    const attrs = t.definitions.map((d) => ({
      definitionId: d.id,
      key: d.key,
      type: "MONEY",
      value: raw,
    }));
    const variants = Array.from({ length: 100 }, () => ({
      id: randomUUID(),
      text,
      attributes: attrs,
    }));
    const id = await snapshot(t.id, attrs, variants);
    const receipt = parseLegacyMoneyAuthoring(authoring);
    const actions = [
      ...attrs.map((a) => ({
        target: { kind: "ENTRY" },
        definitionId: a.definitionId,
        op: "AUTHOR",
        receipt,
      })),
      ...variants.flatMap((v) =>
        attrs.map((a) => ({
          target: { kind: "VARIANT", variantId: v.id },
          definitionId: a.definitionId,
          op: "AUTHOR",
          receipt,
        })),
      ),
    ];
    const batchSizes: number[] = [];
    const start = performance.now();
    await db.$transaction(
      (tx) => {
        const actual = moneyTransaction(tx);
        return applyCatalogMoneyRevision(
          {
            $queryRaw: (query) => {
              if (query.sql.includes('INSERT INTO "CatalogMoneyInterpretationEvent"'))
                batchSizes.push(query.values.length / 18);
              return actual.$queryRaw(query);
            },
          },
          { userId: actor },
          { entryId: id, sourceRevision: null, destinationRevision: 1, actions },
        );
      },
      { timeout: 120000 },
    );
    const views = await db.$transaction(
      (tx) => readCatalogMoneyMap(moneyTransaction(tx), id, 1, { userId: actor }),
      { timeout: 10000 },
    );
    expect(views).toHaveLength(10100);
    expect(
      views.every(
        (v) => v.interpretation.kind === "INTERPRETED" && v.interpretation.decimal === "1.00",
      ),
    ).toBe(true);
    expect(batchSizes).toHaveLength(21);
    expect(batchSizes.every((n) => Number.isInteger(n) && n <= 500)).toBe(true);
    expect(batchSizes.reduce((sum, n) => sum + n, 0)).toBe(10100);
    console.info(
      JSON.stringify({
        check: "M4_NATIVE_MAX_MONEY_WRITE",
        paths: views.length,
        batches: batchSizes.length,
        elapsedMs: Math.round(performance.now() - start),
      }),
    );
  }, 140000);
});
