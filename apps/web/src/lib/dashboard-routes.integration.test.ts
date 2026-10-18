import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `dashboard_route_${randomUUID()}`;
describe.runIf(enabled)("native owned dashboard route", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: { id: owner, name: "Route", email: `${owner}@example.invalid` },
    });
    const c = await db!.collection.create({ data: { ownerId: owner, name: "Collection" } });
    await db!.collectibleItem.create({
      data: { ownerId: owner, collectionId: c.id, title: "Route watch", quantity: 3 },
    });
  });
  afterAll(async () => {
    await db?.user.delete({ where: { id: owner } });
    await db?.$disconnect();
  });
  async function handlers(authenticated = true) {
    const path = "./dashboard-routes";
    const m = await import(path);
    const getSession = vi.fn(async () => (authenticated ? { user: { id: owner } } : null));
    return {
      getSession,
      handler: m.createDashboardRouteHandlers(
        m.createDashboardRouteDependencies(db!, { api: { getSession } }),
      ),
    };
  }
  it("returns matched units and collections with fresh session/no-store/request ID", async () => {
    const { handler, getSession } = await handlers();
    const r = await handler.GET(new Request("https://example.invalid/api/v1/dashboard?text=watch"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-request-id")).toBeTruthy();
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
    );
    expect(await r.json()).toMatchObject({
      scope: "OWNED",
      selection: { itemCount: 1, unitCount: "3" },
      purchaseTotals: { state: "UNAVAILABLE", groups: null },
    });
  });
  it.each([
    "f=null",
    "text=%FF",
    "text=%",
    "text=a&%74ext=b",
    "owner=secret",
    "limit=1",
    "cursor=abc",
    "scope=SHARED",
    "f=%7B%22version%22%3A1%2C%22version%22%3A1%7D",
  ])("closes malformed and overridden wire %s", async (q) => {
    const { handler } = await handlers();
    const r = await handler.GET(new Request(`https://example.invalid/?${q}`));
    expect(r.status).toBe(400);
    expect(await r.text()).not.toContain("secret");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("enforces query bytes and authentication", async () => {
    const { handler } = await handlers();
    expect(
      (await handler.GET(new Request(`https://example.invalid/?text=${"x".repeat(32769)}`))).status,
    ).toBe(414);
    expect(
      (await (await handlers(false)).handler.GET(new Request("https://example.invalid/"))).status,
    ).toBe(401);
  });
  it("projects only closed semantic reference and unavailable filter errors", async () => {
    const { handler } = await handlers();
    for (const [root, code] of [
      [{ kind: "not", child: { kind: "duplicate", value: true } }, "FILTER_UNAVAILABLE"],
      [{ kind: "collection", test: { op: "eq", value: randomUUID() } }, "FILTER_REFERENCE_INVALID"],
    ]) {
      const r = await handler.GET(
        new Request(
          `https://example.invalid/?text=none&f=${encodeURIComponent(JSON.stringify({ version: 1, root }))}`,
        ),
      );
      expect(r.status).toBe(422);
      const b = await r.json();
      expect(b.error.code).toBe(code);
      expect(Object.keys(b.error).sort()).toEqual(["code", "message", "requestId"]);
    }
  });
});
