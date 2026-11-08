import type { Metadata } from "next";
import type { PublicSeoPage } from "@sammlerraum/domain/seo/public-page-query";
import type { PublicLocale } from "./public-pages";
import { siteOrigin } from "./page-metadata";
export function publicPageMetadata(
  page: PublicSeoPage | null,
  locale: PublicLocale,
  origin?: string,
): Metadata {
  if (!page) return { title: "Sammlerraum", robots: { index: false, follow: false } };
  const base = siteOrigin(origin),
    title = `${page.title.slice(0, 100)} · Sammlerraum`,
    description = (page.description ?? page.title).replace(/\s+/gu, " ").trim().slice(0, 180);
  const canonical = page.paths[page.publicLocale],
    image = {
      url: new URL(`/${locale}/opengraph-image`, base).href,
      width: 1200,
      height: 630,
      alt: "Sammlerraum",
    };
  return {
    metadataBase: base,
    title,
    description,
    robots: { index: page.indexability.index, follow: true },
    alternates: {
      canonical,
      languages: { "de-DE": page.paths.de, en: page.paths.en, "x-default": page.paths.de },
    },
    openGraph: {
      type: "website",
      siteName: "Sammlerraum",
      title,
      description,
      url: new URL(canonical, base).href,
      locale: locale === "de" ? "de_DE" : "en_US",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
