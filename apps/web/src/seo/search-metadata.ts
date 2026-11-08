import type { Metadata } from "next";
import type { PublicLocale } from "./public-pages";
import { siteOrigin } from "./page-metadata";
export function searchMetadata(locale: PublicLocale, origin?: string): Metadata {
  return {
    metadataBase: siteOrigin(origin),
    title:
      locale === "de"
        ? "Sammlung durchsuchen · Sammlerraum"
        : "Search your collection · Sammlerraum",
    robots: { index: false, follow: true },
    alternates: { canonical: `/${locale}/search` },
  };
}
