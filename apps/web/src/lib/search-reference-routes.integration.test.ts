import {
  CollectionReferencesSchema,
  CollectionReferencePageSchema,
  CustomReferencePageSchema,
  CustomReferencesSchema,
  ConditionReferencePageSchema,
  ConditionReferencesSchema,
  CatalogDefinitionChoicesSchema,
  CatalogDefinitionReferenceSchema,
} from "@sammlerraum/contracts/search-references";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCollectionService } from "@sammlerraum/domain/collections/collection-service";
import { createCustomFieldService } from "@sammlerraum/domain/custom-fields/custom-field-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import {
  createSearchReferenceRouteDependencies,
  createSearchReferenceRouteHandlers,
} from "./search-reference-routes";
import {
  createCatalogLinkRouteDependencies,
  createCatalogLinkRouteHandlers,
} from "./catalog-link-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1",
  db = enabled ? createTestDatabaseClient() : undefined;
const owner = `ref_route_${randomUUID()}`,
  foreign = `ref_route_${randomUUID()}`,
  prefix = `ref_route_${randomUUID().replaceAll("-", "")}`,
  origin = "https://example.invalid";
let collection: string,
  other: string,
  definition: string,
  category: string,
  catalogDefinition: string;
const session = vi.fn(
  async (_input: unknown): Promise<{ user: { id: string } } | null> => ({ user: { id: owner } }),
);
const handlers = (family: "COLLECTIONS" | "CUSTOM_FIELDS" | "CONDITIONS" = "COLLECTIONS") =>
  createSearchReferenceRouteHandlers(
    createSearchReferenceRouteDependencies(db!, { api: { getSession: session } }, origin),
    family,
  );
