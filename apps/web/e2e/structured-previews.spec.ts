import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { enabled, origin } from "./support/search-fixture";
for (const locale of ["de", "en"] as const)
  test(`${locale}: factual server-rendered schema and actual branded PNG previews`, async ({
    page,
    request,
  }, info) => {
    test.skip(!enabled || process.env.RUN_SEO_E2E !== "1", "Guarded compiled SEO preview fixture");
    await page.goto(`/${locale}`);
    const graph = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? "null")));
    expect(JSON.stringify(graph)).toContain('"WebApplication"');
    expect(JSON.stringify(graph)).toContain('"Organization"');
    expect(JSON.stringify(graph)).not.toMatch(
      /aggregateRating|reviewCount|ratingValue|SearchAction/u,
    );
    const folder = resolve("../../.superpowers/sdd/2026-09-19-14-seo-search-console/previews");
    await mkdir(folder, { recursive: true });
    const category = locale === "de" ? "/de/sammeln/muenzen" : "/en/collecting/coins";
    for (const [key, path] of [
      ["home", `/${locale}/opengraph-image`],
      ["category", category + "/opengraph-image"],
    ] as const) {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      const bytes = await response.body(),
        meta = await sharp(bytes).metadata();
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(630);
      expect(bytes.length).toBeGreaterThan(10000);
      await writeFile(resolve(folder, `task6-${locale}-${info.project.name}-${key}.png`), bytes);
    }
    await page.goto(category);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      origin + category + "/opengraph-image",
    );
    expect(
      (
        await request.get(
          locale === "de"
            ? "/de/sammeln/invalid/opengraph-image"
            : "/en/collecting/invalid/opengraph-image",
        )
      ).status(),
    ).toBe(404);
    expect((await request.get("/icon.svg")).status()).toBe(200);
  });
