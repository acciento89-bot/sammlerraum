import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createSocialDependencies, createSocialHandlers } from "./social-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const origin = "https://example.invalid";
function request(path: string, body?: unknown, method = "POST") {
  return new Request(
    origin + path,
    body === undefined
      ? {}
      : {
          method,
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual community Request/Response persistence",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("uses the actual actor for follow/favorite, lists only current public facts and supports safe removal", async () => {
      const actor = randomUUID(),
        owner = randomUUID();
      for (const id of [actor, owner])
        await db.user.create({
          data: {
            id,
            name: "Own community HTTP fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
            profile: {
              create: {
                handle: `u_${id.replaceAll("-", "").slice(0, 20)}`,
                displayName: "Community display",
              },
            },
          },
        });
      const handlers = createSocialHandlers(
          createSocialDependencies(
            db,
            { api: { getSession: async () => ({ user: { id: actor } }) } },
            origin,
          ),
        ),
        c = await db.collection.create({
          data: { ownerId: owner, name: "Public HTTP collection", visibility: "PUBLIC" },
        }),
        item = await createItemService(db, owner).createItem({
          collectionId: c.id,
          title: "Public HTTP target",
          visibility: "PUBLIC",
          privateNotes: "never-community-private-description",
        });
      expect(
        (await handlers.FOLLOW(request("/api/v1/community/follows", { userId: owner }))).status,
      ).toBe(200);
      expect(await db.userFollow.count({ where: { followerId: actor, followedId: owner } })).toBe(
        1,
      );
      expect(
        (
          await handlers.FAVORITE(
            request("/api/v1/community/favorites", { type: "ITEM", id: item.id }),
          )
        ).status,
      ).toBe(200);
      const listing = await handlers.FAVORITES(request("/api/v1/community/favorites"));
      expect(listing.status).toBe(200);
      expect(listing.headers.get("cache-control")).toBe("no-store");
      const body = await listing.json();
      expect(JSON.stringify(body)).toContain("Public HTTP target");
      expect(JSON.stringify(body)).not.toMatch(
        /never-community-private-description|privateNotes|purchaseAmountMinor|@example.invalid/,
      );
      await createItemService(db, owner).updateItem(item.id, { visibility: "PRIVATE" });
      expect(
        await (await handlers.FAVORITES(request("/api/v1/community/favorites"))).json(),
      ).toMatchObject({ favorites: [] });
      expect(
        (
          await handlers.UNFAVORITE(
            request("/api/v1/community/favorites", { type: "ITEM", id: item.id }, "DELETE"),
          )
        ).status,
      ).toBe(200);
      expect(await db.favorite.count({ where: { userId: actor } })).toBe(0);
      expect(
        (await handlers.UNFOLLOW(request("/api/v1/community/follows", { userId: owner }, "DELETE")))
          .status,
      ).toBe(200);
      expect(await db.userFollow.count({ where: { followerId: actor } })).toBe(0);
    });
  },
);
