export const PUBLIC_MARKETING_PAGES = {
  home: { de: "/de", en: "/en" },
  features: { de: "/de/funktionen", en: "/en/features" },
  pricing: { de: "/de/preise", en: "/en/pricing" },
} as const;
export type MarketingPage = keyof typeof PUBLIC_MARKETING_PAGES;
export type PublicLocale = "de" | "en";
export function isPublicLocale(value: string): value is PublicLocale {
  return value === "de" || value === "en";
}
/** Closed public paths only: private route identity and retained search state stay with their own helpers. */
export function marketingLocaleHref(path: string, locale: string): string | null {
  if (!isPublicLocale(locale)) return null;
  if (/^\/(?:de|en)\/?$/u.test(path)) return PUBLIC_MARKETING_PAGES.home[locale];
  if (/^\/(?:de|en)\/(?:funktionen|features)$/u.test(path))
    return PUBLIC_MARKETING_PAGES.features[locale];
  if (/^\/(?:de|en)\/(?:preise|pricing)$/u.test(path))
    return PUBLIC_MARKETING_PAGES.pricing[locale];
  return null;
}
