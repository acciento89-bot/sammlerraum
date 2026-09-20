import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: "de" | "en" }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <section className="hero" aria-labelledby="page-title">
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1 id="page-title">{t("title")}</h1>
      <p className="intro">{t("intro")}</p>
      <aside className="status-card" aria-label={t("status")}>
        <span className="status-dot" aria-hidden="true" />
        <div>
          <h2>{t("status")}</h2>
          <p>{t("detail")}</p>
        </div>
      </aside>
    </section>
  );
}
