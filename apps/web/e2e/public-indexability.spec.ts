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
        await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
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
        const structured = await page
          .locator('script[type="application/ld+json"]')
          .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? "null")));
        expect(JSON.stringify(structured)).toContain("BreadcrumbList");
        expect(JSON.stringify(structured)).not.toMatch(/Product|offers|price|aggregateRating/u);
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
      // Actual compiled navigation must keep the resource, including in both directions.
      for (const path of [profilePath, collectionPath, itemPath]) {
        await page.goto(path + "?token=synthetic-no-copy");
        const other = locale === "de" ? "en" : "de";
        const target = path.replace(/^\/(de|en)/u, `/${other}`);
        await page.locator(`.language-nav a[hreflang="${other}"]`).click();
        await expect(page).toHaveURL(origin + target);
        await page.locator(`.language-nav a[hreflang="${locale}"]`).click();
        await expect(page).toHaveURL(origin + path);
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
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
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

for (const locale of ["de", "en"] as const)
  test(`${locale}: public collection and item images reserve space while an authorized image is delayed`, async ({
    page,
  }) => {
    test.skip(!enabled || process.env.RUN_SEO_E2E !== "1", "Guarded owned public image fixture");
    const f = await searchFixture(),
      handle = `image-${randomUUID()}`;
    let release: (() => void) | undefined;
    try {
      await db!.userProfile.create({
        data: { userId: f.ownerId, handle, displayName: "Owned image collector" },
      });
      await db!.collection.update({
        where: { id: f.collectionId },
        data: { visibility: "PUBLIC" },
      });
      await db!.collectibleItem.update({
        where: { id: f.itemId },
        data: { visibility: "PUBLIC", publicDescription: "Owned public image story" },
      });
      const asset = await db!.mediaAsset.create({
        data: {
          ownerId: f.ownerId,
          kind: "IMAGE",
          status: "READY",
          storageKey: `owned-seo-test/${randomUUID()}`,
          mimeType: "image/png",
          byteSize: 68n,
          checksumSha256: "0".repeat(64),
          originalFileName: "owned.png",
          width: 1,
          height: 1,
        },
      });
      await db!.mediaLink.create({
        data: { assetId: asset.id, ownerId: f.ownerId, itemId: f.itemId, position: 0 },
      });
      for (const suffix of ["", `/items/${f.itemId}`]) {
        const delayed = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route(`**/api/v1/media/${asset.id}/medium`, async (route) => {
          await delayed;
          await route.fulfill({
            contentType: "image/png",
            body: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5HcAAAAASUVORK5CYII=",
              "base64",
            ),
          });
        });
        await page.goto(`/${locale}/@${handle}/collection-${f.collectionId}${suffix}`, {
          waitUntil: "domcontentloaded",
        });
        const image = page.locator(`.public-collector img[src*="${asset.id}"]`);
        await expect(image).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const before = await image.boundingBox();
        const following = image.locator("xpath=following-sibling::*[1]");
        const beforeText = await following.boundingBox();
        expect(before!.height).toBeGreaterThan(80);
        release!();
        await expect
          .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
          .toBe(true);
        const after = await image.boundingBox(),
          afterText = await following.boundingBox();
        expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
        expect(Math.abs(afterText!.y - beforeText!.y)).toBeLessThan(1);
        await page.unroute(`**/api/v1/media/${asset.id}/medium`);
      }
    } finally {
      release?.();
      await db!.mediaLink.deleteMany({ where: { ownerId: f.ownerId } });
      await db!.mediaAsset.deleteMany({ where: { ownerId: f.ownerId } });
      await cleanupSearchFixture(f);
    }
  });
