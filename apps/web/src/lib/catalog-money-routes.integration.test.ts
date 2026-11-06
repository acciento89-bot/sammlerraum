import { z } from "zod";
import {
  CatalogMoneyRevisionResultSchema,
  CatalogMoneyHistoryResultSchema,
} from "@sammlerraum/contracts/catalog-money";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import {
  createCatalogMoneyRouteDependencies,
  createCatalogMoneyRouteHandlers,
} from "./catalog-money-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
let category: string, definitionId: string;
const moderator = randomUUID(),
  owner = randomUUID(),
  origin = "http://localhost:3000";
const text = { language: "en", title: "Synthetic HTTP finance" };
const req = (method: string, body?: unknown, query = "", suppliedOrigin = origin) =>
  new Request(`${origin}/api/v1/catalog/money${query}`, {
    method,
    headers: { origin: suppliedOrigin, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
let actor: string | null = moderator,
  sessionReads = 0;
const auth = {
  api: {
    getSession: async (input: { query?: unknown }) => {
      sessionReads++;
      expect(input.query).toEqual({ disableCookieCache: true, disableRefresh: true });
      return actor ? { user: { id: actor } } : null;
    },
  },
};
const api = () =>
  createCatalogMoneyRouteHandlers(createCatalogMoneyRouteDependencies(db, auth, origin));
const create = () =>
  createCatalogMaintenanceService(db).createCatalogEntry({
    categoryTemplateId: category,
    text,
    attributes: [{ definitionId, value: { amountMinor: 100, currency: "AFN" } }],
  });
describe.runIf(enabled)("catalog money HTTP native boundary", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    await db.user.createMany({
      data: [moderator, owner].map((id) => ({
        id,
        name: "Synthetic HTTP actor",
        email: `${id}@example.invalid`,
      })),
    });
    await db.applicationRoleGrant.create({
      data: {
        userId: moderator,
        role: "MODERATOR",
        grantedBy: "synthetic fixture",
        reason: "HTTP proof",
      },
    });
    const c = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
      key: `http_money_${moderator.replaceAll("-", "")}`,
      labels: { de: "Test", en: "Test" },
      definitions: [{ key: "price", type: "MONEY", labels: { de: "Preis", en: "Price" } }],
    });
    category = c.id;
    definitionId = c.definitions[0]!.id;
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("reads public-safe revision money, classifies, privately audits and revokes with fresh sessions", async () => {
    actor = moderator;
    const entry = await create(),
      id = entry.state.id,
      h = api();
    const read = await h.READ(req("GET"), id, "1");
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(read.headers.get("x-request-id")).toBeTruthy();
    const before = CatalogMoneyRevisionResultSchema.parse(await read.json());
    const classified = await h.CLASSIFY(
      req("POST", {
        schemaVersion: 1,
        target: { kind: "ENTRY" },
        definitionId,
        input: {
          expectedFactToken: before.money[0]!.factToken,
          exponent: 0,
          unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
          evidence: {
            category: "OPERATOR_VERIFIED_RECORD",
            reason: "Private HTTP record",
            reference: "PRIVATE-HTTP-REF",
          },
        },
      }),
      id,
      "1",
    );
    expect(classified.status).toBe(201);
    const history = await h.HISTORY(
      req("GET", undefined, `?target=ENTRY&definitionId=${definitionId}`),
      id,
      "1",
    );
    expect(history.status).toBe(200);
    const records = CatalogMoneyHistoryResultSchema.parse(await history.json());
    expect(records.events[0]!.reason).toBe("Private HTTP record");
    actor = owner;
    const publicRead = await h.READ(req("GET"), id, "1");
    expect(await publicRead.text()).not.toContain("PRIVATE-HTTP-REF");
    expect(
      (
        await h.HISTORY(
          req("GET", undefined, `?target=ENTRY&definitionId=${definitionId}`),
          id,
          "1",
        )
      ).status,
    ).toBe(403);
    actor = moderator;
    const event = records.events[0]!;
    expect(
      (
        await h.REVOKE(
          req("POST", {
            schemaVersion: 1,
            target: { kind: "ENTRY" },
            definitionId,
            input: {
              assertionId: event.id,
              expectedAssertionToken: event.expectedAssertionToken,
              reason: "HTTP withdrawal",
            },
          }),
          id,
          "1",
        )
      ).status,
    ).toBe(200);
    actor = null;
    expect((await h.READ(req("GET"), id, "1")).status).toBe(401);
    actor = moderator;
  });
  it("queues explicit authoring without applying it and keeps legacy quota/shared audit", async () => {
    actor = owner;
    const h = api();
    const response = await h.SUBMIT(
      req("POST", {
        proposal: {
          targetEntryId: null,
          baseRevision: null,
          summary: "Explicit native HTTP proposal",
          patch: {
            kind: "CREATE_ENTRY",
            input: {
              categoryTemplateId: category,
              text,
              attributes: [{ definitionId, value: { amountMinor: 100, currency: "AFN" } }],
            },
          },
        },
        money: {
          schemaVersion: 1,
          intents: [
            {
              target: "ENTRY",
              definitionId,
              intent: {
                op: "NEW",
                authoring: {
                  kind: "DECIMAL",
                  profileId: "legacy-money-iso-2026-09-17-v1",
                  currency: "AFN",
                  decimal: "1",
                },
              },
            },
          ],
        },
      }),
    );
    expect(response.status).toBe(201);
    const value = z
      .object({ proposal: z.object({ state: z.string() }) })
      .parse(await response.json());
    expect(value.proposal.state).toBe("PENDING");
    expect(await db.catalogProposal.count({ where: { proposerId: owner } })).toBe(1);
    actor = moderator;
  });
  it("rejects foreign origins, ambiguous query/body keys, BOM and oversized streamed bytes", async () => {
    actor = moderator;
    const h = api(),
      entry = await create();
    const prior = sessionReads;
    expect((await h.SUBMIT(req("POST", {}, "", "https://foreign.invalid"))).status).toBe(403);
    expect(sessionReads).toBe(prior);
    for (const body of ['{"money":{"op":1,"\\u006fp":2}}', "\ufeff{}", '{"value":"\\ud800"}'])
      expect((await h.SUBMIT(req("POST", body))).status).toBe(400);
    expect((await h.SUBMIT(req("POST", "x".repeat(65537)))).status).toBe(413);
    for (const q of [
      `?target=ENTRY&definitionId=${definitionId}&limit=51`,
      `?target=ENTRY&target=ENTRY&definitionId=${definitionId}`,
      `?target=ENTRY&definitionId=${definitionId}&variantId=${randomUUID()}`,
    ])
      expect((await h.HISTORY(req("GET", undefined, q), entry.state.id, "1")).status).toBe(400);
    expect((await h.READ(req("GET"), entry.state.id, "1e0")).status).toBe(400);
  });
});
