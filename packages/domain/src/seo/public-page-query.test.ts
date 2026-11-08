import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createPublicPageQuery } from "./public-page-query";
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual current public SEO projection",
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
    async function fixture() {
      const id = randomUUID(),
        handle = `seo-${randomUUID()}`;
      await db.user.create({
        data: {
          id,
          email: `${id}@private.invalid`,
          name: "PRIVATE_LOGIN_NAME",
          profile: {
            create: {
              handle,
              displayName: "Public display",
              bio: "Public biography",
              publicLocale: "en",
            },
          },
        },
      });
      const c = await db.collection.create({
          data: { ownerId: id, name: "Public collection", visibility: "PUBLIC" },
        }),
        item = await db.collectibleItem.create({
          data: {
            ownerId: id,
            collectionId: c.id,
            title: "Public item",
            publicDescription: "Public description",
            visibility: "PUBLIC",
            privateNotes: "SECRET_NOTE",
            purchaseAmountMinor: 12345n,
            purchaseCurrency: "EUR",
          },
        });
      return {
        id,
        handle: `@${handle}`,
        c,
        item,
        slug: `collection-${c.id}`,
        query: createPublicPageQuery(db),
      };
    }
    it("projects only authorized public fields, never login identity, notes, money or original-media keys", async () => {
      const f = await fixture(),
        page = await f.query.getPublicItemSeoPage(f.handle, f.slug, f.item.id);
      expect(page).toMatchObject({
        title: "Public item",
        description: "Public description",
        publicLocale: "en",
        indexability: { index: false, reason: "PROFILE_OPT_OUT" },
      });
      const json = JSON.stringify(page);
      for (const value of [
        "SECRET_NOTE",
        "PRIVATE_LOGIN_NAME",
        "private.invalid",
        f.id,
        "purchaseAmount",
        "storageLocation",
        "checksum",
        "storageKey",
      ])
        expect(json).not.toContain(value);
      expect(Object.keys(page!).sort()).toEqual([
        "description",
        "indexability",
        "kind",
        "paths",
        "profile",
        "publicLocale",
        "title",
        "updatedAt",
      ]);
    });
    it("re-reads explicit consent and preferred public locale without stale caching", async () => {
      const f = await fixture();
      expect((await f.query.getPublicProfileSeoPage(f.handle))?.indexability.index).toBe(false);
      await db.userProfile.update({
        where: { userId: f.id },
        data: { searchEngineIndexingEnabled: true, publicLocale: "de" },
      });
      expect(await f.query.getPublicCollectionSeoPage(f.handle, f.slug)).toMatchObject({
        publicLocale: "de",
        indexability: { index: true, reason: "INDEXABLE" },
      });
      await db.userProfile.update({
        where: { userId: f.id },
        data: { searchEngineIndexingEnabled: false },
      });
      expect(
        (await f.query.getPublicItemSeoPage(f.handle, f.slug, f.item.id))?.indexability.index,
      ).toBe(false);
    });
    it("returns no SEO projection for unlisted, private, deleted or another owner's resources", async () => {
      const f = await fixture(),
        other = await fixture();
      expect(await f.query.getPublicItemSeoPage(other.handle, f.slug, f.item.id)).toBeNull();
      for (const visibility of ["UNLISTED", "PRIVATE"] as const) {
        await db.collectibleItem.update({ where: { id: f.item.id }, data: { visibility } });
        expect(await f.query.getPublicItemSeoPage(f.handle, f.slug, f.item.id)).toBeNull();
      }
      await db.collectibleItem.update({
        where: { id: f.item.id },
        data: { visibility: "PUBLIC", deletedAt: new Date() },
      });
      expect(await f.query.getPublicItemSeoPage(f.handle, f.slug, f.item.id)).toBeNull();
      await db.collection.update({ where: { id: f.c.id }, data: { visibility: "UNLISTED" } });
      expect(await f.query.getPublicCollectionSeoPage(f.handle, f.slug)).toBeNull();
    });
    it("never projects a public item below private or unlisted ancestors", async () => {
      const f = await fixture(),
        parent = await db.collectionNode.create({
          data: { collectionId: f.c.id, name: "Hidden parent", visibility: "PRIVATE" },
        });
      await db.collectibleItem.update({ where: { id: f.item.id }, data: { nodeId: parent.id } });
      for (const visibility of ["PRIVATE", "UNLISTED"] as const) {
        await db.collectionNode.update({ where: { id: parent.id }, data: { visibility } });
        expect(await f.query.getPublicItemSeoPage(f.handle, f.slug, f.item.id)).toBeNull();
      }
      await db.collectionNode.update({ where: { id: parent.id }, data: { visibility: "PUBLIC" } });
      expect(await f.query.getPublicItemSeoPage(f.handle, f.slug, f.item.id)).not.toBeNull();
    });
    it("rejects malformed handles and IDs instead of falling back to another resource", async () => {
      const f = await fixture();
      for (const handle of ["%ZZ", "someone", "@' OR true"])
        expect(await f.query.getPublicProfileSeoPage(handle)).toBeNull();
      expect(await f.query.getPublicItemSeoPage(f.handle, "../secret", f.item.id)).toBeNull();
      expect(await f.query.getPublicItemSeoPage(f.handle, f.slug, "' OR true")).toBeNull();
    });
  },
);
