import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createPublicProfileService } from "@sammlerraum/domain/community/public-profile-service";
import { PublicCollector } from "../../../components/community/public-collector";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; publicHandle: string }>;
  searchParams: Promise<{ afterId?: string | string[] }>;
}) {
  const { locale, publicHandle } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const afterId =
    typeof query.afterId === "string" ? query.afterId : query.afterId ? "invalid" : undefined;
  const { prisma } = await import("@sammlerraum/db/client");
  const data = await createPublicProfileService(prisma).getProfile(publicHandle, afterId);
  if (!data) notFound();
  return <PublicCollector locale={locale} data={data} />;
}
