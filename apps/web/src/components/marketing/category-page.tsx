import { COLLECTING_CATEGORIES } from "@sammlerraum/contracts/catalog";
import { Icon } from "../visual/icon";
import { StructuredData } from "../seo/structured-data";
import { websiteJsonLd } from "../../seo/structured-data";
import { siteOrigin } from "../../seo/page-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CATEGORY_PAGES,
  findCategory,
  categoryMetadata,
  type CategoryPage,
} from "../../seo/category-pages";
import { categoryPath } from "../../seo/category-routes";
import { PUBLIC_MARKETING_PAGES, type PublicLocale } from "../../seo/public-pages";
type Props = { params: Promise<{ locale: string; categorySlug: string }> };
async function resolve(props: Props, expected: PublicLocale) {
  const p = await props.params;
  if (p.locale !== expected) notFound();
  const category = findCategory(expected, p.categorySlug);
  if (!category) notFound();
  return { locale: expected, category };
}
export async function categoryRouteMetadata(props: Props, expected: PublicLocale) {
  const { locale, category } = await resolve(props, expected);
  return categoryMetadata(category, locale);
}
export async function renderCategoryRoute(props: Props, expected: PublicLocale) {
  const { locale, category } = await resolve(props, expected);
  return <CollectorCategoryPage locale={locale} category={category} />;
}
export async function CategoryLinks({ locale }: { locale: PublicLocale }) {
  const t = await getTranslations({ locale, namespace: "Categories" });
  const visual = await getTranslations({ locale, namespace: "Visual" });
  return (
    <section
      className="marketing-shell category-links-section"
      aria-labelledby="category-links-heading"
    >
      <div className="section-title">
        <div>
          <p className="eyebrow">{visual("categoryEyebrow")}</p>
          <h2 id="category-links-heading">{t("heading")}</h2>
        </div>
        <p>{visual("categoryIntro")}</p>
      </div>
      <ul className="category-links">
        {COLLECTING_CATEGORIES.map((area) => {
          const page = CATEGORY_PAGES.find((page) => page.key === area.pageKey);
          const href = page ? categoryPath(locale, page[locale].slug) : `/${locale}/collections`;
          return (
            <li key={area.key}>
              <Link href={href}>
                <span className="category-card-art">
                  <img
                    src={`/art/categories/${area.key}.webp`}
                    width="416"
                    height="416"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="category-card-label">
                  <span>{area.labels[locale]}</span>
                  <Icon name="arrow" />
                </span>
                <span className="category-card-description">{area.examples[locale]}</span>
                {!page && <span className="category-card-start">{t("create")}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
async function CollectorCategoryPage({
  locale,
  category,
}: {
  locale: PublicLocale;
  category: CategoryPage;
}) {
  setRequestLocale(locale);
  const t = await getTranslations("Categories"),
    seo = await getTranslations("SEO"),
    copy = category[locale];
  return (
    <section className="marketing-shell" aria-labelledby="category-page-title">
      <StructuredData value={websiteJsonLd(siteOrigin().origin)} />
      <nav aria-label={locale === "de" ? "Seitenpfad" : "Breadcrumb"}>
        <Link href={`/${locale}`}>Sammlerraum</Link>
        <span aria-hidden="true"> / </span>
        <span>{copy.name}</span>
      </nav>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1 id="category-page-title">{copy.title}</h1>
      <p className="intro">{copy.intro}</p>
      <div className="marketing-grid">
        {Object.values(copy.sections).map((section) => (
          <article className="marketing-card" key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
      <div className="form-actions">
        <Link className="primary-link" href={`/${locale}/register`}>
          {t("create")}
        </Link>
        <Link href={PUBLIC_MARKETING_PAGES.features[locale]}>{t("features")}</Link>
        <Link href={`/${locale}`}>{seo("homeLink")}</Link>
      </div>
      <h2>{t("related")}</h2>
      <ul className="category-links">
        {CATEGORY_PAGES.filter((page) => page.key !== category.key).map((page) => (
          <li key={page.key}>
            <Link href={categoryPath(locale, page[locale].slug)}>{page[locale].name}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
