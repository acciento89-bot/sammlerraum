import { describe, expect, it } from "vitest";
import { CATEGORY_PAGES, findCategory, categoryMetadata } from "./category-pages";
import { categoryLocaleHref } from "./category-routes";
describe("six deliberately curated bilingual category pages", () => {
  it("defines substantial category-specific copy and structured sections for all six topics", () => {
    expect(CATEGORY_PAGES.map((p) => p.key)).toEqual([
      "tradingCards",
      "coins",
      "watches",
      "vinyl",
      "comics",
      "stamps",
    ]);
    for (const page of CATEGORY_PAGES)
      for (const locale of ["de", "en"] as const) {
        expect(page[locale].intro.length).toBeGreaterThan(250);
        expect(Object.values(page[locale].sections)).toHaveLength(3);
        expect(Object.values(page[locale].sections).every((s) => s.body.length > 90)).toBe(true);
        expect(findCategory(locale, page[locale].slug)).toBe(page);
        const metadata = categoryMetadata(page, locale, "https://sammlerraum.de");
        expect(metadata.robots).toMatchObject({ index: true, follow: true });
        expect(metadata.openGraph).toMatchObject({
          images: [
            {
              url: `https://sammlerraum.de/${locale}/${locale === "de" ? "sammeln" : "collecting"}/${page[locale].slug}/opengraph-image`,
            },
          ],
        });
        expect(metadata.alternates?.languages).toMatchObject({
          "de-DE": `/de/sammeln/${page.de.slug}`,
          en: `/en/collecting/${page.en.slug}`,
          "x-default": `/de/sammeln/${page.de.slug}`,
        });
      }
  });
  it("does not manufacture pages from arbitrary tags, private filters or wrong-language slugs", () => {
    for (const slug of ["private", "red-coins", "?q=token", "../account", "trading-cards"])
      expect(findCategory("de", slug)).toBeNull();
    expect(categoryLocaleHref("/de/sammeln/muenzen", "en")).toBe("/en/collecting/coins");
    expect(categoryLocaleHref("/en/collecting/coins", "de")).toBe("/de/sammeln/muenzen");
    for (const path of [
      "/de/search?q=coins",
      "/de/sammeln/muenzen?token=secret",
      "/en/sammeln/muenzen",
      "/de/account/profile",
    ])
      expect(categoryLocaleHref(path, "en")).toBeNull();
  });
});
