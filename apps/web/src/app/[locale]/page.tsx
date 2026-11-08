import { StructuredData } from "../../components/seo/structured-data";
import { websiteJsonLd } from "../../seo/structured-data";
import { siteOrigin, marketingMetadata } from "../../seo/page-metadata";
import { notFound } from "next/navigation";
import { isPublicLocale } from "../../seo/public-pages";
import { setRequestLocale } from "next-intl/server";
import { PublicCollectorHub } from "../../components/visual/public-collector-hub";
type Props = { params: Promise<{ locale: "de" | "en" }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return marketingMetadata("home", locale);
}
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <StructuredData value={websiteJsonLd(siteOrigin().origin)} />
      <PublicCollectorHub locale={locale} />
    </>
  );
}
