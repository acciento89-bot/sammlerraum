import { createCommunitySitemapService } from "@sammlerraum/domain/seo/sitemap-service";
import { siteOrigin } from "../../../../seo/page-metadata";
import { sitemapUrlsXml, sitemapUnavailable, xmlResponse } from "../../../../seo/sitemap";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!/^[pci]-[0-9a-f]{1,32}$/u.test(page))
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  try {
    const { prisma } = await import("@sammlerraum/db/client");
    const rows = await createCommunitySitemapService(prisma).getIndexableCommunityPage(page),
      base = siteOrigin();
    return xmlResponse(
      sitemapUrlsXml(
        rows.map((row) => ({
          url: new URL(row.path, base).href,
          lastModified: row.lastModified,
          alternates: {
            languages: {
              "de-DE": new URL(row.alternates.de, base).href,
              en: new URL(row.alternates.en, base).href,
              "x-default": new URL(row.alternates.de, base).href,
            },
          },
        })),
      ),
    );
  } catch {
    return sitemapUnavailable();
  }
}
