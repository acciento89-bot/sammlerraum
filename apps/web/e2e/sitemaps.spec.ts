import { test, expect } from "@playwright/test";
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
test.afterAll(async () => {
  await db?.$disconnect();
});
test("actual dynamic robots and sitemap protocol withdraws opted-out URLs immediately", async ({
  request,
  page,
}) => {
  test.skip(!enabled || process.env.RUN_SEO_E2E !== "1", "Owned SEO fixture");
  const f = await searchFixture(),
    handle = `map-${f.foreignId}`;
  try {
    await db!.userProfile.create({
      data: {
        userId: f.ownerId,
        handle,
        displayName: "Public map collector",
        searchEngineIndexingEnabled: true,
        publicLocale: "en",
      },
    });
    await db!.collection.update({ where: { id: f.collectionId }, data: { visibility: "PUBLIC" } });
    await db!.collectibleItem.update({ where: { id: f.itemId }, data: { visibility: "PUBLIC" } });
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
    const index = await request.get("/sitemap.xml");
    expect(index.status()).toBe(200);
    expect(index.headers()["cache-control"]).toBe("no-store");
    async function locs(text: string) {
      return page.evaluate((xml) => {
        const parsed = new DOMParser().parseFromString(xml, "application/xml");
        if (parsed.querySelector("parsererror")) throw new Error("Malformed XML");
        return [...parsed.getElementsByTagName("loc")].map((n) => n.textContent!);
      }, text);
    }
    const links = await locs(await index.text());
    expect(links).toContain(`${origin}/sitemaps/marketing`);
    const marketing = await request.get("/sitemaps/marketing");
    expect(marketing.status()).toBe(200);
    expect((await locs(await marketing.text())).length).toBeGreaterThanOrEqual(6);
    expect(await marketing.text()).not.toContain("<lastmod>");
    const segments = links.filter((url) => url.includes("/sitemaps/community/"));
    const urls: string[] = [];
    for (const link of segments) {
      const res = await request.get(link);
      expect(res.status()).toBe(200);
      expect(res.headers()["cache-control"]).toBe("no-store");
      urls.push(...(await locs(await res.text())));
    }
    expect(urls.filter((url) => url.includes(handle))).toEqual(
      expect.arrayContaining([
        `${origin}/en/@${handle}`,
        `${origin}/en/@${handle}/collection-${f.collectionId}`,
        `${origin}/en/@${handle}/collection-${f.collectionId}/items/${f.itemId}`,
      ]),
    );
    await db!.userProfile.update({
      where: { userId: f.ownerId },
      data: { searchEngineIndexingEnabled: false },
    });
    for (const link of segments) {
      const res = await request.get(link);
      expect(res.status()).toBe(200);
      expect(await res.text()).not.toContain(handle);
    }
    expect((await request.get("/sitemaps/community/invalid")).status()).toBe(404);
  } finally {
    await cleanupSearchFixture(f);
  }
});
