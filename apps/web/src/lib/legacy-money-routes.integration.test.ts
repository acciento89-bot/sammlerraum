import { ItemMoneyResultSchema } from "@sammlerraum/contracts/personal-money";
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import {
  createLegacyMoneyRouteDependencies,
  createLegacyMoneyRouteHandlers,
} from "./legacy-money-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const origin = "http://localhost:3000";
const users: string[] = [];
const request = (
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
  query = "",
) =>
  new Request(`${origin}/api/v1/money/items${query}`, {
    method,
    headers: { origin, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
async function fixture() {
  const actor = randomUUID();
  users.push(actor);
  await db!.user.create({
    data: { id: actor, name: "HTTP money synthetic", email: `${actor}@example.invalid` },
  });
  const collection = await db!.collection.create({ data: { ownerId: actor, name: "HTTP money" } });
  let loggedIn = true;
  let sessionReads = 0;
  const auth = {
    api: {
      getSession: async (input: {
        query?: { disableCookieCache?: boolean; disableRefresh?: boolean };
      }) => {
        sessionReads++;
        expect(input.query).toEqual({ disableCookieCache: true, disableRefresh: true });
        return loggedIn ? { user: { id: actor } } : null;
      },
    },
  };
  const api = createLegacyMoneyRouteHandlers(
    createLegacyMoneyRouteDependencies(db!, auth, origin, true),
  );
  return {
    actor,
    collection: collection.id,
    api,
    logout: () => {
      loggedIn = false;
    },
    reads: () => sessionReads,
  };
}
describe.runIf(enabled)("personal money HTTP real database boundary", () => {
  it("keeps explicit monetary writers closed when server authoring is disabled", async () => {
    const f = await fixture();
    const disabled = createLegacyMoneyRouteHandlers(
      createLegacyMoneyRouteDependencies(
        db!,
        { api: { getSession: async () => ({ user: { id: f.actor } }) } },
        origin,
        false,
      ),
    );
    const response = await disabled.CREATE(
      request("POST", {
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Must not be created" },
      }),
    );
    expect(response.status).toBe(503);
    expect(await db!.collectibleItem.count({ where: { collectionId: f.collection } })).toBe(0);
  });

  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }
  });
  it("creates and reads explicit money only after fresh authentication, with no-store and request IDs", async () => {
    const f = await fixture();
    const response = await f.api.CREATE(
      request("POST", {
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Explicit route" },
        purchase: {
          op: "NEW",
          authoring: {
            kind: "DECIMAL",
            profileId: "legacy-money-iso-2026-09-17-v1",
            currency: "AFN",
            decimal: "1",
          },
        },
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = ItemMoneyResultSchema.parse(await response.json());
    expect(body.purchase.interpretation).toMatchObject({ kind: "INTERPRETED", exponent: 2 });
    const read = await f.api.READ_ITEM(request("GET"), body.item.id);
    expect(read.status).toBe(200);
    f.logout();
    const denied = await f.api.READ_ITEM(request("GET"), body.item.id);
    expect(denied.status).toBe(401);
    expect(f.reads()).toBe(3);
  });
  it("rejects cross-origin before session access and duplicate nested keys/invalid bytes before mutation", async () => {
    const f = await fixture();
    const denied = await f.api.CREATE(request("POST", {}, { origin: "https://foreign.invalid" }));
    expect(denied.status).toBe(403);
    expect(f.reads()).toBe(0);
    for (const body of [
      '{"schemaVersion":1,"item":{"title":"a","title":"b"}}',
      '{"schemaVersion":1,"item":{"title":"\\ud800"}}',
    ]) {
      const response = await f.api.CREATE(request("POST", body));
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain("\\ud800");
    }
    expect(await db!.collectibleItem.count({ where: { collectionId: f.collection } })).toBe(0);
  });
  it("hides foreign reads and exposes owned history/revocation as closed request states", async () => {
    const f = await fixture(),
      other = await fixture();
    const created = await f.api.CREATE(
      request("POST", {
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "History API" },
        purchase: {
          op: "NEW",
          authoring: {
            kind: "DECIMAL",
            profileId: "legacy-money-iso-2026-09-17-v1",
            currency: "EUR",
            decimal: "4",
          },
        },
      }),
    );
    const body = ItemMoneyResultSchema.parse(await created.json());
    const foreign = await other.api.READ(request("GET"), body.item.id);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(await foreign.json())).not.toContain(body.item.id);
    const history = await f.api.HISTORY(request("GET"), body.item.id);
    expect(history.status).toBe(200);
    const data = (await history.json()) as {
      events: Array<{ id: string; operation: string; expectedAssertionToken: string | null }>;
    };
    const author = data.events.find((e) => e.operation === "AUTHOR")!;
    const revoked = await f.api.REVOKE(
      request("POST", {
        assertionId: author.id,
        expectedAssertionToken: author.expectedAssertionToken,
        reason: "API correction",
      }),
      body.item.id,
    );
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({
      schemaVersion: 1,
      revoked: true,
      subject: { family: "PURCHASE", itemId: body.item.id },
      assertionId: author.id,
    });
    const stale = await f.api.UPDATE(
      request("PATCH", {
        schemaVersion: 1,
        purchase: { op: "RETAIN", expectedFactToken: body.purchase.factToken },
      }),
      body.item.id,
    );
    expect(stale.status).toBe(409);
    const current = await f.api.READ(request("GET"), body.item.id);
    expect(await current.json()).toMatchObject({
      purchase: { interpretation: { kind: "UNKNOWN", reason: "REVOKED" } },
    });
  });
  it("bounds history/field queries and streamed authoring bodies without weakening authentication", async () => {
    const f = await fixture();
    const created = await f.api.CREATE(
      request("POST", { schemaVersion: 1, item: { collectionId: f.collection, title: "Bounds" } }),
    );
    const body = ItemMoneyResultSchema.parse(await created.json());
    for (const query of ["?limit=51", "?limit=1&limit=2", "?limit=1e1", "?unknown=x"]) {
      expect((await f.api.HISTORY(request("GET", undefined, {}, query), body.item.id)).status).toBe(
        400,
      );
    }
    for (const [sequence, status] of [
      ["9223372036854775807", 200],
      ["9223372036854775808", 400],
    ] as const) {
      const cursor = Buffer.from(
        JSON.stringify({
          v: 1,
          subject: { family: "PURCHASE", itemId: body.item.id },
          sequence,
          id: randomUUID(),
        }),
      ).toString("base64url");
      expect(
        (await f.api.HISTORY(request("GET", undefined, {}, `?cursor=${cursor}`), body.item.id))
          .status,
      ).toBe(status);
    }
    const big = await f.api.CREATE(request("POST", " ".repeat(16 * 1024 + 1)));
    expect(big.status).toBe(413);
    const noOrigin = new Request(`${origin}/api/v1/money/items/${body.item.id}`, { method: "GET" });
    expect((await f.api.READ_ITEM(noOrigin, body.item.id)).status).toBe(200);
  });
});
