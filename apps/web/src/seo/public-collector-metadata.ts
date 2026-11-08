import "server-only";
import { createPublicPageQuery } from "@sammlerraum/domain/seo/public-page-query";
import { isPublicLocale } from "./public-pages";
import { publicPageMetadata } from "./public-page-metadata";
type Params = { locale: string; publicHandle: string; collectionSlug?: string; itemId?: string };
export async function collectorMetadata(
  kind: "profile" | "collection" | "item",
  props: { params: Promise<Params>; searchParams: Promise<{ afterId?: string | string[] }> },
) {
  const p = await props.params;
  if (!isPublicLocale(p.locale)) return { robots: { index: false, follow: false } };
  const { prisma } = await import("@sammlerraum/db/client"),
    query = createPublicPageQuery(prisma);
  const page =
    kind === "profile"
      ? await query.getPublicProfileSeoPage(p.publicHandle)
      : kind === "collection"
        ? await query.getPublicCollectionSeoPage(p.publicHandle, p.collectionSlug ?? "")
        : await query.getPublicItemSeoPage(p.publicHandle, p.collectionSlug ?? "", p.itemId ?? "");
  const metadata = publicPageMetadata(page, p.locale);
  if ((await props.searchParams).afterId !== undefined)
    metadata.robots = { index: false, follow: true };
  return metadata;
}
