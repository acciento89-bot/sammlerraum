import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createSocialService } from "./social-service";
import { createBlockReportService } from "../moderation/block-report-service";
import { createFeedService } from "./feed-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual query-time community feed privacy",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function user() {
      const id = randomUUID();
      await db.user.create({
        data: {
          id,
          name: "Never login-name fallback",
          email: `${id}@example.invalid`,
          emailVerified: true,
          profile: {
            create: {
              handle: `u_${id.replaceAll("-", "").slice(0, 20)}`,
              displayName: "Public collector",
            },
          },
        },
      });
      return { userId: id };
    }
    async function fixture() {
      const owner = await user(),
        viewer = await user(),
        collection = await db.collection.create({
          data: { ownerId: owner.userId, name: "Public feed collection", visibility: "PUBLIC" },
        });
      const item = await createItemService(db, owner.userId).createItem({
        collectionId: collection.id,
        title: "Public feed item",
        visibility: "PUBLIC",
        publicDescription: "Public description",
        privateNotes: "never-feed-private-notes",
      });
      return { owner, viewer, collection, item, service: createFeedService(db) };
    }
    it("drops formerly public item/collection activity and never exposes private notes, acquisition data or email", async () => {
      const f = await fixture();
      const page = await f.service.getFeed(f.viewer, {});
      expect(page.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: f.item.id, title: "Public feed item" }),
        ]),
      );
      expect(JSON.stringify(page)).not.toMatch(
        /never-feed-private-notes|privateNotes|purchaseAmountMinor|@example.invalid|Never login-name/,
      );
      await createItemService(db, f.owner.userId).updateItem(f.item.id, { visibility: "PRIVATE" });
      expect((await f.service.getFeed(f.viewer, {})).items.map((i) => i.id)).not.toContain(
        f.item.id,
      );
      await createItemService(db, f.owner.userId).updateItem(f.item.id, { visibility: "PUBLIC" });
      await db.collection.update({
        where: { id: f.collection.id },
        data: { visibility: "PRIVATE" },
      });
      expect((await f.service.getFeed(f.viewer, {})).items.map((i) => i.id)).not.toContain(
        f.item.id,
      );
    });
    it("applies following and both-direction block policy at query time", async () => {
      const f = await fixture();
      expect(
        (await f.service.getFeed(f.viewer, { scope: "FOLLOWING" })).items.map((i) => i.id),
      ).not.toContain(f.item.id);
      await createSocialService(db).followUser(f.viewer, f.owner.userId);
      expect(
        (await f.service.getFeed(f.viewer, { scope: "FOLLOWING" })).items.map((i) => i.id),
      ).toContain(f.item.id);
      await createBlockReportService(db).blockUser(f.owner, f.viewer.userId);
      expect((await f.service.getFeed(f.viewer, {})).items.map((i) => i.id)).not.toContain(
        f.item.id,
      );
    });
    it("excludes public items below a currently hidden ancestor", async () => {
      const f = await fixture();
      const root = await db.collectionNode.create({
        data: { collectionId: f.collection.id, name: "Hidden ancestor", visibility: "PRIVATE" },
      });
      await db.collectibleItem.update({ where: { id: f.item.id }, data: { nodeId: root.id } });
      expect((await f.service.getFeed(f.viewer, {})).items.map((i) => i.id)).not.toContain(
        f.item.id,
      );
    });
    it("lists current public saved items and drops private or removed favorites", async () => {
      const f = await fixture(),
        social = createSocialService(db);
      await social.favoriteTarget(f.viewer, { type: "ITEM", id: f.item.id });
      expect(
        (await f.service.getFeed(f.viewer, { scope: "FAVORITES" })).items.map((i) => i.id),
      ).toContain(f.item.id);
      await createItemService(db, f.owner.userId).updateItem(f.item.id, { visibility: "PRIVATE" });
      expect(
        (await f.service.getFeed(f.viewer, { scope: "FAVORITES" })).items.map((i) => i.id),
      ).not.toContain(f.item.id);
    });
    it("uses bounded deterministic pages without exposing private cursor references", async () => {
      const f = await fixture();
      await createSocialService(db).followUser(f.viewer, f.owner.userId);
      await db.collectibleItem.createMany({
        data: Array.from({ length: 54 }, (_, i) => ({
          ownerId: f.owner.userId,
          collectionId: f.collection.id,
          title: `Own public page ${i}`,
          visibility: "PUBLIC" as const,
        })),
      });
      const page = await f.service.getFeed(f.viewer, { scope: "FOLLOWING", limit: 50 });
      expect(page.items).toHaveLength(50);
      expect(page.next).toBeTruthy();
      const next = await f.service.getFeed(f.viewer, {
        scope: "FOLLOWING",
        limit: 50,
        afterId: page.next,
      });
      expect(next.items).toHaveLength(5);
      expect(new Set([...page.items, ...next.items].map((i) => i.id)).size).toBe(55);
      await expect(f.service.getFeed(f.viewer, { limit: 51 })).rejects.toMatchObject({
        code: "COMMUNITY_INVALID",
      });
    });
  },
);
