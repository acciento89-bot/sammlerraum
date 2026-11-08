import type { PublicLocale } from "./public-pages";
/** Small closed routing registry, safe for client locale navigation without shipping both copy bundles. */
export const CATEGORY_ROUTES = [
  { key: "tradingCards", de: "sammelkarten", en: "trading-cards" },
  { key: "coins", de: "muenzen", en: "coins" },
  { key: "watches", de: "uhren", en: "watches" },
  { key: "vinyl", de: "schallplatten", en: "vinyl" },
  { key: "comics", de: "comics", en: "comics" },
  { key: "stamps", de: "briefmarken", en: "stamps" },
] as const;
export function categoryPath(locale: PublicLocale, slug: string) {
  return `/${locale}/${locale === "de" ? "sammeln" : "collecting"}/${slug}`;
}
export function categoryLocaleHref(path: string, locale: PublicLocale) {
  const match = /^\/(de\/sammeln|en\/collecting)\/([a-z0-9-]+)$/u.exec(path);
  if (!match) return null;
  const from = match[1]!.startsWith("de") ? "de" : "en",
    item = CATEGORY_ROUTES.find((item) => item[from] === match[2]);
  return item ? categoryPath(locale, item[locale]) : null;
}
