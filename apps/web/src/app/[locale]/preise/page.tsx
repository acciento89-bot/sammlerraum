import { notFound } from "next/navigation";
import PricingPage from "../pricing/page";
import { marketingMetadata } from "../../../seo/page-metadata";
import { isPublicLocale } from "../../../seo/public-pages";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return {
    ...marketingMetadata("pricing", locale),
    robots: { index: locale === "de", follow: true },
  };
}
export default PricingPage;
