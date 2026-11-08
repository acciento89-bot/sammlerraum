import { StructuredData } from "../../../../components/seo/structured-data";
import { collectorMetadata, collectorJsonLd } from "../../../../seo/public-collector-metadata";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createPublicProfileService } from "@sammlerraum/domain/community/public-profile-service";
import { PublicCollector } from "../../../../components/community/public-collector";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export function generateMetadata(props: Parameters<typeof collectorMetadata>[1]) {
  return collectorMetadata("collection", props);
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; publicHandle: string; collectionSlug: string }>;
  searchParams: Promise<{ afterId?: string | string[] }>;
}) {
  const { locale, publicHandle, collectionSlug } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const afterId =
    typeof query.afterId === "string" ? query.afterId : query.afterId ? "invalid" : undefined;
  const { prisma } = await import("@sammlerraum/db/client");
  const data = await createPublicProfileService(prisma).getCollection(
    publicHandle,
    collectionSlug,
    afterId,
  );
  if (!data) notFound();
  return (
    <>
      <StructuredData value={await collectorJsonLd("collection", params)} />
      <PublicCollector locale={locale} data={data} />
    </>
  );
}
