import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { PUBLIC_MARKETING_PAGES } from "../src/seo/public-pages";
const enabled = process.env.RUN_MARKETING_E2E === "1";
const runtimeOrigin = "https://runtime-seo.example.test";
for (const locale of ["de", "en"] as const) {
  test(`${locale}: canonical marketing pages and legacy alias through real production rendering`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Dedicated read-only compiled marketing fixture");
    const copy = locale === "de" ? de : en;
    // Metadata must not trigger external image/provider requests while its later image stage is pending.
    await page.route(runtimeOrigin + "/**", (route) => route.abort("blockedbyclient"));
    for (const key of ["home", "features", "pricing"] as const) {
      await page.goto(PUBLIC_MARKETING_PAGES[key][locale]);
      await expect(page).toHaveTitle(copy.SEO[key].title);
      const heading =
        key === "home"
          ? copy.Home.title
          : key === "features"
            ? copy.SEO.featuresTitle
            : copy.Billing.pricingTitle;
      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        runtimeOrigin + PUBLIC_MARKETING_PAGES[key][locale],
      );
      for (const [lang, path] of [
        ["de-DE", PUBLIC_MARKETING_PAGES[key].de],
        ["en", PUBLIC_MARKETING_PAGES[key].en],
        ["x-default", PUBLIC_MARKETING_PAGES[key].de],
      ])
        await expect(page.locator(`link[rel="alternate"][hreflang="${lang}"]`)).toHaveAttribute(
          "href",
          runtimeOrigin + path,
        );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /^index, follow$/u,
      );
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
        "content",
        runtimeOrigin + PUBLIC_MARKETING_PAGES[key][locale],
      );
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        "content",
        "summary_large_image",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const folder = resolve("../../.superpowers/sdd/2026-09-19-14-seo-search-console/screenshots");
      await mkdir(folder, { recursive: true });
      await page.screenshot({
        path: resolve(folder, `task1-${locale}-${info.project.name}-${key}.png`),
        fullPage: true,
      });
    }
    const other = locale === "de" ? "en" : "de";
    await page
      .getByRole("navigation", { name: copy.Shell.language })
      .getByRole("link", {
        name: locale === "de" ? copy.Shell.english : copy.Shell.german,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(PUBLIC_MARKETING_PAGES.pricing[other] + "$"));
    if (locale === "de") {
      await page.goto("/de/pricing");
      await expect(
        page.getByRole("heading", { level: 1, name: de.Billing.pricingTitle }),
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /^noindex, follow$/u,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        runtimeOrigin + "/de/preise",
      );
    }
    await page.goto(`/${locale}/login`);
    await expect(
      page.getByRole("heading", { level: 1, name: copy.Auth.loginTitle, exact: true }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /^noindex, nofollow$/u,
    );
  });
}
