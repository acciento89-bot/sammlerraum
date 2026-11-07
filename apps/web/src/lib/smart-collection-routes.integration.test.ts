import type { SmartCollectionDetail } from "@sammlerraum/contracts/smart-collections";
import type { ApiErrorEnvelope } from "@sammlerraum/contracts/errors";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `smartroute_${randomUUID()}`;
const origin = "http://localhost:3000";
describe.runIf(enabled)("native saved-query authorized routes", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: { id: owner, name: "Saved", email: `${owner}@example.invalid` },
    });
    const c = await db!.collection.create({ data: { ownerId: owner, name: "Saved" } });
    await db!.collectibleItem.create({
      data: { ownerId: owner, collectionId: c.id, title: "Route watch" },
    });
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: owner } });
    await db?.$disconnect();
  });
  async function handlers(authenticated = true) {
    const path = "./smart-collection-routes";
    const m = await import(path);
    const getSession = vi.fn(async () => (authenticated ? { user: { id: owner } } : null));
    return {
      handler: m.createSmartCollectionRouteHandlers(
        m.createSmartCollectionRouteDependencies(db!, { api: { getSession } }, origin),
      ),
      getSession,
    };
  }
  function req(body: unknown, method = "POST", headers: Record<string, string> = {}) {
    return new Request(`${origin}/api/v1/smart-collections`, {
      method,
      headers: { origin, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }
  it("creates/lists/details/replaces/resolves/deletes actual saved definitions", async () => {
    const { handler: h, getSession } = await handlers();
    const created = await h.POST(req({ name: "Route", text: "watch", lifecycle: "ALL" }));
    expect(created.status).toBe(201);
    const saved = await created.json();
    expect(saved.definition).toEqual({ version: 1, text: "watch", filter: null, lifecycle: "ALL" });
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
    );
    const list = await h.GET(new Request(origin));
    expect(list.status).toBe(200);
    expect((await list.json()).items[0]).not.toHaveProperty("definition");
    expect((await h.GET_ONE(new Request(origin), saved.id)).status).toBe(200);
    const items = await h.GET_ITEMS(new Request(origin), saved.id);
    expect(items.status).toBe(200);
    expect((await items.json()).total).toBe(1);
    expect(
      (await h.PATCH(req({ name: "Replaced", expectedRevision: 1 }, "PATCH"), saved.id)).status,
    ).toBe(200);
    expect((await h.DELETE(req({ expectedRevision: 1 }, "DELETE"), saved.id)).status).toBe(409);
    expect((await h.DELETE(req({ expectedRevision: 2 }, "DELETE"), saved.id)).status).toBe(200);
    const hidden = await h.GET_ONE(new Request(origin), saved.id);
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("cache-control")).toBe("no-store");
    expect(hidden.headers.get("x-request-id")).toBeTruthy();
  });
  it("enforces auth/origin/raw filter/body/query boundaries and closed errors", async () => {
    const { handler: h } = await handlers();
    expect((await (await handlers(false)).handler.GET(new Request(origin))).status).toBe(401);
    expect((await h.POST(req({ name: "x" }, "POST", { origin: `${origin}/` }))).status).toBe(403);
    for (const body of [
      { name: "x", ownerId: owner },
      { name: "x", f: '{"version":1,"version":1}' },
      { name: "x", text: "secret".repeat(34) },
    ])
      expect((await h.POST(req(body))).status).toBe(400);
    expect((await h.POST(req({ name: "x", f: "x".repeat(32769) }))).status).toBe(413);
    expect(
      (
        await h.POST(
          new Request(origin, {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: new Uint8Array([255]),
          }),
        )
      ).status,
    ).toBe(400);
    for (const q of [
      "limit=01",
      "limit=1&limit=2",
      "text=secret",
      "cursor=%FF",
      "ownerId=x",
      "limit=1&%6cimit=2",
    ]) {
      const r = await h.GET(new Request(`${origin}/?${q}`));
      expect(r.status).toBe(400);
      expect(await r.text()).not.toContain("secret");
    }
    expect((await h.GET(new Request(`${origin}/?cursor=${"x".repeat(32769)}`))).status).toBe(414);
    for (const [root, status] of [
      [{ kind: "duplicate", value: true }, 422],
      [{ kind: "collection", test: { op: "eq", value: randomUUID() } }, 422],
    ] as const) {
      expect(
        (await h.POST(req({ name: "Unavailable", f: JSON.stringify({ version: 1, root }) })))
          .status,
      ).toBe(status);
    }
  });
  it("uses all actual Next route modules with native service dependencies", async () => {
    const { handler } = await handlers();
    const dependencies = await import("./smart-collection-route-dependencies");
    const mock = vi.spyOn(dependencies, "smartCollectionRouteHandlers").mockResolvedValue(handler);
    try {
      const root = await import("../app/api/v1/smart-collections/route");
      const detail = await import("../app/api/v1/smart-collections/[id]/route");
      const items = await import("../app/api/v1/smart-collections/[id]/items/route");
      const created = await root.POST(req({ name: "Actual path", text: "watch" }));
      expect(created.status).toBe(201);
      const saved = (await created.json()) as SmartCollectionDetail,
        context = { params: Promise.resolve({ id: saved.id }) };
      expect((await root.GET(new Request(origin))).status).toBe(200);
      expect((await detail.GET(new Request(origin), context)).status).toBe(200);
      expect((await items.GET(new Request(origin), context)).status).toBe(200);
      expect(
        (
          await detail.PATCH(
            req({ name: "Actual replaced", expectedRevision: 1 }, "PATCH"),
            context,
          )
        ).status,
      ).toBe(200);
      expect((await detail.DELETE(req({ expectedRevision: 2 }, "DELETE"), context)).status).toBe(
        200,
      );
    } finally {
      mock.mockRestore();
    }
  });
  it("projects dependency/invariant/stored errors without leaking request or database values", async () => {
    const m = await import("./smart-collection-routes");
    const { ItemSearchError } = await import("@sammlerraum/contracts/item-search");
    const { SmartCollectionError } = await import("@sammlerraum/contracts/smart-collections");
    for (const [error, status] of [
      [new ItemSearchError("SEARCH_UNAVAILABLE"), 503],
      [new ItemSearchError("SEARCH_INVARIANT"), 500],
      [new SmartCollectionError("SMART_COLLECTION_UNRESOLVABLE"), 409],
    ] as const) {
      const dependencies = m.createSmartCollectionRouteDependencies(
        db!,
        { api: { getSession: async () => ({ user: { id: owner } }) } },
        origin,
      );
      dependencies.service.resolveSmartCollectionItems = async () => {
        throw error;
      };
      const response = await m
        .createSmartCollectionRouteHandlers(dependencies)
        .GET_ITEMS(new Request(origin), randomUUID());
      expect(response.status).toBe(status);
      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.error.code).toBe(error.code);
      expect(Object.keys(body.error).sort()).toEqual(["code", "message", "requestId"]);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
