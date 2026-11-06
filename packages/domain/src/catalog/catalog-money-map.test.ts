import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import {
  readMoneyFact,
  readCatalogMoneyMap,
  requireMoneyToken,
  appendMoneyAssertion,
  readMoneyAssertion,
  revokeMoneyAssertion,
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
});
