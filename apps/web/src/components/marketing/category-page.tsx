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
  return (
    <section
      className="marketing-shell category-links-section"
      aria-labelledby="category-links-heading"
    >
      <h2 id="category-links-heading">{t("heading")}</h2>
      <ul className="category-links">
        {CATEGORY_PAGES.map((page) => (
          <li key={page.key}>
            <Link href={categoryPath(locale, page[locale].slug)}>{page[locale].name}</Link>
          </li>
        ))}
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
