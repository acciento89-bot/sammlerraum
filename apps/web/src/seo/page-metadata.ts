import type { Metadata } from "next";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { PUBLIC_MARKETING_PAGES, type MarketingPage, type PublicLocale } from "./public-pages";

/** Evaluated at request time by dynamic public routes; never fall back to a build-only origin. */
export function siteOrigin(value = process.env.APP_ORIGIN): URL {
  if (!value) throw new Error("Configured application origin required for public metadata");
  const origin = new URL(value);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      "Public metadata requires an HTTP(S) origin without credentials or private path",
    );
  return new URL(origin.origin);
}
export function marketingMetadata(
  page: MarketingPage,
  locale: PublicLocale,
  origin?: string,
): Metadata {
  const base = siteOrigin(origin),
    paths = PUBLIC_MARKETING_PAGES[page];
  const text = (locale === "de" ? de : en).SEO;
  const copy = text[page];
  const image = {
    url: new URL(`/${locale}/opengraph-image`, base).href,
    width: 1200,
    height: 630,
    alt: text.imageAlt,
  };
  return {
    metadataBase: base,
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: paths[locale],
      languages: { "de-DE": paths.de, en: paths.en, "x-default": paths.de },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "Sammlerraum",
      title: copy.title,
      description: copy.description,
      url: new URL(paths[locale], base).href,
      locale: locale === "de" ? "de_DE" : "en_US",
      alternateLocale: locale === "de" ? ["en_US"] : ["de_DE"],
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [image.url],
    },
  };
}
