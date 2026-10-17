import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService, ItemServiceError } from "@sammlerraum/domain/items/item-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCatalogLinkRouteDependencies,
  createCatalogLinkRouteHandlers,
} from "./catalog-link-routes";
import { createConditionRouteDependencies, createConditionRouteHandlers } from "./condition-routes";
import { createItemRouteHandlers } from "./collection-item-routes";
import { createManagementRouteDependencies } from "./management-route-dependencies";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `CatalogRouteOwner_${randomUUID()}`;
const prefix = `route_${randomUUID().replaceAll("-", "")}`;
const origin = "https://sammlerraum.example";
let collectionId: string;
let itemId: string;
let entryId: string;
let variantId: string;
let categoryId: string;
const session = vi.fn(
  async (_input: unknown): Promise<{ user: { id: string } } | null> => ({ user: { id: ownerId } }),
);
const auth = { api: { getSession: session } };
const handlers = () =>
  createCatalogLinkRouteHandlers(createCatalogLinkRouteDependencies(db!, auth, origin));
const request = (
  method = "GET",
  body?: unknown,
  path = "/",
  requestOrigin: string | null = origin,
) =>
  new Request(`${origin}${path}`, {
    method,
    headers: {
      ...(requestOrigin === null ? {} : { origin: requestOrigin }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe.runIf(enabled)("catalog link and canonical read routes PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: {
        id: ownerId,
        name: "Catalog routes",
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    collectionId = (
      await db!.collection.create({
        data: { ownerId, name: "Catalog routes", visibility: "PUBLIC" },
      })
    ).id;
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: prefix,
        labels: { de: "Kategorie", en: "Category" },
      })
    ).id;
    const entry = await createCatalogMaintenanceService(db!).createCatalogEntry({
      categoryTemplateId: categoryId,
      text: { language: "en", title: prefix },
    });
    entryId = entry.state.id;
    variantId = (
      await createCatalogMaintenanceService(db!).addCatalogVariant(entryId, 1, {
        text: { language: "en", title: "Distinct" },
        edition: "First",
        reference: "001",
      })
    ).id;
  });
  beforeEach(async () => {
    session.mockReset();
    session.mockResolvedValue({ user: { id: ownerId } });
    itemId = (
      await createItemService(db!, ownerId).createItem({
        collectionId,
        title: "Personal",
        visibility: "PUBLIC",
        privateNotes: "private",
        quantity: 3,
      })
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: ownerId } });
    const entries = await db.catalogEntry.findMany({
      where: { categoryTemplate: { key: prefix } },
      select: { id: true },
    });
    const ids = entries.map(({ id }) => id);
    await db.catalogAttributeValue.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogExternalIdentifier.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogVariant.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogRevision.deleteMany({ where: { entryId: { in: ids } } });
    await db.catalogEntry.deleteMany({ where: { id: { in: ids } } });
    await db.categoryTemplate.deleteMany({ where: { key: prefix } });
    await db.$disconnect();
  });
  it("persists owner links, fresh sessions and actual item reads/splits; unlink retains category", async () => {
    const api = handlers();
    const linked = await api.PUT_LINK(
      request("PUT", { entryId: entryId.toUpperCase(), variantId: variantId.toUpperCase() }),
      itemId.toUpperCase(),
    );
    expect(linked.status).toBe(200);
    expect(linked.headers.get("cache-control")).toBe("no-store");
    expect(await linked.json()).toMatchObject({
      item: {
        id: itemId,
        catalogEntryId: entryId,
        catalogVariantId: variantId,
        categoryTemplateId: categoryId,
      },
    });
    expect(session).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
    );
    expect(await (await api.GET_LINK(request(), itemId)).json()).toMatchObject({
      link: {
        itemId,
        entry: { revision: 2 },
        variant: { active: true, edition: "First", reference: "001" },
      },
    });
    const itemApi = createItemRouteHandlers(createManagementRouteDependencies(db!, auth, origin));
    expect(await (await itemApi.GET_ITEM(request(), itemId)).json()).toMatchObject({
      item: { catalogEntryId: entryId, catalogVariantId: variantId },
    });
    const split = await itemApi.SPLIT_ITEM(request("POST", { quantity: 1 }), itemId);
    expect(split.status).toBe(201);
    expect(await split.json()).toMatchObject({
      result: { source: { catalogEntryId: entryId }, created: { catalogVariantId: variantId } },
    });
    const changedCategory = await createConditionRouteHandlers(
      createConditionRouteDependencies(db!, auth, origin),
    ).PUT_CATEGORY(request("PUT", { categoryTemplateId: null, clearCondition: true }), itemId);
    expect(changedCategory.status).toBe(409);
    const unlinked = await api.DELETE_LINK(request("DELETE"), itemId);
    expect(unlinked.status).toBe(200);
    expect(await unlinked.json()).toMatchObject({
      item: {
        catalogEntryId: null,
        catalogVariantId: null,
        categoryTemplateId: categoryId,
        privateNotes: "private",
      },
    });
  });
  it("authenticates all canonical reads while returning only canonical bounded projections", async () => {
    const api = handlers();
    const search = await api.SEARCH(
      request("GET", undefined, `/api/v1/catalog/search?mode=text&q=${prefix}&limit=1`),
    );
    expect(search.status).toBe(200);
    expect(search.headers.get("cache-control")).toBe("no-store");
    expect(await search.json()).toMatchObject({
      results: [{ id: entryId, category: { id: categoryId } }],
      nextCursor: null,
    });
    expect(await (await api.CATEGORIES(request())).json()).toMatchObject({
      categories: expect.any(Array),
    });
    expect(await (await api.CATEGORY(request(), categoryId)).json()).toMatchObject({
      category: { id: categoryId, definitions: [] },
    });
    expect(await (await api.ENTRY(request(), entryId)).json()).toMatchObject({
      entry: { revision: 2, state: { id: entryId } },
    });
    session.mockResolvedValue(null);
    for (const response of [
      await api.SEARCH(request()),
      await api.CATEGORIES(request()),
      await api.CATEGORY(request(), categoryId),
      await api.ENTRY(request(), entryId),
      await api.GET_LINK(request(), itemId),
    ]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("rejects foreign/deleted/inactive mutations and forged Origin without consuming input", async () => {
    const api = handlers();
    expect(
      (await api.PUT_LINK(request("PUT", { entryId }, "/", "https://foreign.invalid"), itemId))
        .status,
    ).toBe(403);
    expect((await api.DELETE_LINK(request("DELETE", undefined, "/", null), itemId)).status).toBe(
      403,
    );
    session.mockResolvedValue({ user: { id: ownerId.toLowerCase() } });
    for (const response of [
      await api.GET_LINK(request(), itemId),
      await api.PUT_LINK(request("PUT", { entryId }), itemId),
      await api.DELETE_LINK(request("DELETE"), itemId),
    ])
      expect(response.status).toBe(404);
    session.mockResolvedValue({ user: { id: ownerId } });
    await createItemService(db!, ownerId).archiveItem(itemId);
    expect((await api.PUT_LINK(request("PUT", { entryId }), itemId)).status).toBe(409);
    expect((await api.DELETE_LINK(request("DELETE"), itemId)).status).toBe(409);
    expect((await api.GET_LINK(request(), itemId)).status).toBe(200);
    await createItemService(db!, ownerId).deleteItem(itemId);
    expect((await api.GET_LINK(request(), itemId)).status).toBe(404);
  });
  it("accepts an empty DELETE stream emitted by a browser adapter", async () => {
    await createItemService(db!, ownerId).linkItemToCatalog(itemId, entryId, variantId);
    const response = await handlers().DELETE_LINK(
      new Request(origin, {
        method: "DELETE",
        headers: { origin, "content-length": "0" },
        body: "",
      }),
      itemId,
    );
    expect(response.status).toBe(200);
    expect(
      (await createItemService(db!, ownerId).getItemCatalogLink(itemId)).catalogEntryId,
    ).toBeNull();
  });
  it("strictly bounds streamed JSON, rejects malformed IDs, unexpected DELETE bodies and query ambiguity", async () => {
    const api = handlers();
    for (const body of [
      { entryId, ownerId },
      { entryId, categoryTemplateId: categoryId },
      { entryId: "bad" },
      { variantId },
    ])
      expect((await api.PUT_LINK(request("PUT", body), itemId)).status).toBe(400);
    expect((await api.GET_LINK(request(), "bad")).status).toBe(404);
    expect((await api.DELETE_LINK(request("DELETE", {}), itemId)).status).toBe(400);
    const oversized = new Request(`${origin}/`, {
      method: "PUT",
      headers: { origin, "content-type": "application/json", "content-length": "1" },
      body: JSON.stringify({ entryId, filler: "x".repeat(3000) }),
    });
    expect((await api.PUT_LINK(oversized, itemId)).status).toBe(413);
    const invalidUtf8 = new Request(`${origin}/`, {
      method: "PUT",
      headers: { origin, "content-type": "application/json" },
      body: new Uint8Array([0xff]),
    });
    expect((await api.PUT_LINK(invalidUtf8, itemId)).status).toBe(400);
    for (const query of [
      "mode=text&q=ab&q=cd",
      "mode=text&q=ab&ownerId=x",
      "mode=text&q=ab&limit=51",
      "mode=text&q=ab&limit=1.5",
      "mode=text&q=ab&cursor=broken",
      "mode=text&q=a",
      "mode=text&q=ab&namespace=fixture",
      `mode=text&q=${"x".repeat(8200)}`,
    ])
      expect((await api.SEARCH(request("GET", undefined, `/?${query}`))).status).toBe(400);
    expect((await api.CATEGORIES(request("GET", undefined, "/?limit=1&limit=2"))).status).toBe(400);
    expect(
      (await api.CATEGORY(request("GET", undefined, "/?private=true"), categoryId)).status,
    ).toBe(400);
  });
  it("maps split retry exhaustion to a stable actionable 409 code", async () => {
    const dependencies = createManagementRouteDependencies(db!, auth, origin);
    const api = createItemRouteHandlers({
      ...dependencies,
      createItemService: (actorId: string) => ({
        ...dependencies.createItemService(actorId),
        splitQuantityItem: async () => {
          throw new ItemServiceError("ITEM_CATALOG_RETRY_EXHAUSTED");
        },
      }),
    });
    const response = await api.SPLIT_ITEM(request("POST", { quantity: 1 }), itemId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "ITEM_CATALOG_RETRY_EXHAUSTED" },
    });
  });
});
