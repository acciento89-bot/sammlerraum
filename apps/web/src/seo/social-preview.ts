import type { PublicSeoPage } from "@sammlerraum/domain/seo/public-page-query";
import type { CategoryPage } from "./category-pages";
import type { PublicLocale } from "./public-pages";
export type OgModel = {
  imageKind: "BRANDED_FALLBACK";
  title: string;
  subtitle: string;
  caption: string;
};
export function buildItemOgModel(_page: PublicSeoPage | null, locale: PublicLocale): OgModel {
  return {
    imageKind: "BRANDED_FALLBACK",
    title: "Sammlerraum",
    subtitle: locale === "de" ? "Für Dinge, die bleiben." : "For things worth keeping.",
    caption:
      locale === "de"
        ? "Sammlungen ordnen. Geschichten bewahren."
        : "Organize collections. Preserve their stories.",
  };
}
export function buildCategoryOgModel(page: CategoryPage, locale: PublicLocale): OgModel {
  return {
    ...buildItemOgModel(null, locale),
    subtitle: page[locale].name,
    caption: page[locale].description,
  };
}