function request(
  query = "",
  body?: string,
  requestOrigin: string | null = origin,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}/api/v1/search/references/collections${query}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(requestOrigin === null ? {} : { origin: requestOrigin }),
      "content-type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body }),
  });
}
async function check(response: Response, status: number, code?: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBeTruthy();
  const body = await response.json();
  if (code) expect(body).toMatchObject({ error: { code } });
  return body;
}
describe.runIf(enabled)("native bounded reference routes", () => {
  beforeAll(async () => {
    for (const id of [owner, foreign])
      await db!.user.create({
        data: { id, name: "Reference routes", email: `${id}@example.invalid`, emailVerified: true },
      });
    collection = (
      await createCollectionService(db!, owner).createCollection({ name: "Owned route label" })
    ).id;
    other = (
      await createCollectionService(db!, foreign).createCollection({
        name: "Hidden private label",
        visibility: "PUBLIC",
      })
    ).id;
    definition = (
      await createCustomFieldService(db!, owner).createFieldDefinition({
        collectionId: collection,
        name: "Route field",
        type: "SINGLE_SELECT",
        options: ["Authored"],
      })
    ).id;
    const c = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
      key: prefix,
      labels: { de: "Kategorie", en: "Category" },
      definitions: [
        {
          key: "finish",
          labels: { de: "Oberfläche", en: "Finish" },
          type: "SINGLE_SELECT",
          options: [{ key: "matte", labels: { de: "Matt", en: "Matte" } }],
        },
      ],
    });
    category = c.id;
    catalogDefinition = c.definitions[0]!.id;
  });
  beforeEach(() => {
    session.mockReset();
    session.mockResolvedValue({ user: { id: owner } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: [owner, foreign] } } });
    await db.categoryTemplate.deleteMany({ where: { key: prefix } });
    await db.$disconnect();
  });
  it("authenticates fresh and returns closed available/unavailable input order", async () => {
    const result = CollectionReferencesSchema.parse(
      await check(
        await handlers().POST(request("", JSON.stringify({ ids: [other, collection] }))),
        200,
      ),
    );
    expect(result.references).toEqual([
      { id: other, state: "UNAVAILABLE", collection: null },
      {
        id: collection,
        state: "AVAILABLE",
        collection: { id: collection, name: "Owned route label" },
      },
    ]);
    expect(session).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
    );
    expect(JSON.stringify(result)).not.toContain("Hidden private label");
    const list = CollectionReferencePageSchema.parse(
      await check(await handlers().GET(request()), 200),
    );
    expect(list.collections).toEqual([{ id: collection, name: "Owned route label" }]);
  });
  it("serves all six bounded family methods", async () => {
    const fields = CustomReferencePageSchema.parse(
      await check(await handlers("CUSTOM_FIELDS").GET(request(`?collectionId=${collection}`)), 200),
    );
    expect(fields.definitions).toHaveLength(1);
    const custom = CustomReferencesSchema.parse(
      await check(
        await handlers("CUSTOM_FIELDS").POST(
          request(
            "",
            JSON.stringify({ references: [[collection, definition]], detail: "OPTIONS" }),
          ),
        ),
        200,
      ),
    );
    expect(custom.references[0]).toMatchObject({ definition: { options: ["Authored"] } });
    const conditions = ConditionReferencePageSchema.parse(
      await check(await handlers("CONDITIONS").GET(request(`?categoryId=${category}`)), 200),
    );
    expect(conditions.scheme).toBeNull();
    const resolved = ConditionReferencesSchema.parse(
      await check(
        await handlers("CONDITIONS").POST(
          request("", JSON.stringify({ references: [[category, null]] })),
        ),
        200,
      ),
    );
    expect(resolved.references[0]).toMatchObject({
      state: "AVAILABLE",
      category: { id: category },
      scheme: null,
      option: null,
    });
  });
  it("checks exact Origin before session and authentication before schema", async () => {
    for (const bad of [null, "https://other.invalid", `${origin}/`])
      await check(await handlers().POST(request("", '{"ids":[]}', bad)), 403, "FORBIDDEN");
    expect(session).not.toHaveBeenCalled();
    session.mockResolvedValue(null);
    await check(
      await handlers().POST(request("?unknown=secret", '{"ids":[]}')),
      401,
      "UNAUTHORIZED",
    );
    await check(await handlers().GET(request("?limit=bad")), 401, "UNAUTHORIZED");
  });
  it.each([
    "?limit=0",
    "?limit=51",
    "?limit=1.5",
    "?limit=01",
    "?limit=1&limit=2",
    "?limit=1&l%69mit=2",
    "?owner=secret",
    "?collectionId=secret",
    "?cursor=%FF",
    "?cursor=%",
    "?cursor=%C0%AF",
    "?limit=1&&cursor=a",
  ])("strict raw GET rejects %s", async (query) => {
    await check(await handlers().GET(request(query)), 400, "SEARCH_INVALID");
  });
  it("rejects query byte overflow and closed scoped-parent errors", async () => {
    await check(
      await handlers().GET(request(`?cursor=${"a".repeat(32768)}`)),
      414,
      "SEARCH_QUERY_TOO_LARGE",
    );
    await check(
      await handlers("CUSTOM_FIELDS").GET(request(`?collectionId=${other}`)),
      422,
      "FILTER_REFERENCE_INVALID",
    );
    await check(
      await handlers("CUSTOM_FIELDS").GET(request("?collectionId=bad")),
      400,
      "SEARCH_INVALID",
    );
    await check(
      await handlers("CONDITIONS").GET(request(`?categoryId=${randomUUID()}`)),
      422,
      "FILTER_REFERENCE_INVALID",
    );
  });
  it.each([
    '{"ids":[],"i\\u0064s":[]}',
    '{"ids":[{}]}',
    '{"ids":[[["x"]]]}',
    '{"ids":null}',
    '{"ids":[]}',
    '{"owner":"secret"}',
    "null",
    "[]",
    "{}{}",
    '{"ids":[],}',
  ])("rejects strict POST body %s", async (body) => {
    await check(await handlers().POST(request("", body)), 400, "SEARCH_INVALID");
  });
  it("rejects query-bearing POST, duplicate normalized IDs, 51 IDs and OPTIONS3", async () => {
    await check(
      await handlers().POST(request("?limit=1", JSON.stringify({ ids: [collection] }))),
      400,
      "SEARCH_INVALID",
    );
    for (const ids of [
      [collection, collection.toUpperCase()],
      Array.from({ length: 51 }, () => randomUUID()),
    ])
      await check(
        await handlers().POST(request("", JSON.stringify({ ids }))),
        400,
        "SEARCH_INVALID",
      );
    await check(
      await handlers("CUSTOM_FIELDS").POST(
        request(
          "",
          JSON.stringify({
            references: Array.from({ length: 3 }, () => [collection, randomUUID()]),
            detail: "OPTIONS",
          }),
        ),
      ),
      400,
      "SEARCH_INVALID",
    );
    await check(
      await handlers().POST(
        request("", JSON.stringify({ ids: [collection] }), origin, {
          "content-type": "text/plain",
        }),
      ),
      400,
      "SEARCH_INVALID",
    );
    await check(
      await handlers().POST(request("", " ".repeat(32769), origin, { "content-length": "2" })),
      413,
      "UPLOAD_TOO_LARGE",
    );
  });
  it("maps native corruption and explicit capacity failure without leaking labels or SQL", async () => {
    const secret = "sensitive fixture label";
    await db!.collection.update({ where: { id: collection }, data: { name: secret.repeat(100) } });
    const corrupt = await check(
      await handlers().POST(request("", JSON.stringify({ ids: [collection] }))),
      500,
      "SEARCH_INVARIANT",
    );
    expect(JSON.stringify(corrupt)).not.toContain(secret);
    expect(JSON.stringify(corrupt)).not.toContain("SELECT");
    await db!.collection.update({ where: { id: collection }, data: { name: "Owned route label" } });
    await db!.customFieldOption.createMany({
      data: Array.from({ length: 100 }, (_, n) => ({
        fieldDefinitionId: definition,
        value: `Extra ${n}`,
        normalizedValue: `extra ${n}`,
        position: n + 1,
      })),
    });
    await check(
      await handlers("CUSTOM_FIELDS").POST(
        request("", JSON.stringify({ references: [[collection, definition]], detail: "OPTIONS" })),
      ),
      503,
      "SEARCH_UNAVAILABLE",
    );
  });
  it("exposes two exact catalog picker modes with unchanged omitted-view/error behavior", async () => {
    const api = createCatalogLinkRouteHandlers(
      createCatalogLinkRouteDependencies(db!, { api: { getSession: session } }, origin),
    );
    const choices = CatalogDefinitionChoicesSchema.parse(
      await check(await api.CATEGORY(request("?view=definitions"), category), 200),
    );
    expect(choices.definitions).toHaveLength(1);
    expect(choices.definitions[0]).not.toHaveProperty("options");
    const selected = CatalogDefinitionReferenceSchema.parse(
      await check(
        await api.CATEGORY(request(`?view=definition&definitionId=${catalogDefinition}`), category),
        200,
      ),
    );
    expect(selected.definition).toMatchObject({
      key: "finish",
      labels: { de: "Oberfläche", en: "Finish" },
      options: [{ key: "matte", labels: { de: "Matt", en: "Matte" } }],
    });
    const legacy = await check(await api.CATEGORY(request(), category), 200);
    expect(legacy).toMatchObject({ category: { definitions: [{ options: [{ key: "matte" }] }] } });
    await check(await api.CATEGORY(request(), randomUUID()), 404, "NOT_FOUND");
    await check(
      await api.CATEGORY(request("?view=definitions"), randomUUID()),
      422,
      "FILTER_REFERENCE_INVALID",
    );
    await check(
      await api.CATEGORY(request(`?view=definition&definitionId=${randomUUID()}`), category),
      422,
      "FILTER_REFERENCE_INVALID",
    );
    for (const query of [
      "?view=definitions&definitionId=bad",
      "?view=definition",
      "?view=bogus",
      "?view=definitions&view=definition",
      "?view=definitions&%FF=x",
      "?view=definitions&owner=x",
    ])
      await check(await api.CATEGORY(request(query), category), 400, "SEARCH_INVALID");
    await check(await api.CATEGORY(request("?view=definitions"), "bad"), 400, "SEARCH_INVALID");
    await check(await api.CATEGORY(request(), "bad"), 404, "NOT_FOUND");
  });
});
