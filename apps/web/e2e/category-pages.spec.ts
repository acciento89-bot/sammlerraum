import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { CATEGORY_ROUTES, categoryPath } from "../src/seo/category-routes";
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
const CATEGORY_PAGES = CATEGORY_ROUTES.map((route) => ({
  key: route.key,
  de: { slug: route.de, ...de.Categories.pages[route.key] },
  en: { slug: route.en, ...en.Categories.pages[route.key] },
}));
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const)
  test(`${locale}: all six actual category pages, reciprocal language navigation and noindex search`, async ({
    page,
  }, info) => {
    test.skip(!enabled || process.env.RUN_SEO_E2E !== "1", "Guarded category and search fixture");
    const copy = locale === "de" ? de : en,
      other = locale === "de" ? "en" : "de";
    for (const category of CATEGORY_PAGES) {
      const path = categoryPath(locale, category[locale].slug);
      expect((await page.goto(path))?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: category[locale].title, exact: true }),
      ).toBeVisible();
      await expect(page).toHaveTitle(category[locale].title);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + path);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
        "href",
        origin + categoryPath("en", category.en.slug),
      );
      await expect(
        page.getByRole("link", { name: copy.Categories.create, exact: true }),
      ).toHaveAttribute("href", `/${locale}/register`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (category.key === "coins") {
        const folder = resolve(
          "../../.superpowers/sdd/2026-09-19-14-seo-search-console/screenshots",
        );
        await mkdir(folder, { recursive: true });
        await page.screenshot({
          path: resolve(folder, `task5-${locale}-${info.project.name}-coins.png`),
          fullPage: true,
        });
      }
      await page
        .locator(".language-nav")
        .getByRole("link", { name: other === "de" ? "Deutsch" : "English", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(categoryPath(other, category[other].slug) + "$"));
      await expect(
        page.getByRole("heading", { level: 1, name: category[other].title, exact: true }),
      ).toBeVisible();
    }
    expect(
      (
        await page.goto(
          locale === "de" ? "/de/sammeln/not-a-category" : "/en/collecting/not-a-category",
        )
      )?.status(),
    ).toBe(404);
    const f = await searchFixture();
    try {
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            headers: { origin, "x-forwarded-for": f.ip },
            data: { email: f.email, password: f.password },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/${locale}/search?q=invalid-filter&sort=title&page=999`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow",
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${origin}/${locale}/search`,
      );
    } finally {
      await cleanupSearchFixture(f);
    }
  });
