import "server-only";
import { createPublicPageQuery } from "@sammlerraum/domain/seo/public-page-query";
import { isPublicLocale } from "./public-pages";
import { publicPageMetadata } from "./public-page-metadata";
import { publicPageJsonLd } from "./structured-data";
import { siteOrigin } from "./page-metadata";
type Params = { locale: string; publicHandle: string; collectionSlug?: string; itemId?: string };
type Kind = "profile" | "collection" | "item";
async function read(kind: Kind, p: Params) {
  const { prisma } = await import("@sammlerraum/db/client"),
    query = createPublicPageQuery(prisma);
  return kind === "profile"
    ? query.getPublicProfileSeoPage(p.publicHandle)
    : kind === "collection"
      ? query.getPublicCollectionSeoPage(p.publicHandle, p.collectionSlug ?? "")
      : query.getPublicItemSeoPage(p.publicHandle, p.collectionSlug ?? "", p.itemId ?? "");
}
export async function collectorMetadata(
  kind: Kind,
  props: { params: Promise<Params>; searchParams: Promise<{ afterId?: string | string[] }> },
) {
  const p = await props.params;
  if (!isPublicLocale(p.locale)) return { robots: { index: false, follow: false } };
  const metadata = publicPageMetadata(await read(kind, p), p.locale);
  if ((await props.searchParams).afterId !== undefined)
    metadata.robots = { index: false, follow: true };
  return metadata;
}
export async function collectorJsonLd(kind: Kind, params: Promise<Params>) {
  const p = await params;
  if (!isPublicLocale(p.locale)) return null;
  return publicPageJsonLd(await read(kind, p), siteOrigin().origin);
}
