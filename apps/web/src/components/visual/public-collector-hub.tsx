import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "./icon";
import type { IconName } from "./workspace-navigation";
import { CATEGORY_PAGES } from "../../seo/category-pages";
import { categoryPath } from "../../seo/category-routes";
import { PUBLIC_MARKETING_PAGES } from "../../seo/public-pages";
import { KamilunavoProducts } from "./kamilunavo-products";
export async function PublicCollectorHub({ locale }: { locale: "de" | "en" }) {
  const t = await getTranslations({ locale, namespace: "CollectorHub" });
  const links: { key: string; href: string; icon: IconName }[] = [
    { key: "home", href: `/${locale}`, icon: "home" },
    { key: "collection", href: `/${locale}/collections`, icon: "layers" },
    { key: "community", href: `/${locale}/community`, icon: "users" },
    { key: "trading", href: `/${locale}/wishlist`, icon: "heart" },
    { key: "catalog", href: `/${locale}/catalog`, icon: "book" },
    { key: "features", href: PUBLIC_MARKETING_PAGES.features[locale], icon: "compass" },
    { key: "pricing", href: PUBLIC_MARKETING_PAGES.pricing[locale], icon: "spark" },
  ];
  const categories = [
    { key: "tradingCards", image: "trading_cards", icon: "layers" as const },
    { key: "coins", image: "coins", icon: "star" as const },
    { key: "watches", image: "watches", icon: "clock" as const },
    { key: "vinyl", image: "vinyl", icon: "compass" as const },
    { key: "comics", image: "comics", icon: "book" as const },
    { key: "stamps", image: "stamps", icon: "grid" as const },
  ];
  const stories = [
    { key: "cards", image: "modern-cards", category: "tradingCards", tag: "cardsTag" },
    { key: "watches", image: "modern-watch", category: "watches", tag: "watchesTag" },
    { key: "stamps", image: "stamps", category: "stamps", tag: "stampsTag" },
  ];
  return (
    <div className="collector-hub">
      <aside className="hub-sidebar">
        <nav aria-label={t("navigation")}>
          {links.map((link, index) => (
            <Link
              key={link.key}
              href={link.href}
              prefetch={false}
              aria-current={index === 0 ? "page" : undefined}
            >
              <Icon name={link.icon} />
              <span>{t(`nav.${link.key}`)}</span>
            </Link>
          ))}
        </nav>
        <div className="hub-sidebar-invite">
          <Icon name="star" />
          <h2>{t("sidebarTitle")}</h2>
          <Link href={`/${locale}/register`}>
            {t("joinFree")}
            <Icon name="arrow" />
          </Link>
        </div>
        <p className="hub-sidebar-foot">{t("sidebarFoot")}</p>
      </aside>
      <div className="hub-main">
        <section className="hub-welcome" aria-labelledby="page-title">
          <img
            src="/art/community-hero.webp"
            width="1800"
            height="600"
            alt=""
            fetchPriority="high"
          />
          <div className="hub-welcome-copy">
            <p className="hub-kicker">{t("eyebrow")}</p>
            <h1 id="page-title">{t("title")}</h1>
            <p>{t("intro")}</p>
            <Link className="hub-gold-button" href={`/${locale}/register`}>
              {t("join")}
              <Icon name="arrow" />
            </Link>
          </div>
        </section>
        <nav className="hub-benefits" aria-label={t("possibilities")}>
          {(
            [
              { icon: "users", key: "community", href: `/${locale}/community` },
              { icon: "heart", key: "trading", href: `/${locale}/wishlist` },
              { icon: "book", key: "catalog", href: `/${locale}/catalog` },
              { icon: "shield", key: "private", href: PUBLIC_MARKETING_PAGES.features[locale] },
            ] as const
          ).map((item) => (
            <Link key={item.key} href={item.href}>
              <Icon name={item.icon} />
              <span>
                <strong>{t(`benefits.${item.key}.title`)}</strong>
                <small>{t(`benefits.${item.key}.body`)}</small>
              </span>
            </Link>
          ))}
        </nav>
        <div className="hub-columns">
          <section className="hub-feed-panel" aria-labelledby="hub-feed-title">
            <header className="hub-panel-heading">
              <div>
                <h2 id="hub-feed-title">{t("feedTitle")}</h2>
                <p>{t("feedIntro")}</p>
              </div>
              <Link href={`/${locale}/community`}>
                {t("openCommunity")}
                <Icon name="arrow" />
              </Link>
            </header>
            <div className="hub-story-list">
              {stories.map((story) => {
                const category = CATEGORY_PAGES.find((item) => item.key === story.category)!;
                return (
                  <article key={story.key} className="hub-story">
                    <div className="hub-story-content">
                      <div className="hub-story-meta">
                        <span className="hub-author-mark">
                          <Icon name="layers" />
                        </span>
                        <span>
                          <strong>Sammlerraum</strong>
                          <small>
                            {t(story.tag)} · {t("editorial")}
                          </small>
                        </span>
                      </div>
                      <h3>
                        <Link href={categoryPath(locale, category[locale].slug)}>
                          {t(`stories.${story.key}.title`)}
                        </Link>
                      </h3>
                      <p>{t(`stories.${story.key}.body`)}</p>
                      <Link
                        className="hub-story-link"
                        href={categoryPath(locale, category[locale].slug)}
                      >
                        {t("exploreTopic")}
                        <Icon name="arrow" />
                      </Link>
                    </div>
                    <Link
                      className="hub-story-image"
                      href={categoryPath(locale, category[locale].slug)}
                      aria-label={category[locale].name}
                    >
                      <img
                        src={`/art/${story.image}.webp`}
                        width="640"
                        height="780"
                        alt=""
                        loading="lazy"
                      />
                    </Link>
                  </article>
                );
              })}
            </div>
            <div className="hub-real-community">
              <Icon name="users" />
              <div>
                <h3>{t("realFeedTitle")}</h3>
                <p>{t("realFeedBody")}</p>
              </div>
              <Link href={`/${locale}/community`}>
                {t("openCommunity")}
                <Icon name="arrow" />
              </Link>
            </div>
          </section>
          <aside className="hub-context">
            <section className="hub-side-card">
              <span className="hub-side-icon">
                <Icon name="users" />
              </span>
              <h2>{t("communityTitle")}</h2>
              <p>{t("communityBody")}</p>
              <Link className="hub-dark-button" href={`/${locale}/register`}>
                {t("join")}
                <Icon name="arrow" />
              </Link>
              <small className="hub-side-note">
                <Icon name="lock" />
                {t("privacyNote")}
              </small>
            </section>
            <section className="hub-side-card hub-category-card">
              <h2>{t("categoriesTitle")}</h2>
              <ul>
                {categories.map((item) => {
                  const page = CATEGORY_PAGES.find((p) => p.key === item.key)!;
                  return (
                    <li key={item.key}>
                      <Link href={categoryPath(locale, page[locale].slug)}>
                        <span>
                          <img
                            src={`/art/categories/${item.image}.webp`}
                            width="40"
                            height="40"
                            alt=""
                            loading="lazy"
                          />
                        </span>
                        {page[locale].name}
                        <Icon name="arrow" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link
                className="hub-all-categories"
                href={`${PUBLIC_MARKETING_PAGES.features[locale]}#category-links-heading`}
              >
                {t("allCategories")} <Icon name="arrow" />
              </Link>
            </section>
            <section className="hub-tip">
              <Icon name="spark" />
              <div>
                <h2>{t("tipTitle")}</h2>
                <p>{t("tipBody")}</p>
                <Link href={PUBLIC_MARKETING_PAGES.features[locale]}>
                  {t("learnMore")}
                  <Icon name="arrow" />
                </Link>
              </div>
            </section>
            <section className="hub-small-print">
              <p>{t("illustrationNote")}</p>
              <Link href={PUBLIC_MARKETING_PAGES.pricing[locale]}>{t("freePremium")}</Link>
            </section>
          </aside>
        </div>
        <KamilunavoProducts locale={locale} />
      </div>
    </div>
  );
}
