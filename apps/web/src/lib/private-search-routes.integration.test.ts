import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createCollectionService } from "@sammlerraum/domain/collections/collection-service";
import { createValuationService } from "@sammlerraum/domain/valuations/valuation-service";
import { createSmartCollectionService } from "@sammlerraum/domain/search/smart-collection-service";
import {
  createItemSearchRouteDependencies,
  createItemSearchRouteHandlers,
} from "./item-search-routes";
import { createDashboardRouteDependencies, createDashboardRouteHandlers } from "./dashboard-routes";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const origin = "https://example.invalid";
const owner = `private_query_${randomUUID()}`,
  foreign = `private_query_${randomUUID()}`;
let collection: string;
const selected: string[] = [];
function routes(userId: string | null = owner) {
  const getSession = vi.fn(async () => (userId ? { user: { id: userId } } : null));
  const auth = { api: { getSession } };
  return {
    getSession,
    items: createItemSearchRouteHandlers(createItemSearchRouteDependencies(db!, auth, origin)),
    dashboard: createDashboardRouteHandlers(createDashboardRouteDependencies(db!, auth, origin)),
  };
}
function request(body: string, path = "search/items", query = "") {
  return new Request(`${origin}/api/v1/${path}${query}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json; charset=utf-8" },
    body,
  });
}
async function post(
  handlers: { POST: (r: Request) => Response | Promise<Response> },
  req: Request,
) {
  return handlers.POST(req);
}
const filter = (root: object) => JSON.stringify({ version: 1, root });
const sameData = (body: Record<string, unknown>) => {
  const { readAt: _, ...data } = body;
  return data;
};

describe.runIf(enabled)("native private query POST transport", () => {
  beforeAll(async () => {
    await db!.user.createMany({
      data: [owner, foreign].map((id) => ({ id, name: "Private", email: `${id}@example.invalid` })),
    });
    collection = (
      await createCollectionService(db!, owner).createCollection({ name: "Private selected" })
    ).id;
    for (const [title, quantity, currency, amount] of [
      ["Match EUR", 3, "EUR", 100n],
      ["Match USD", 2, "USD", 250n],
      ["Match missing", 4, null, null],
    ] as const) {
      const item = await createItemService(db!, owner).createItem({
        collectionId: collection,
        title,
        quantity,
      });
      selected.push(item.id);
      if (currency)
        await createValuationService(db!, owner).addManualValuation(item.id, {
          currency,
          amountMinor: amount,
        });
    }
    for (const [actor, deleted] of [
      [owner, true],
      [foreign, false],
    ] as const) {
      const c = await createCollectionService(db!, actor).createCollection({
        name: "Hidden",
        visibility: "PUBLIC",
      });
      await createItemService(db!, actor).createItem({
        collectionId: c.id,
        title: "Match hidden",
        quantity: 100,
        visibility: "PUBLIC",
      });
      if (deleted) await createCollectionService(db!, actor).deleteCollection(c.id);
    }
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: [owner, foreign] } } });
    await db?.$disconnect();
  });
  it("serves the same owned rows/count/cursor through POST and GET", async () => {
    const { items } = routes();
    const get = await items.GET(new Request(`${origin}/api/v1/search/items?text=Match&limit=2`));
    const response = await post(items, request(JSON.stringify({ text: "Match", limit: 2 })));
    expect(response.status).toBe(200);
    const a = await get.json(),
      b = await response.json();
    expect(sameData(b)).toEqual(sameData(a));
    expect(b.total).toBe(3);
    expect(b.items).toHaveLength(2);
    expect(b.items.every((item: { id: string }) => selected.includes(item.id))).toBe(true);
    expect(b.nextCursor).toBeTruthy();
  });
  it("accepts valid raw f beyond 10000 characters through the real service", async () => {
    const f = filter({ kind: "collection", test: { op: "eq", value: collection } }).padEnd(
      16384,
      " ",
    );
    const response = await post(routes().items, request(JSON.stringify({ f })));
    expect(response.status).toBe(200);
    expect((await response.json()).total).toBe(3);
  });
  it.each(['{"text":"secret","text":"other"}', '{"text":"secret","t\\u0065xt":"other"}'])(
    "rejects duplicate root keys before losing them",
    async (body) => {
      const response = await post(routes().items, request(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("SEARCH_INVALID");
    },
  );
  it("uses the actual dashboard aggregate service and currency groups", async () => {
    const { dashboard } = routes();
    const a = await dashboard.GET(new Request(`${origin}/api/v1/dashboard?text=Match`));
    const b = await post(dashboard, request('{"text":"Match"}', "dashboard"));
    expect(b.status).toBe(200);
    const body = await b.json();
    expect(sameData(body)).toEqual(sameData(await a.json()));
    expect(body.selection).toEqual({ itemCount: 3, unitCount: "9", matchedCollectionCount: 1 });
    expect(body.manualValues.groups).toMatchObject([
      { currency: "EUR", totalMinor: "300" },
      { currency: "USD", totalMinor: "500" },
    ]);
  });
  it("crosses GET/POST cursors but rejects changed query, actor and saved context", async () => {
    const { items } = routes();
    const firstGet = await (await items.GET(new Request(`${origin}/?text=Match&limit=2`))).json();
    const firstPost = await (await post(items, request('{"text":"Match","limit":2}'))).json();
    const nextPost = await post(
      items,
      request(JSON.stringify({ text: "Match", limit: 2, cursor: firstGet.nextCursor })),
    );
    const nextGet = await items.GET(
      new Request(`${origin}/?text=Match&limit=2&cursor=${firstPost.nextCursor}`),
    );
    expect(nextPost.status).toBe(200);
    expect(nextGet.status).toBe(200);
    const a = await nextPost.json(),
      b = await nextGet.json();
    expect(sameData(a)).toEqual(sameData(b));
    expect(a.items).toHaveLength(1);
    expect(a.total).toBe(3);
    expect(a.nextCursor).toBeNull();
    expect(new Set([...firstPost.items, ...a.items].map((x: { id: string }) => x.id))).toEqual(
      new Set(selected),
    );
    for (const [target, query] of [
      [routes(foreign).items, { text: "Match", limit: 2 }],
      [items, { text: "other", limit: 2 }],
      [items, { text: "Match", limit: 1 }],
      [items, { text: "Match", limit: 2, lifecycle: "ALL" }],
    ] as const) {
      const response = await post(
        target,
        request(JSON.stringify({ ...query, cursor: firstGet.nextCursor })),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("SEARCH_INVALID");
    }
    const saved = createSmartCollectionService(db!);
    const smart = await saved.createSmartCollection(
      { userId: owner },
      {
        name: "Private saved",
        definition: { version: 1, text: "Match", filter: null, lifecycle: "ACTIVE" },
      },
    );
    const savedPage = await saved.resolveSmartCollectionItems({ userId: owner }, smart.id, {
      limit: 2,
    });
    expect(savedPage.nextCursor).toBeTruthy();
    const invalid = await post(
      items,
      request(JSON.stringify({ text: "Match", limit: 2, cursor: savedPage.nextCursor })),
    );
    expect(invalid.status).toBe(400);
    await expect(
      saved.resolveSmartCollectionItems({ userId: owner }, smart.id, {
        limit: 2,
        cursor: firstPost.nextCursor,
      }),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
  });
  it.each(["items", "dashboard"] as const)(
    "enforces Origin, fresh session, query then body ordering for %s",
    async (family) => {
      const state = routes(null),
        handler = state[family];
      for (const supplied of [null, "https://foreign.invalid", `${origin}/`, `${origin}:443`]) {
        const req = request(
          "not JSON",
          family === "items" ? "search/items" : "dashboard",
          "?text=private",
        );
        if (supplied === null) req.headers.delete("origin");
        else req.headers.set("origin", supplied);
        const response = await post(handler, req);
        expect(response.status).toBe(403);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-request-id")).toBeTruthy();
        expect(state.getSession).not.toHaveBeenCalled();
      }
      const unauthorized = await post(handler, request("not JSON", "", "?text=private"));
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.headers.get("cache-control")).toBe("no-store");
      expect(unauthorized.headers.get("x-request-id")).toBeTruthy();
      expect(state.getSession).toHaveBeenCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
      );
      const authenticated = routes();
      const invalidQuery = await post(
        authenticated[family],
        request("not JSON", "", "?text=private"),
      );
      expect(invalidQuery.status).toBe(400);
      expect((await invalidQuery.json()).error.code).toBe("SEARCH_INVALID");
      const largeQuery = await post(
        authenticated[family],
        request("not JSON", "", `?text=${"x".repeat(32769)}`),
      );
      expect(largeQuery.status).toBe(414);
      expect((await largeQuery.json()).error.code).toBe("SEARCH_QUERY_TOO_LARGE");
      expect((await post(authenticated[family], request("{}", "", "?"))).status).toBe(200);
    },
  );
  it.each(["items", "dashboard"] as const)(
    "preserves privacy and response headers on every %s POST boundary",
    async (family) => {
      const handler = routes()[family];
      const cases: Array<[string, number, string]> = [
        ['{"ownerId":"private-body-secret"}', 400, "SEARCH_INVALID"],
        ['{"scope":"OWNED"}', 400, "SEARCH_INVALID"],
        ['{"context":"private-body-secret"}', 400, "SEARCH_INVALID"],
        ['{"filter":{}}', 400, "SEARCH_INVALID"],
        ['{"f":"null"}', 400, "FILTER_INVALID"],
        ['{"f":""}', 400, "FILTER_INVALID"],
        ['{"cursor":"a="}', 400, "SEARCH_INVALID"],
        [
          JSON.stringify({
            f: filter({ kind: "not", child: { kind: "duplicate", value: true } }),
            text: "private-body-secret",
          }),
          422,
          "FILTER_UNAVAILABLE",
        ],
        [
          JSON.stringify({
            f: filter({ kind: "collection", test: { op: "eq", value: randomUUID() } }),
          }),
          422,
          "FILTER_REFERENCE_INVALID",
        ],
        [
          JSON.stringify({
            f: '{"version":1,"root":{"kind":"duplicate","value":true,"value":false}}',
          }),
          400,
          "FILTER_INVALID",
        ],
        [
          JSON.stringify({ f: '{"version":2,"root":{"kind":"duplicate","value":true}}' }),
          400,
          "FILTER_VERSION_UNSUPPORTED",
        ],
        ["{}" + " ".repeat(32767), 413, "UPLOAD_TOO_LARGE"],
      ];
      for (const [body, status, code] of cases) {
        const req = request(body);
        expect(req.url).not.toContain("private-body-secret");
        const response = await post(handler, req);
        expect(response.status).toBe(status);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-request-id")).toBeTruthy();
        const result = await response.json();
        expect(result.error.code).toBe(code);
        expect(Object.keys(result.error).sort()).toEqual(["code", "message", "requestId"]);
        expect(JSON.stringify(result)).not.toMatch(/private-body-secret|SELECT |WHERE |cause/);
      }
      const successful = await post(handler, request("{}"));
      expect(successful.status).toBe(200);
      expect(successful.headers.get("cache-control")).toBe("no-store");
      expect(successful.headers.get("x-request-id")).toBeTruthy();
    },
  );
  it("passes the actor and normalized query to each actual service exactly once", async () => {
    const auth = { api: { getSession: async () => ({ user: { id: owner } }) } };
    const itemDeps = createItemSearchRouteDependencies(db!, auth, origin);
    const dashDeps = createDashboardRouteDependencies(db!, auth, origin);
    const items = vi.spyOn(itemDeps.service, "searchItems");
    const dashboard = vi.spyOn(dashDeps.service, "getDashboard");
    const f = filter({ kind: "collection", test: { op: "eq", value: collection } });
    const payload = { text: " Ｍatch ", lifecycle: "ACTIVE", f };
    expect(
      (
        await post(
          createItemSearchRouteHandlers(itemDeps),
          request(JSON.stringify({ ...payload, limit: 2 })),
        )
      ).status,
    ).toBe(200);
    expect(
      (await post(createDashboardRouteHandlers(dashDeps), request(JSON.stringify(payload)))).status,
    ).toBe(200);
    expect(items).toHaveBeenCalledExactlyOnceWith(
      { userId: owner },
      {
        text: "Match",
        lifecycle: "ACTIVE",
        filter: { version: 1, root: { kind: "collection", test: { op: "eq", value: collection } } },
        limit: 2,
      },
    );
    expect(dashboard).toHaveBeenCalledExactlyOnceWith(
      { userId: owner },
      {
        text: "Match",
        lifecycle: "ACTIVE",
        filter: { version: 1, root: { kind: "collection", test: { op: "eq", value: collection } } },
      },
    );
  });

  it.each(["items", "dashboard"] as const)(
    "preserves native dependency and output invariant failures for %s",
    async (family) => {
      const auth = { api: { getSession: async () => ({ user: { id: owner } }) } };
      let timeouts = 0;
      const delayed: SearchDatabase = {
        $transaction: (work, options) =>
          db!.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  if (sql.text.includes("date_trunc")) {
                    timeouts++;
                    await tx.$queryRaw(Prisma.sql`SELECT pg_sleep(3)`);
                  }
                  return tx.$queryRaw<T>(sql);
                },
              }),
            options,
          ),
      };
      const delayedHandler =
        family === "items"
          ? createItemSearchRouteHandlers(createItemSearchRouteDependencies(delayed, auth, origin))
          : createDashboardRouteHandlers(createDashboardRouteDependencies(delayed, auth, origin));
      const unavailable = await post(delayedHandler, request("{}"));
      expect(unavailable.status).toBe(503);
      expect((await unavailable.json()).error.code).toBe("SEARCH_UNAVAILABLE");
      expect(timeouts).toBe(1);
      const id = selected[0]!;
      const original = await db!.collectibleItem.findUniqueOrThrow({
        where: { id },
        select: { title: true },
      });
      try {
        // Native TEXT permits corrupt retained output which the real producer never writes.
        await db!.collectibleItem.update({ where: { id }, data: { title: "" } });
        const response = await post(routes()[family], request("{}"));
        expect(response.status).toBe(500);
        const error = await response.json();
        expect(error.error.code).toBe("SEARCH_INVARIANT");
        expect(JSON.stringify(error)).not.toMatch(/SELECT |WHERE |cause|Private selected/);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-request-id")).toBeTruthy();
      } finally {
        await db!.collectibleItem.update({ where: { id }, data: { title: original.title } });
      }
    },
  );
  it("preserves whole-tree reference errors after a selected parent is deleted", async () => {
    const c = await createCollectionService(db!, owner).createCollection({
      name: "Delete during transport",
    });
    await createItemService(db!, owner).createItem({ collectionId: c.id, title: "Transient" });
    const f = filter({ kind: "collection", test: { op: "eq", value: c.id } });
    for (const family of ["items", "dashboard"] as const)
      expect((await post(routes()[family], request(JSON.stringify({ f })))).status).toBe(200);
    await createCollectionService(db!, owner).deleteCollection(c.id);
    for (const family of ["items", "dashboard"] as const) {
      const response = await post(
        routes()[family],
        request(JSON.stringify({ text: "no matches", f })),
      );
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("FILTER_REFERENCE_INVALID");
    }
  });

  it("keeps normalized filter/lifecycle parity for both actors and both services", async () => {
    const c = await createCollectionService(db!, owner).createCollection({
      name: "Lifecycle selection",
    });
    const svc = createItemService(db!, owner);
    const active = await svc.createItem({
      collectionId: c.id,
      title: "Lifecycle active",
      quantity: 2,
    });
    const archived = await svc.createItem({
      collectionId: c.id,
      title: "Lifecycle archived",
      quantity: 3,
    });
    await svc.archiveItem(archived.id);
    const disposed = await svc.createItem({
      collectionId: c.id,
      title: "Lifecycle disposed",
      quantity: 5,
    });
    await svc.updateItem(disposed.id, { disposedAt: "2026-01-01T00:00:00.000Z" });
    const f = filter({ kind: "collection", test: { op: "eq", value: c.id.toUpperCase() } });
    for (const [lifecycle, ids, units] of [
      ["ACTIVE", [active.id], "2"],
      ["ARCHIVED", [archived.id], "3"],
      ["DISPOSED", [disposed.id], "5"],
      ["ALL", [active.id, archived.id, disposed.id], "10"],
    ] as const) {
      const state = routes();
      const params = new URLSearchParams({ text: "Lifecycle", f, lifecycle });
      for (const family of ["items", "dashboard"] as const) {
        const get = await state[family].GET(new Request(`${origin}/?${params}`));
        const response = await post(
          state[family],
          request(JSON.stringify({ text: " Ｌifecycle ", f, lifecycle })),
        );
        expect(get.status).toBe(200);
        expect(response.status).toBe(200);
        const a = await get.json(),
          b = await response.json();
        expect(sameData(b)).toEqual(sameData(a));
        if (family === "items") {
          expect(b.total).toBe(ids.length);
          expect(new Set(b.items.map((item: { id: string }) => item.id))).toEqual(new Set(ids));
        } else {
          expect(b.selection).toEqual({
            itemCount: ids.length,
            unitCount: units,
            matchedCollectionCount: 1,
          });
          expect(new Set(b.recentAdditions.items.map((item: { id: string }) => item.id))).toEqual(
            new Set(ids),
          );
        }
      }
    }
    const other = routes(foreign);
    for (const family of ["items", "dashboard"] as const) {
      const response = await post(other[family], request('{"text":"Match"}'));
      expect(response.status).toBe(200);
      const body = await response.json();
      if (family === "items") {
        expect(body.total).toBe(1);
        expect(body.items[0].title).toBe("Match hidden");
        expect(selected).not.toContain(body.items[0].id);
      } else {
        expect(body.selection).toEqual({
          itemCount: 1,
          unitCount: "100",
          matchedCollectionCount: 1,
        });
        expect(body.recentAdditions.items[0].title).toBe("Match hidden");
      }
    }
  });
});
