import { createCommunitySitemapService } from "@sammlerraum/domain/seo/sitemap-service";
import { siteOrigin } from "../../seo/page-metadata";
import { sitemapIndexXml, sitemapUnavailable, xmlResponse } from "../../seo/sitemap";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET() {
  try {
    const { prisma } = await import("@sammlerraum/db/client");
    const pages = await createCommunitySitemapService(prisma).listSegments(),
      base = siteOrigin();
    return xmlResponse(
      sitemapIndexXml([
        new URL("/sitemaps/marketing", base).href,
        ...pages.map((page) => new URL(`/sitemaps/community/${page}`, base).href),
      ]),
    );
  } catch {
    return sitemapUnavailable();
  }
}
