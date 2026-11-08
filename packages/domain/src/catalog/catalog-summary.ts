import {
  CatalogTitleSummarySchema,
  CatalogVariantSummarySchema,
} from "@sammlerraum/contracts/catalog-reads";
import type { CatalogText, CatalogSnapshot } from "@sammlerraum/contracts/catalog";

export function catalogTitleSummary(text: CatalogText) {
  return CatalogTitleSummarySchema.parse({
    language: text.language,
    title: text.title,
    translations: text.translations.map(({ language, title }) => ({ language, title })),
  });
}
export function catalogVariantSummary(variant: CatalogSnapshot["variants"][number]) {
  return CatalogVariantSummarySchema.parse({
    id: variant.id,
    text: catalogTitleSummary(variant.text),
    ...(variant.language === undefined ? {} : { language: variant.language }),
    ...(variant.edition === undefined ? {} : { edition: variant.edition }),
    ...(variant.reference === undefined ? {} : { reference: variant.reference }),
  });
}
