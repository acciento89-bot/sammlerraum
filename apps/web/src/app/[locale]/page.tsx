import { StructuredData } from "../../components/seo/structured-data";
import { websiteJsonLd } from "../../seo/structured-data";
import { siteOrigin } from "../../seo/page-metadata";
import { CategoryLinks } from "../../components/marketing/category-page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marketingMetadata } from "../../seo/page-metadata";
import { isPublicLocale, PUBLIC_MARKETING_PAGES } from "../../seo/public-pages";
import { getTranslations, setRequestLocale } from "next-intl/server";

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
  const [t, seo] = await Promise.all([getTranslations("Home"), getTranslations("SEO")]);

  return (
    <>
      <StructuredData value={websiteJsonLd(siteOrigin().origin)} />
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 id="page-title">{t("title")}</h1>
        <p className="intro">{t("intro")}</p>
        <div className="form-actions marketing-actions">
          <Link className="primary-link" href={`/${locale}/register`}>
            {seo("register")}
          </Link>
          <Link href={PUBLIC_MARKETING_PAGES.features[locale]}>{seo("featuresLink")}</Link>
          <Link href={PUBLIC_MARKETING_PAGES.pricing[locale]}>{t("pricing")}</Link>
          <Link href={`/${locale}/login`}>{seo("signIn")}</Link>
        </div>
        <aside className="status-card" aria-label={t("status")}>
          <span className="status-dot" aria-hidden="true" />
          <div>
            <h2>{t("status")}</h2>
            <p>{t("detail")}</p>
          </div>
        </aside>
      </section>
      <CategoryLinks locale={locale} />
    </>
  );
}
