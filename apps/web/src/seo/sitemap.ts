import type { MetadataRoute } from "next";
import { PUBLIC_MARKETING_PAGES } from "./public-pages";
import { siteOrigin } from "./page-metadata";
export function buildMarketingSitemap(origin: string): MetadataRoute.Sitemap {
  const base = siteOrigin(origin);
  return Object.values(PUBLIC_MARKETING_PAGES).flatMap((paths) =>
    (["de", "en"] as const).map((locale) => ({
      url: new URL(paths[locale], base).href,
      alternates: {
        languages: {
          "de-DE": new URL(paths.de, base).href,
          en: new URL(paths.en, base).href,
          "x-default": new URL(paths.de, base).href,
        },
      },
    })),
  );
}
export function buildRobots(origin: string): MetadataRoute.Robots {
  const paths = [
    "app/",
    "account/",
    "community",
    "shared-search",
    "smart-collections",
    "insurance",
    "audit",
    "login",
    "register",
    "verify-email",
    "forgot-password",
    "reset-password",
    "search",
    "collections/",
    "items/",
    "dashboard",
    "wishlist",
    "notifications",
    "moderation",
    "catalog/",
    "imports/",
    "exports/",
    "reports/",
    "locations/",
  ];
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/share/",
        "/invite/",
        "/invitations/",
        ...["de", "en"].flatMap((locale) => paths.map((path) => `/${locale}/${path}`)),
      ],
    },
    sitemap: new URL("/sitemap.xml", siteOrigin(origin)).href,
  };
}
function xml(value: unknown) {
  return String(value).replace(
    /[&<>"']/gu,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!,
  );
}
const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
export function sitemapIndexXml(urls: readonly string[]) {
  if (urls.length > 50000) throw new Error("Sitemap index capacity exceeded");
  return `${declaration}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<sitemap><loc>${xml(url)}</loc></sitemap>`).join("")}</sitemapindex>`;
}
export function sitemapUrlsXml(rows: MetadataRoute.Sitemap) {
  if (rows.length > 10000) throw new Error("Sitemap segment capacity exceeded");
  return `${declaration}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${rows
    .map(
      (row) =>
        `<url><loc>${xml(row.url)}</loc>${row.lastModified ? `<lastmod>${xml(row.lastModified instanceof Date ? row.lastModified.toISOString() : row.lastModified)}</lastmod>` : ""}${Object.entries(
          row.alternates?.languages ?? {},
        )
          .map(
            ([language, url]) =>
              `<xhtml:link rel="alternate" hreflang="${xml(language)}" href="${xml(url)}"/>`,
          )
          .join("")}</url>`,
    )
    .join("")}</urlset>`;
}
export function xmlResponse(body: string) {
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
export function sitemapUnavailable() {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "cache-control": "no-store", "retry-after": "30" },
  });
}
