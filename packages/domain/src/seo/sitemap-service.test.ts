import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createItemService } from "../items/item-service";
import { createCommunitySitemapService } from "./sitemap-service";
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual privacy-safe bounded community sitemaps",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>,
      isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture(consent = true) {
      const who = randomUUID(),
        handle = `map-${randomUUID()}`,
        when = new Date("2026-01-02T03:04:05Z");
      await db.user.create({
        data: {
          id: who,
          email: `${who}@example.invalid`,
          name: "Private login name",
          profile: {
            create: {
              handle,
              displayName: "Public name",
              searchEngineIndexingEnabled: consent,
              publicLocale: "en",
              updatedAt: when,
            },
          },
        },
      });
      const c = await db.collection.create({
        data: { ownerId: who, name: "Public collection", visibility: "PUBLIC", updatedAt: when },
      });
      const items = createItemService(db, who),
        item = await items.createItem({
          collectionId: c.id,
          title: "Public item",
          visibility: "PUBLIC",
          privateNotes: "private seed",
        });
      await db.collectibleItem.update({ where: { id: item.id }, data: { updatedAt: when } });
      const node = await db.collectionNode.create({
        data: { collectionId: c.id, name: "Private ancestor", visibility: "PRIVATE" },
      });
      const nested = await items.createItem({
        collectionId: c.id,
        nodeId: node.id,
        title: "Hidden child",
        visibility: "PUBLIC",
      });
      const unlisted = await items.createItem({
        collectionId: c.id,
        title: "Unlisted",
        visibility: "UNLISTED",
      });
      const priv = await items.createItem({
        collectionId: c.id,
        title: "Private",
        visibility: "PRIVATE",
      });
      const deleted = await items.createItem({
        collectionId: c.id,
        title: "Deleted",
        visibility: "PUBLIC",
      });
      await db.collectibleItem.update({
        where: { id: deleted.id },
        data: { deletedAt: new Date() },
      });
      return {
        who,
        handle,
        c,
        item,
        nested,
        unlisted,
        priv,
        deleted,
        when,
        service: createCommunitySitemapService(db),
      };
    }
    async function all(service: ReturnType<typeof createCommunitySitemapService>, size = 10000) {
      const pages = await service.listSegments(size),
        rows = (
          await Promise.all(pages.map((p) => service.getIndexableCommunityPage(p, size)))
        ).flat();
      return { pages, rows };
    }
    it("includes only explicitly opted-in currently public resources with real dates and preferred canonical locale", async () => {
      const f = await fixture(),
        off = await fixture(false),
        { rows } = await all(f.service);
      const own = rows.filter((r) => r.path.includes(f.handle));
      expect(own).toHaveLength(3);
      expect(
        own.every(
          (r) =>
            r.path.startsWith("/en/@") && r.lastModified.toISOString() === f.when.toISOString(),
        ),
      ).toBe(true);
      expect(rows.some((r) => r.path.includes(off.handle))).toBe(false);
      const serialized = JSON.stringify(rows);
      for (const hidden of [
        f.nested.id,
        f.unlisted.id,
        f.priv.id,
        f.deleted.id,
        "private seed",
        f.who,
        "?token=",
      ])
        expect(serialized).not.toContain(hidden);
    });
    it("withdrawal immediately removes all owned URLs even from a previously discovered segment", async () => {
      const f = await fixture(),
        before = await all(f.service);
      await db.userProfile.update({
        where: { userId: f.who },
        data: { searchEngineIndexingEnabled: false },
      });
      const rows = (
        await Promise.all(before.pages.map((p) => f.service.getIndexableCommunityPage(p)))
      ).flat();
      expect(rows.some((r) => r.path.includes(f.handle))).toBe(false);
    });
    it("rechecks parent visibility on every segment read", async () => {
      const f = await fixture(),
        page = `i-${createHash("md5").update(f.item.id).digest("hex").slice(0, 1)}`;
      expect(
        (await f.service.getIndexableCommunityPage(page)).some((r) => r.path.includes(f.item.id)),
      ).toBe(true);
      await db.collection.update({ where: { id: f.c.id }, data: { visibility: "PRIVATE" } });
      expect(
        (await f.service.getIndexableCommunityPage(page)).some((r) => r.path.includes(f.item.id)),
      ).toBe(false);
    });
    it("splits full stable hash ranges without duplicates or silently truncated URLs", async () => {
      const f = await fixture(),
        first = await all(f.service, 2),
        second = await all(f.service, 2);
      expect(first.pages).toEqual(second.pages);
      expect(first.rows.map((r) => r.path).sort()).toEqual(second.rows.map((r) => r.path).sort());
      expect(new Set(first.rows.map((r) => r.path)).size).toBe(first.rows.length);
      expect(first.rows.filter((r) => r.path.includes(f.handle))).toHaveLength(3);
      for (const page of first.pages)
        expect((await f.service.getIndexableCommunityPage(page, 2)).length).toBeLessThanOrEqual(2);
    });
    it("really splits a range exceeding10000 records and never returns a partial overflow", async () => {
      const f = await fixture(),
        ids: string[] = [];
      while (ids.length < 10001) {
        const id = randomUUID();
        if (createHash("md5").update(id).digest("hex").startsWith("a")) ids.push(id);
      }
      for (let n = 0; n < ids.length; n += 500)
        await db.collectibleItem.createMany({
          data: ids.slice(n, n + 500).map((id) => ({
            id,
            ownerId: f.who,
            collectionId: f.c.id,
            title: "Owned scale fixture",
            visibility: "PUBLIC" as const,
          })),
        });
      await expect(f.service.getIndexableCommunityPage("i-a")).rejects.toThrow("segment changed");
      const index = await f.service.listSegments();
      expect(index).not.toContain("i-a");
      const split = index.filter((p) => p.startsWith("i-a"));
      expect(split.length).toBeGreaterThan(1);
      const actual = (
        await Promise.all(split.map((p) => f.service.getIndexableCommunityPage(p)))
      ).flat();
      const paths = new Set(actual.map((r) => r.path));
      for (const id of ids)
        expect(paths.has(`/en/@${f.handle}/collection-${f.c.id}/items/${id}`)).toBe(true);
      expect(new Set(actual.map((r) => r.path)).size).toBe(actual.length);
    }, 20000);
    it("rejects arbitrary page IDs, injected SQL and unbounded page sizes", async () => {
      const f = await fixture();
      for (const page of ["", "../secret", "p-' OR true", "i-zz", "p-" + "0".repeat(33)])
        await expect(f.service.getIndexableCommunityPage(page)).rejects.toThrow();
      for (const size of [0, -1, 10001, 1.5])
        await expect(f.service.listSegments(size)).rejects.toThrow();
    });
  },
);
