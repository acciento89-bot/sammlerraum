import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createShareRouteDependencies, createShareRouteHandlers } from "./share-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const origin = "https://example.invalid";
function post(body: unknown, from = origin) {
  return new Request(origin + "/api/v1/shares", {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function fixture() {
  const owner = randomUUID(),
    outsider = randomUUID();
  for (const id of [owner, outsider])
    await db.user.create({
      data: {
        id,
        name: "Owned sharing HTTP fixture",
        email: `${id}@example.invalid`,
        emailVerified: true,
      },
    });
  const collection = await db.collection.create({
      data: { ownerId: owner, name: "HTTP shared selection" },
    }),
    item = await db.collectibleItem.create({
      data: {
        ownerId: owner,
        collectionId: collection.id,
        title: "Shared HTTP item",
        privateNotes: "hidden-http-sentinel",
      },
    });
  const handlers = (userId: string | null) =>
    createShareRouteHandlers(
      createShareRouteDependencies(
        db,
        { api: { getSession: async () => (userId ? { user: { id: userId } } : null) } },
        origin,
      ),
    );
  return { owner, outsider, collection: collection.id, item, handlers };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "native PostgreSQL granular sharing Request/Response handlers",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("creates through an authenticated owner, resolves anonymously and immediately blocks revoked links", async () => {
      const f = await fixture(),
        owner = f.handlers(f.owner),
        guest = f.handlers(null);
      const created = await owner.CREATE(
        post({
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        }),
      );
      expect(created.status).toBe(201);
      const value = (await created.json()) as {
        share: { id: string; revision: number };
        token: string;
      };
      const response = await guest.RESOLVE(post({ token: value.token }));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(await response.text()).not.toMatch(/hidden-http-sentinel|tokenHash/);
      const revoked = await owner.REVOKE(post({ expectedRevision: 0 }), value.share.id);
      expect(revoked.status).toBe(200);
      expect((await guest.RESOLVE(post({ token: value.token }))).status).toBe(410);
    });
    it("rejects cross-origin access and rejects unauthenticated or forged-actor creation without side effects", async () => {
      const f = await fixture(),
        value = {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        };
      expect((await f.handlers(null).CREATE(post(value))).status).toBe(401);
      expect((await f.handlers(f.outsider).CREATE(post(value))).status).toBe(404);
      expect((await f.handlers(f.owner).CREATE(post({ ...value, actorId: f.owner }))).status).toBe(
        400,
      );
      expect(
        (await f.handlers(f.owner).CREATE(post(value, "https://outside.invalid"))).status,
      ).toBe(403);
      expect(
        (await f.handlers(null).RESOLVE(post({ token: "a".repeat(43) }, "https://outside.invalid")))
          .status,
      ).toBe(403);
      expect(
        await db.$queryRaw`SELECT id FROM "CollectionShare" WHERE "collectionId"=${f.collection}::uuid`,
      ).toEqual([]);
    });
    it("bounds actual JSON input and never accepts an injected query scope", async () => {
      const f = await fixture();
      expect((await f.handlers(f.owner).CREATE(post({ padding: "x".repeat(17000) }))).status).toBe(
        413,
      );
      const bad = new Request(origin + "/api/v1/shares?ownerId=" + f.owner, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: "{}",
      });
      expect((await f.handlers(f.owner).CREATE(bad)).status).toBe(400);
    });
  },
);
