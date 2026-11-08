import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { CATEGORY_ROUTES, categoryPath } from "./category-routes";
import { localizedMarketingMetadata } from "./page-metadata";
import type { PublicLocale } from "./public-pages";
export const CATEGORY_PAGES = CATEGORY_ROUTES.map((route) => ({
  key: route.key,
  de: { slug: route.de, ...de.Categories.pages[route.key] },
  en: { slug: route.en, ...en.Categories.pages[route.key] },
}));
export type CategoryPage = (typeof CATEGORY_PAGES)[number];
export function findCategory(locale: PublicLocale, slug: string) {
  return CATEGORY_PAGES.find((p) => p[locale].slug === slug) ?? null;
}
export function categoryMetadata(page: CategoryPage, locale: PublicLocale, origin?: string) {
  return localizedMarketingMetadata(
    { de: categoryPath("de", page.de.slug), en: categoryPath("en", page.en.slug) },
    page[locale],
    locale,
    origin,
  );
}
