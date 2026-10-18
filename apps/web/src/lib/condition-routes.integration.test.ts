import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import {
  createConditionMaintenanceService,
  createConditionService,
} from "@sammlerraum/domain/condition/condition-service";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createConditionRouteDependencies, createConditionRouteHandlers } from "./condition-routes";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `ConditionRouteOwner_${randomUUID()}`;
const prefix = `route_condition_${randomUUID().replaceAll("-", "")}`;
const origin = "https://sammlerraum.example";
let categoryId: string;
let optionId: string;
let itemId: string;
const session = vi.fn(
  async (_input: unknown): Promise<{ user: { id: string } } | null> => ({ user: { id: ownerId } }),
);
const handlers = () =>
  createConditionRouteHandlers(
    createConditionRouteDependencies(db!, { api: { getSession: session } }, origin),
  );
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  requestOrigin: string | null = origin,
) =>
  new Request(`${origin}/api/v1/${path}`, {
    method,
    headers: {
      ...(requestOrigin === null ? {} : { origin: requestOrigin }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe.runIf(enabled)("condition routes PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: {
        id: ownerId,
        name: "Route fixture",
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    categoryId = (await db!.categoryTemplate.create({ data: { key: prefix } })).id;
    const scheme = await createConditionMaintenanceService(db!).createConditionScheme({
      categoryTemplateId: categoryId,
      key: prefix,
      labels: { de: "Vinyl", en: "Vinyl" },
      options: [
        {
          labelKey: "vinyl.vg_plus",
          labels: { de: "Sehr gut plus", en: "Very good plus" },
          normalizedBand: 4,
        },
      ],
    });
    optionId = scheme.options[0]!.id;
    const collection = await db!.collection.create({ data: { ownerId, name: "Route fixtures" } });
    itemId = (
      await createItemService(db!, ownerId).createItem({
        collectionId: collection.id,
        title: "Vinyl",
      })
    ).id;
  });
  beforeEach(async () => {
    session.mockReset();
    session.mockResolvedValue({ user: { id: ownerId } });
    const service = createConditionService(db!, ownerId);
    await service.setItemCategory(itemId, { categoryTemplateId: categoryId });
    await service.setItemCondition(itemId, optionId);
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: ownerId } });
    await db.conditionOption.deleteMany({ where: { scheme: { key: { startsWith: prefix } } } });
    await db.conditionScheme.deleteMany({ where: { key: { startsWith: prefix } } });
    await db.categoryTemplate.deleteMany({ where: { key: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("serves an authenticated scheme and persists exact personal category/condition through the adapter", async () => {
    const api = handlers();
    const scheme = await api.GET_SCHEME(
      request("categories/x/condition-scheme"),
      categoryId.toUpperCase(),
    );
    expect(scheme.status).toBe(200);
    expect(scheme.headers.get("cache-control")).toBe("no-store");
    expect(await scheme.json()).toMatchObject({
      scheme: {
        categoryTemplateId: categoryId,
        options: [{ labelKey: "vinyl.vg_plus", normalizedBand: 4 }],
      },
    });
    const category = await api.PUT_CATEGORY(
      request("items/x/category", "PUT", { categoryTemplateId: categoryId.toUpperCase() }),
      itemId.toUpperCase(),
    );
    expect(category.status).toBe(200);
    const saved = await api.PUT_CONDITION(
      request("items/x/condition", "PUT", { optionId: optionId.toUpperCase() }),
      itemId.toUpperCase(),
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      condition: {
        categoryTemplateId: categoryId,
        conditionOption: {
          labelKey: "vinyl.vg_plus",
          labels: { de: "Sehr gut plus", en: "Very good plus" },
        },
        normalizedBand: 4,
      },
    });
    const read = await api.GET_CONDITION(request("items/x/condition"), itemId);
    expect(await read.json()).toMatchObject({
      condition: { conditionOption: { id: optionId }, normalizedBand: 4 },
    });
    expect(session).toHaveBeenLastCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
  });

  it("requires live sessions and hides foreign-owned or invalid item identifiers", async () => {
    session.mockResolvedValueOnce(null);
    expect(
      (await handlers().GET_SCHEME(request("categories/x/condition-scheme"), categoryId)).status,
    ).toBe(401);
    session.mockResolvedValueOnce({ user: { id: "foreign" } });
    const hidden = await handlers().PUT_CONDITION(
      request("items/x/condition", "PUT", { optionId: null }),
      itemId,
    );
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toMatchObject({
      error: { code: "NOT_FOUND", requestId: expect.any(String) },
    });
    session.mockResolvedValueOnce({ user: { id: "foreign" } });
    expect((await handlers().GET_CONDITION(request("items/x/condition"), itemId)).status).toBe(404);
    expect((await handlers().GET_CONDITION(request("items/x/condition"), "invalid")).status).toBe(
      404,
    );
    expect(
      (await handlers().GET_SCHEME(request("categories/x/condition-scheme"), "invalid")).status,
    ).toBe(404);
  });

  it("requires exact Origin on both mutation routes before state changes", async () => {
    for (const value of [null, "https://evil.example", `${origin}/`, `${origin}.evil.example`]) {
      expect(
        (
          await handlers().PUT_CONDITION(
            request("items/x/condition", "PUT", { optionId: null }, value),
            itemId,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await handlers().PUT_CATEGORY(
            request(
              "items/x/category",
              "PUT",
              { categoryTemplateId: null, clearCondition: true },
              value,
            ),
            itemId,
          )
        ).status,
      ).toBe(403);
    }
    expect(
      (await createConditionService(db!, ownerId).getItemCondition(itemId)).conditionOption?.id,
    ).toBe(optionId);
  });

  it("strictly rejects semantic writes, malformed bodies, and streamed oversized input", async () => {
    for (const body of [
      { optionId, normalizedBand: 1 },
      { optionId, labelKey: "replace" },
      { optionId, labels: { de: "A", en: "A" } },
      { optionId: "invalid" },
      {},
      { optionId: null, ownerId },
    ]) {
      const response = await handlers().PUT_CONDITION(
        request("items/x/condition", "PUT", body),
        itemId,
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(
      (
        await handlers().PUT_CATEGORY(
          request("items/x/category", "PUT", {
            categoryTemplateId: categoryId,
            clearCondition: "yes",
          }),
          itemId,
        )
      ).status,
    ).toBe(400);
    const oversized = new Request(`${origin}/api/v1/items/x/condition`, {
      method: "PUT",
      headers: { origin, "content-type": "application/json", "content-length": "1" },
      body: JSON.stringify({ optionId, padding: "x".repeat(3000) }),
    });
    expect((await handlers().PUT_CONDITION(oversized, itemId)).status).toBe(413);
    for (const contentType of ["text/plain", "application/json"]) {
      const invalid = new Request(`${origin}/api/v1/items/x/condition`, {
        method: "PUT",
        headers: { origin, "content-type": contentType },
        body: "{",
      });
      expect((await handlers().PUT_CONDITION(invalid, itemId)).status).toBe(400);
    }
    expect(
      (await createConditionService(db!, ownerId).getItemCondition(itemId)).normalizedBand,
    ).toBe(4);
  });

  it("returns a conflict for implicit category clearing and supports explicit nullable clear", async () => {
    const denied = await handlers().PUT_CATEGORY(
      request("items/x/category", "PUT", { categoryTemplateId: null }),
      itemId,
    );
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({ error: { code: "CONDITION_CLEAR_REQUIRED" } });
    const cleared = await handlers().PUT_CONDITION(
      request("items/x/condition", "PUT", { optionId: null }),
      itemId,
    );
    expect(await cleared.json()).toMatchObject({
      condition: { conditionOption: null, normalizedBand: null, categoryTemplateId: categoryId },
    });
    await handlers().PUT_CONDITION(request("items/x/condition", "PUT", { optionId }), itemId);
    const category = await handlers().PUT_CATEGORY(
      request("items/x/category", "PUT", { categoryTemplateId: null, clearCondition: true }),
      itemId,
    );
    expect(await category.json()).toMatchObject({
      condition: { categoryTemplateId: null, conditionOption: null },
    });
  });
});
