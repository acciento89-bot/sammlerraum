import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `searchroute_${randomUUID()}`;
describe.runIf(enabled)("native authorized item search route", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: { id: owner, name: "Search", email: `${owner}@example.invalid` },
    });
    const c = await db!.collection.create({ data: { ownerId: owner, name: "Search" } });
    await db!.collectibleItem.create({
      data: { ownerId: owner, collectionId: c.id, title: "Route watch" },
    });
  });
  afterAll(async () => {
    await db?.user.delete({ where: { id: owner } });
    await db?.$disconnect();
  });
  async function handlers(authenticated = true) {
    const path = "./item-search-routes";
    const m = await import(path).catch(() => null);
    expect(m?.createItemSearchRouteHandlers, "native search route must exist").toBeTypeOf(
      "function",
    );
    const getSession = vi.fn(async () => (authenticated ? { user: { id: owner } } : null));
    return {
      getSession,
      handler: m!.createItemSearchRouteHandlers(
        m!.createItemSearchRouteDependencies(
          db!,
          { api: { getSession } },
          "https://example.invalid",
        ),
      ),
    };
  }
  it("returns only owned summaries with fresh authentication and no-store/request ID", async () => {
    const { handler, getSession } = await handlers();
    const r = await handler.GET(
      new Request("https://example.invalid/api/v1/search/items?text=watch"),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-request-id")).toBeTruthy();
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
    );
    const body = await r.json();
    expect(body.total).toBe(1);
    expect(body.items[0].title).toBe("Route watch");
    expect(Object.keys(body.items[0]).sort()).toEqual(
      [
        "id",
        "title",
        "collectionId",
        "categoryTemplateId",
        "conditionOptionId",
        "quantity",
        "visibility",
        "tradeStatus",
        "archivedAt",
        "disposedAt",
        "createdAt",
        "updatedAt",
      ].sort(),
    );
  });
  it.each([
    "f=null",
    "text=%FF",
    "text=%",
    "text=a&%74ext=b",
    "unknown=secret",
    "limit=01",
    "limit=+1",
    "f=%7B%22version%22%3A1%2C%22version%22%3A1%7D",
  ])("rejects malformed query %s", async (q) => {
    const { handler } = await handlers();
    const r = await handler.GET(new Request(`https://example.invalid/api/v1/search/items?${q}`));
    expect(r.status).toBe(400);
    const text = await r.text();
    expect(text).not.toContain("secret");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects encoded query size before parsing and missing authentication", async () => {
    const { handler } = await handlers();
    expect(
      (await handler.GET(new Request(`https://example.invalid/?text=${"x".repeat(32769)}`))).status,
    ).toBe(414);
    const unauth = await handlers(false);
    expect((await unauth.handler.GET(new Request("https://example.invalid/"))).status).toBe(401);
  });
  it("keeps unavailable and reference errors closed", async () => {
    const { handler } = await handlers();
    for (const [root, code] of [
      [{ kind: "not", child: { kind: "duplicate", value: true } }, "FILTER_UNAVAILABLE"],
      [{ kind: "collection", test: { op: "eq", value: randomUUID() } }, "FILTER_REFERENCE_INVALID"],
    ]) {
      const r = await handler.GET(
        new Request(
          `https://example.invalid/?f=${encodeURIComponent(JSON.stringify({ version: 1, root }))}`,
        ),
      );
      expect(r.status).toBe(422);
      const body = await r.json();
      expect(body.error.code).toBe(code);
      expect(Object.keys(body.error).sort()).toEqual(["code", "message", "requestId"]);
    }
  });
  it("preserves specific filter codes and generic safe dependency/invariant responses", async () => {
    const { handler } = await handlers();
    for (const [raw, code] of [
      [
        JSON.stringify({ version: 2, root: { kind: "duplicate", value: true } }),
        "FILTER_VERSION_UNSUPPORTED",
      ],
      [
        JSON.stringify({
          version: 1,
          root: {
            kind: "and",
            children: Array.from({ length: 51 }, () => ({ kind: "duplicate", value: true })),
          },
        }),
        "FILTER_TOO_COMPLEX",
      ],
    ]) {
      const response = await handler.GET(
        new Request(`https://example.invalid/?f=${encodeURIComponent(raw!)}`),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(code);
    }
    const path = "./item-search-routes";
    const m = await import(path);
    const { ItemSearchError } = await import("@sammlerraum/contracts/item-search");
    for (const [code, status] of [
      ["SEARCH_UNAVAILABLE", 503],
      ["SEARCH_INVARIANT", 500],
    ] as const) {
      const dependencies = m.createItemSearchRouteDependencies(
        db!,
        {
          api: { getSession: async () => ({ user: { id: owner } }) },
        },
        "https://example.invalid",
      );
      dependencies.service.searchItems = async () => {
        throw new ItemSearchError(code);
      };
      const response = await m
        .createItemSearchRouteHandlers(dependencies)
        .GET(new Request("https://example.invalid/?text=secret"));
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error.code).toBe(code);
      expect(JSON.stringify(body)).not.toContain("secret");
    }
  });
});
