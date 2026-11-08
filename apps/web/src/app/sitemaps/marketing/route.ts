import { siteOrigin } from "../../../seo/page-metadata";
import { buildMarketingSitemap, sitemapUrlsXml, xmlResponse } from "../../../seo/sitemap";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export function GET() {
  return xmlResponse(sitemapUrlsXml(buildMarketingSitemap(siteOrigin().origin)));
}
