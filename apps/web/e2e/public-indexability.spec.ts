import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const)
  test(`${locale}: public SEO opt-in, withdrawal, private ancestors and moderated text`, async ({
    page,
    request,
  }, info) => {
    test.skip(!enabled || process.env.RUN_SEO_E2E !== "1", "Guarded owned public SEO fixture");
    const f = await searchFixture(),
      handle = `seo-${randomUUID()}`,
      secret = `PRIVATE_NOTE_${randomUUID()}`,
      hiddenComment = `HIDDEN_MODERATED_${randomUUID()}`;
    const profilePath = `/${locale}/@${handle}`,
      collectionPath = `${profilePath}/collection-${f.collectionId}`,
      itemPath = `${collectionPath}/items/${f.itemId}`;
    const canonical = (path: string) => origin + path.replace(/^\/(de|en)/u, "/en");
    try {
      await db!.userProfile.create({
        data: {
          userId: f.ownerId,
          handle,
          displayName: "Public SEO collector",
          bio: "Public collector biography",
          publicLocale: "en",
        },
      });
      await db!.collection.update({
        where: { id: f.collectionId },
        data: { visibility: "PUBLIC" },
      });
      await db!.collectibleItem.update({
        where: { id: f.itemId },
        data: {
          visibility: "PUBLIC",
          privateNotes: secret,
          publicDescription: "Public object story",
        },
      });
      await db!.communityComment.create({
        data: {
          authorId: f.foreignId,
          collectionId: f.collectionId,
          itemId: f.itemId,
          body: hiddenComment,
          moderationHiddenAt: new Date(),
        },
      });
      expect((await page.request.get("/api/v1/account/search-indexing")).status()).toBe(401);
      for (const path of [profilePath, collectionPath, itemPath]) {
        expect((await page.goto(path))?.status()).toBe(200);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          "noindex, follow",
        );
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          canonical(path),
        );
        expect(await page.content()).not.toContain(secret);
        expect(await page.content()).not.toContain(hiddenComment);
      }
      expect(
        (
          await request.post("/api/auth/sign-in/email", {
            headers: { origin, "x-forwarded-for": f.ip },
            data: { email: f.email, password: f.password },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await request.put("/api/v1/account/search-indexing", {
            headers: { origin },
            data: { searchEngineIndexingEnabled: true, publicLocale: "en", revision: 0 },
          })
        ).status(),
      ).toBe(200);
      for (const path of [profilePath, collectionPath, itemPath]) {
        expect((await page.goto(path))?.status()).toBe(200);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          "index, follow",
        );
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          canonical(path),
        );
        await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
          "href",
          canonical(path),
        );
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
          "content",
          `${origin}/${locale}/opengraph-image`,
        );
      }
      await page.goto(itemPath + "?utm_source=synthetic&token=not-a-share-token");
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        canonical(itemPath),
      );
      const folder = resolve("../../.superpowers/sdd/2026-09-19-14-seo-search-console/screenshots");
      await mkdir(folder, { recursive: true });
      await page.screenshot({
        path: resolve(folder, `task4-${locale}-${info.project.name}-public-item.png`),
        fullPage: true,
      });
      const pSegment = `p-${createHash("md5").update(f.ownerId).digest("hex").slice(0, 1)}`;
      expect(await (await request.get(`/sitemaps/community/${pSegment}`)).text()).toContain(handle);
      expect(
        (
          await request.put("/api/v1/account/search-indexing", {
            headers: { origin },
            data: { searchEngineIndexingEnabled: false, publicLocale: "en", revision: 1 },
          })
        ).status(),
      ).toBe(200);
      await page.goto(itemPath);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow",
      );
      expect(await (await request.get(`/sitemaps/community/${pSegment}`)).text()).not.toContain(
        handle,
      );
      const node = await db!.collectionNode.create({
        data: { collectionId: f.collectionId, name: "Private ancestor", visibility: "PRIVATE" },
      });
      await db!.collectibleItem.update({ where: { id: f.itemId }, data: { nodeId: node.id } });
      expect((await page.goto(itemPath))?.status()).toBe(404);
      expect(await page.content()).not.toContain(secret);
      await db!.collectibleItem.update({
        where: { id: f.itemId },
        data: { nodeId: null, visibility: "UNLISTED" },
      });
      expect((await page.goto(itemPath))?.status()).toBe(404);
      await db!.collection.update({
        where: { id: f.collectionId },
        data: { visibility: "PRIVATE" },
      });
      expect((await page.goto(collectionPath))?.status()).toBe(404);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
