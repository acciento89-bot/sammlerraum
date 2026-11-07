import { z } from "zod";
import {
  ScopedSearchPageSchema,
  ScopedDiscoveryPageSchema,
} from "@sammlerraum/contracts/scoped-search";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createShareService } from "@sammlerraum/domain/sharing/share-service";
import { createMembershipService } from "@sammlerraum/domain/collaboration/membership-service";
import {
  createScopedSearchRouteDependencies,
  createScopedSearchRouteHandlers,
} from "./scoped-search-routes";
const origin = "https://example.invalid";
const post = (body: unknown, suffix = "", from = origin) =>
  new Request(`${origin}/api/v1/search/scoped${suffix}`, {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual scoped Request/Response handlers",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>;
    let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture() {
      const owner = randomUUID(),
        viewer = randomUUID();
      for (const id of [owner, viewer])
        await db.user.create({
          data: {
            id,
            name: "HTTP scoped fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Known workspace" },
      });
      const item = await db.collectibleItem.create({
        data: {
          ownerId: owner,
          collectionId: collection.id,
          title: "Scoped native object",
          quantity: 2,
          privateNotes: "hidden-http-sentinel",
        },
      });
      const share = await createShareService(db).createShare(
        { userId: owner },
        {
          target: { kind: "ITEM", id: item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        },
      );
      const handlers = (userId: string | null) => {
        const getSession = vi.fn(async () => (userId ? { user: { id: userId } } : null));
        return {
          getSession,
          routes: createScopedSearchRouteHandlers(
            createScopedSearchRouteDependencies(db, { api: { getSession } }, origin),
          ),
        };
      };
      return {
        owner,
        viewer,
        collection,
        item,
        share,
        handlers,
        target: { kind: "SHARE", access: { token: share.token! } },
      };
    }
    it("executes anonymous token rows and dashboard through actual domain/database consumers", async () => {
      const f = await fixture(),
        guest = f.handlers(null);
      const response = await guest.routes.SEARCH(
        post({ target: f.target, query: { text: "native" } }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        total: 1,
        items: [{ id: f.item.id, quantity: 2 }],
      });
      const dashboard = await guest.routes.DASHBOARD(post({ target: f.target, query: {} }));
      expect(dashboard.status).toBe(200);
      expect(await dashboard.json()).toMatchObject({
        selection: { itemCount: 1, unitCount: "2" },
        values: { state: "UNAVAILABLE" },
      });
      expect(guest.getSession).toHaveBeenCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
      );
    });
    it("requires a fresh account for member/saved data and applies privacy headers also on errors", async () => {
      const f = await fixture(),
        guest = f.handlers(null);
      const denied = await guest.routes.SEARCH(
        post({ target: { kind: "MEMBER_COLLECTION", collectionId: f.collection.id }, query: {} }),
      );
      expect(denied.status).toBe(401);
      for (const response of [
        denied,
        await guest.routes.SEARCH(post({ target: f.target, query: {}, role: "OWNER" })),
      ]) {
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(response.headers.get("x-robots-tag")).toContain("noindex");
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(await response.text()).not.toMatch(/hidden-http-sentinel|tokenHash|SELECT /);
      }
      expect((await guest.routes.SAVED_CREATE(post({}))).status).toBe(401);
      expect(
        (
          await guest.routes.SEARCH(
            post({ target: f.target, query: {} }, "", "https://outside.invalid"),
          )
        ).status,
      ).toBe(403);
    });
    it("bounds nested raw JSON and rejects duplicate keys, credentials in query history and URL injection", async () => {
      const f = await fixture(),
        guest = f.handlers(null).routes;
      expect((await guest.SEARCH(post({ padding: "x".repeat(33000) }))).status).toBe(413);
      const duplicate = new Request(origin + "/api/v1/search/scoped", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: `{"target":${JSON.stringify(f.target)},"query":{},"query":{}}`,
      });
      expect((await guest.SEARCH(duplicate)).status).toBe(400);
      expect(
        (await guest.SEARCH(post({ target: f.target, query: {} }, "?token=private"))).status,
      ).toBe(400);
      expect(
        (await guest.SEARCH(post({ target: f.target, query: { token: f.share.token } }))).status,
      ).toBe(400);
    });
    it("saves symbolic definitions through authenticated HTTP and rejects wrong grants on later resolve", async () => {
      const f = await fixture(),
        user = f.handlers(f.viewer).routes;
      const definition = {
        version: 2,
        scope: { kind: "SHARE", shareId: f.share.share.id },
        text: "native",
        filter: null,
        lifecycle: "ALL",
      };
      const created = await user.SAVED_CREATE(
        post({
          mutation: { name: "Selected shared objects", definition },
          access: { token: f.share.token },
        }),
      );
      expect(created.status).toBe(201);
      const saved = z
        .object({ id: z.uuid() })
        .passthrough()
        .parse(await created.json());
      expect(JSON.stringify(saved)).not.toContain(f.share.token!);
      const resolved = await user.SAVED_RESOLVE(
        post({ page: {}, access: { token: f.share.token } }),
        saved.id,
      );
      expect(resolved.status).toBe(200);
      expect(ScopedSearchPageSchema.parse(await resolved.json()).total).toBe(1);
      expect(
        (await user.SAVED_RESOLVE(post({ page: {}, access: { token: "x".repeat(43) } }), saved.id))
          .status,
      ).toBe(409);
    });
    it("discovers only actual member collections and current named recipient grants", async () => {
      const f = await fixture();
      const member = createMembershipService(db);
      await member.addMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, role: "VIEWER", expectedRevision: 0 },
      );
      const named = await createShareService(db).createShare(
        { userId: f.owner },
        {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "USER", userId: f.viewer },
          expectedRevision: 1,
        },
      );
      const routes = f.handlers(f.viewer).routes;
      const members = await routes.SCOPES(
        new Request(origin + "/api/v1/search/scopes?family=MEMBER_COLLECTION"),
      );
      expect(members.status).toBe(200);
      expect(ScopedDiscoveryPageSchema.parse(await members.json()).items).toEqual([
        { kind: "MEMBER_COLLECTION", collectionId: f.collection.id, name: "Known workspace" },
      ]);
      const shares = await routes.SCOPES(
        new Request(origin + "/api/v1/search/scopes?family=SHARE"),
      );
      expect(shares.status).toBe(200);
      expect(ScopedDiscoveryPageSchema.parse(await shares.json()).items).toEqual([
        { kind: "SHARE", shareId: named.share.id, pinRequired: false },
      ]);
      expect(
        (
          await f
            .handlers(null)
            .routes.SCOPES(new Request(origin + "/api/v1/search/scopes?family=SHARE"))
        ).status,
      ).toBe(401);
      await createShareService(db).revokeShare(
        { userId: f.owner },
        { shareId: named.share.id, expectedRevision: 0 },
      );
      await member.removeMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, expectedRevision: 1 },
      );
      for (const family of ["MEMBER_COLLECTION", "SHARE"]) {
        const response = await routes.SCOPES(
          new Request(origin + "/api/v1/search/scopes?family=" + family),
        );
        expect(ScopedDiscoveryPageSchema.parse(await response.json()).items).toEqual([]);
      }
    });
    it("retains PIN budgets and uses the same existing unlock session for actual scoped HTTP", async () => {
      const f = await fixture(),
        service = createShareService(db);
      const grant = await service.createShare(
        { userId: f.owner },
        {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          pin: "913825",
        },
      );
      const guest = f.handlers(null).routes;
      expect(
        (
          await guest.SEARCH(
            post({
              target: { kind: "SHARE", access: { token: grant.token, pin: "000000" } },
              query: {},
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (await db.sharePinBudget.findUnique({ where: { shareId: grant.share.id } }))?.attempts,
      ).toBe(1);
      const unlocked = await service.resolveShare(null, { token: grant.token, pin: "913825" });
      const target = {
        kind: "SHARE",
        access: { token: grant.token, accessToken: unlocked.accessToken },
      };
      expect((await guest.SEARCH(post({ target, query: {} }))).status).toBe(200);
      expect(
        (await db.sharePinBudget.findUnique({ where: { shareId: grant.share.id } }))?.attempts,
      ).toBe(2);
      await db.$executeRaw`UPDATE "ShareAccessSession" SET "expiresAt"=timezone('UTC',clock_timestamp())-interval '1 second' WHERE "shareId"=${grant.share.id}::uuid`;
      const expired = await guest.SEARCH(post({ target, query: {} }));
      expect(expired.status).toBe(403);
      expect(await expired.text()).not.toContain(unlocked.accessToken!);
    });
    it("accepts a valid 16KiB filter string but denies hidden leaves before matching", async () => {
      const f = await fixture(),
        guest = f.handlers(null).routes;
      const fvalue = JSON.stringify({
        version: 1,
        root: { kind: "media", mediaKind: "IMAGE", test: { op: "missing" } },
      }).padEnd(16384, " ");
      const denied = await guest.SEARCH(
        post({ target: f.target, query: { f: fvalue, text: "no result" } }),
      );
      expect(denied.status).toBe(422);
      const code = z
        .object({ error: z.object({ code: z.string() }).passthrough() })
        .parse(await denied.json());
      expect(code.error.code).toBe("FILTER_UNAVAILABLE");
    });
  },
);
