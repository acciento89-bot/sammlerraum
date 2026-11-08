import { CategoryLinks } from "./category-page";
import { Icon } from "../visual/icon";
import { StructuredData } from "../seo/structured-data";
import { websiteJsonLd } from "../../seo/structured-data";
import { siteOrigin } from "../../seo/page-metadata";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isPublicLocale, PUBLIC_MARKETING_PAGES } from "../../seo/public-pages";
const features = ["Inventory", "Media", "Search", "Import", "Sharing", "Assist"] as const;
export async function MarketingFeaturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, home] = await Promise.all([getTranslations("SEO"), getTranslations("Home")]);
  return (
    <>
      <section className="marketing-shell" aria-labelledby="features-title">
        <StructuredData value={websiteJsonLd(siteOrigin().origin)} />
        <p className="eyebrow">Sammlerraum</p>
        <h1 id="features-title">{t("featuresTitle")}</h1>
        <p className="intro">{t("featuresIntro")}</p>
        <div className="marketing-grid">
          {features.map((key, index) => (
            <article className="marketing-card" key={key}>
              <span className="feature-art">
                <Icon
                  name={(["layers", "book", "search", "upload", "users", "spark"] as const)[index]!}
                />
              </span>
              <h2>{t(`feature${key}Title`)}</h2>
              <p>{t(`feature${key}Body`)}</p>
            </article>
          ))}
        </div>
        <div className="form-actions">
          <Link className="primary-link" href={`/${locale}/register`}>
            {t("register")}
          </Link>
          <Link href={PUBLIC_MARKETING_PAGES.pricing[locale]}>{home("pricing")}</Link>
          <Link href={PUBLIC_MARKETING_PAGES.home[locale]}>{t("homeLink")}</Link>
        </div>
      </section>
      <CategoryLinks locale={locale} />
    </>
  );
}
