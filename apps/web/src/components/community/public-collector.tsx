import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { createPublicProfileService } from "@sammlerraum/domain/community/public-profile-service";
type Service = ReturnType<typeof createPublicProfileService>;
type Profile = NonNullable<Awaited<ReturnType<Service["getProfile"]>>>;
type Collection = NonNullable<Awaited<ReturnType<Service["getCollection"]>>>;
type Item = NonNullable<Awaited<ReturnType<Service["getItem"]>>>;
export async function PublicCollector({
  locale,
  data,
}: {
  locale: string;
  data: Profile | Collection | Item;
}) {
  const t = await getTranslations({ locale, namespace: "PublicCollector" });
  const home = `/${locale}/@${data.profile.handle}`;
  return (
    <section className="management-shell community-shell public-collector">
      <nav className="community-navigation" aria-label={t("navigation")}>
        <Link href={`/${locale}/community`}>{t("discover")}</Link>
        <Link href={home}>@{data.profile.handle}</Link>
        {"collection" in data && (
          <Link href={`${home}/${data.collection.slug}`}>{data.collection.name}</Link>
        )}
      </nav>
      <header className="community-hero">
        <div>
          <p className="eyebrow">{t("publicProfile")}</p>
          <h1>
            {"item" in data
              ? data.item.title
              : "collection" in data
                ? data.collection.name
                : data.profile.displayName}
          </h1>
          <p>
            {data.profile.displayName} · @{data.profile.handle}
          </p>
          {!("collection" in data) && data.profile.bio && <p>{data.profile.bio}</p>}
        </div>
        <span className="community-seal" aria-hidden="true">
          ◈
        </span>
      </header>
      {"collections" in data && (
        <>
          <h2>{t("collections")}</h2>
          <div className="community-grid">
            {data.collections.map((c) => (
              <article className="community-card" key={c.id}>
                <h3>
                  <Link href={`${home}/${c.slug}`}>{c.name}</Link>
                </h3>
              </article>
            ))}
          </div>
          {data.collections.length === 0 && <p>{t("empty")}</p>}
          {data.next && (
            <Link className="button secondary" href={`${home}?afterId=${data.next}`}>
              {t("next")}
            </Link>
          )}
        </>
      )}
      {"items" in data && (
        <>
          <h2>{t("items")}</h2>
          <div className="community-grid">
            {data.items.map((i) => (
              <article className="community-card" key={i.id}>
                {i.imageAssetId && (
                  <img src={`/api/v1/media/${i.imageAssetId}/medium`} alt="" loading="lazy" />
                )}
                <h3>
                  <Link href={`${home}/${data.collection.slug}/items/${i.id}`}>{i.title}</Link>
                </h3>
                {i.publicDescription && <p>{i.publicDescription.slice(0, 400)}</p>}
              </article>
            ))}
          </div>
          {data.items.length === 0 && <p>{t("empty")}</p>}
          {data.next && (
            <Link
              className="button secondary"
              href={`${home}/${data.collection.slug}?afterId=${data.next}`}
            >
              {t("next")}
            </Link>
          )}
        </>
      )}
      {"item" in data && (
        <article className="community-card">
          {data.item.imageAssetId && (
            <img src={`/api/v1/media/${data.item.imageAssetId}/medium`} alt="" />
          )}
          {data.item.publicDescription && (
            <p className="community-body">{data.item.publicDescription}</p>
          )}
        </article>
      )}
    </section>
  );
}
