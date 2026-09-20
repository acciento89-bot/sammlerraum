import { defineRouting } from "next-intl/routing";

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";
export const localeCookieName = "NEXT_LOCALE";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});

function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

export function selectLocale(
  cookieLocale: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isLocale(cookieLocale)) return cookieLocale;

  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map((entry, index) => {
      const [language = "", ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const parsedQuality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;
      return {
        locale: language.toLowerCase().split("-")[0],
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
        index,
      };
    })
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  const preferred = preferences.find(({ locale }) => isLocale(locale));
  return isLocale(preferred?.locale) ? preferred.locale : defaultLocale;
}
