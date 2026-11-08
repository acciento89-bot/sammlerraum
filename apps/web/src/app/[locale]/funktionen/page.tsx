import { notFound } from "next/navigation";
import { MarketingFeaturesPage } from "../../../components/marketing/features-page";
import { marketingMetadata } from "../../../seo/page-metadata";
import { isPublicLocale } from "../../../seo/public-pages";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return {
    ...marketingMetadata("features", locale),
    robots: { index: locale === "de", follow: true },
  };
}
export default MarketingFeaturesPage;
