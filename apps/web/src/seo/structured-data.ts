import type { PublicSeoPage } from "@sammlerraum/domain/seo/public-page-query";
import { siteOrigin } from "./page-metadata";
function url(path: string, origin: string) {
  return new URL(path, siteOrigin(origin)).href;
}
export function websiteJsonLd(origin: string) {
  const base = siteOrigin(origin).origin;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": base + "/#organization",
        name: "Kamilunavo",
        url: "https://kamilunavo.com",
        brand: { "@type": "Brand", name: "Sammlerraum", logo: base + "/icon.svg" },
      },
      {
        "@type": "WebSite",
        "@id": base + "/#website",
        name: "Sammlerraum",
        url: base,
        inLanguage: ["de", "en"],
        publisher: { "@id": base + "/#organization" },
      },
      {
        "@type": "WebApplication",
        "@id": base + "/#application",
        name: "Sammlerraum",
        url: base,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web browser",
        inLanguage: ["de", "en"],
        publisher: { "@id": base + "/#organization" },
      },
    ],
  };
}
function pageSchema(page: PublicSeoPage, origin: string, type: string) {
  if (!page.indexability.index) return null;
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": url(page.paths[page.publicLocale], origin) + "#webpage",
    url: url(page.paths[page.publicLocale], origin),
    name: page.title,
    ...(page.description ? { description: page.description } : {}),
    inLanguage: ["de", "en"],
    isPartOf: { "@id": siteOrigin(origin).origin + "/#website" },
  };
}
export function profilePageJsonLd(page: PublicSeoPage, origin: string) {
  const value = pageSchema(page, origin, "ProfilePage");
  return value
    ? {
        ...value,
        mainEntity: { "@type": "Person", name: page.profile.displayName, url: value.url },
      }
    : null;
}
export function collectionPageJsonLd(page: PublicSeoPage, origin: string) {
  return pageSchema(page, origin, "CollectionPage");
}
export function publicItemJsonLd(page: PublicSeoPage, origin: string) {
  return pageSchema(page, origin, "WebPage");
}
export function breadcrumbJsonLd(page: PublicSeoPage, origin: string) {
  if (!page.indexability.index) return null;
  const locale = page.publicLocale,
    path = page.paths[locale],
    profilePath = `/${locale}/@${page.profile.handle}`;
  const links = [
    { name: "Sammlerraum", path: `/${locale}` },
    { name: page.profile.displayName, path: profilePath },
  ];
  if (page.kind !== "profile")
    links.push({
      name: page.kind === "collection" ? page.title : locale === "de" ? "Sammlung" : "Collection",
      path: path.replace(/\/items\/[^/]+$/u, ""),
    });
  if (page.kind === "item") links.push({ name: page.title, path });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: links.map((link, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: link.name,
      item: url(link.path, origin),
    })),
  };
}
export function publicPageJsonLd(page: PublicSeoPage | null, origin: string) {
  if (!page?.indexability.index) return null;
  const main =
    page.kind === "profile"
      ? profilePageJsonLd(page, origin)
      : page.kind === "collection"
        ? collectionPageJsonLd(page, origin)
        : publicItemJsonLd(page, origin);
  return [main, breadcrumbJsonLd(page, origin)];
}
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/gu,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
