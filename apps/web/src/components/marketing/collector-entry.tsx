import Link from "next/link";
import { localizedMarketingMetadata } from "../../seo/page-metadata";
import styles from "./collector-entry.module.css";
export const ENTRY_PATHS = { de: "/de/sammlung-verwalten", en: "/en/collection-manager" };
export function collectorEntryMetadata(locale: "de" | "en") {
  return localizedMarketingMetadata(
    ENTRY_PATHS,
    locale === "de"
      ? {
          title: "Sammlung digital verwalten – kostenlos starten | Sammlerraum",
          description:
            "Münzen, Figuren, Modelle und mehr: Sammlerstücke mit Bildern, Zustand und Standort ordnen. Kostenlos bis 500 Stücke. Deine Sammlung bleibt privat.",
        }
      : {
          title: "Manage your collection online – start free | Sammlerraum",
          description:
            "Organise coins, figures, models and more with photos, condition and location. Free for up to 500 items. Your collection stays private.",
        },
    locale,
  );
}
export function CollectorEntry({ locale }: { locale: "de" | "en" }) {
  const de = locale === "de",
    register = `/${locale}/register`,
    examples = de
      ? ["Münzen", "Modelleisenbahn", "Schallplatten"]
      : ["Coins", "Model railways", "Vinyl records"];
  return (
    <div className={styles.entry}>
      <section className={styles.hero} aria-labelledby="entry-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            {de ? "FÜR DINGE, DIE DIR ETWAS BEDEUTEN" : "FOR THE THINGS THAT MATTER TO YOU"}
          </p>
          <h1 id="entry-title">
            {de ? "Deine Sammlung. Endlich im Überblick." : "Your collection. Finally organised."}
          </h1>
          <p className={styles.lead}>
            {de
              ? "Was besitzt du schon? Wo liegt es? Was fehlt noch? Gib Münzen, Figuren, Modellen und all deinen Schätzen einen gemeinsamen Platz."
              : "What do you own? Where is it? What is still missing? Give your coins, figures, models and favourite finds one home."}
          </p>
          <Link className={styles.primary} href={register}>
            {de ? "Kostenlos starten" : "Start for free"} <span aria-hidden="true">→</span>
          </Link>
          <p className={styles.assurance}>
            {de
              ? "Bis 500 Sammlerstücke gratis · Keine Kreditkarte nötig"
              : "Up to 500 items free · No credit card required"}
          </p>
          <ul className={styles.benefits}>
            <li>
              {de ? "Privat, bis du selbst etwas teilst" : "Private until you choose to share"}
            </li>
            <li>{de ? "Am Smartphone und am Computer" : "On your phone and your computer"}</li>
          </ul>
        </div>
        <div
          className={styles.preview}
          aria-label={
            de ? "Beispiel einer geordneten Sammlung" : "Example of an organised collection"
          }
        >
          <div className={styles.previewHeading}>
            <span>{de ? "MEIN SAMMLERRAUM" : "MY SAMMLERRAUM"}</span>
            <span className={styles.example}>{de ? "Beispielansicht" : "Example view"}</span>
          </div>
          <h2>{de ? "Jedes Stück hat seine Geschichte." : "Every item has a story."}</h2>
          <div className={styles.cards}>
            {["coins", "model_railways", "vinyl"].map((key, i) => (
              <article key={key}>
                <img
                  src={`/art/categories/${key}.webp`}
                  width="416"
                  height="416"
                  alt={examples[i]!}
                  loading={i ? "lazy" : "eager"}
                />
                <div>
                  <strong>{examples[i]}</strong>
                  <span>{de ? "Bilder · Details · Standort" : "Photos · Details · Location"}</span>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.organised}>
            <span aria-hidden="true">✓</span>
            <p>
              <strong>
                {de ? "Weniger suchen. Mehr sammeln." : "Less searching. More collecting."}
              </strong>
              <br />
              {de
                ? "Deine Stücke, Fotos und Notizen zusammen."
                : "Your items, photos and notes together."}
            </p>
          </div>
        </div>
      </section>
      <section
        className={styles.value}
        aria-label={de ? "Das bringt dir Sammlerraum" : "What you can do"}
      >
        {[
          [
            de ? "Wissen, was du hast" : "Know what you own",
            de
              ? "Fotos, Zustand und eigene Notizen direkt am Sammlerstück."
              : "Photos, condition and your own notes on every item.",
          ],
          [
            de ? "Finden, was du suchst" : "Find what you need",
            de
              ? "Sammlungen und Standorte ordnen. Stücke später gezielt wiederfinden."
              : "Organise collections and locations. Find the right item again.",
          ],
          [
            de ? "Teilen, wenn du möchtest" : "Share when you want",
            de
              ? "Du bestimmst, welche Inhalte privat bleiben und welche du freigibst."
              : "Choose what stays private and what you share.",
          ],
        ].map(([title, body], i) => (
          <article key={title}>
            <span className={styles.number}>0{i + 1}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className={styles.start}>
        <div>
          <p className={styles.eyebrow}>
            {de ? "DEIN ERSTES STÜCK IST DER ANFANG" : "YOUR FIRST ITEM IS THE BEGINNING"}
          </p>
          <h2>
            {de ? "In drei Schritten zu deiner Sammlung." : "Three steps to your collection."}
          </h2>
        </div>
        <ol>
          <li>
            <strong>{de ? "Kostenloses Konto anlegen" : "Create your free account"}</strong>
            <span>{de ? "Mit Google, Apple oder E-Mail." : "With Google, Apple or email."}</span>
          </li>
          <li>
            <strong>{de ? "Eine Sammlung erstellen" : "Create a collection"}</strong>
            <span>
              {de
                ? "Wähle ein Thema, das zu deinen Stücken passt."
                : "Choose a category that fits your items."}
            </span>
          </li>
          <li>
            <strong>{de ? "Dein erstes Stück festhalten" : "Add your first item"}</strong>
            <span>
              {de
                ? "Titel, Foto und die Details, die dir wichtig sind."
                : "A title, photo and the details that matter to you."}
            </span>
          </li>
        </ol>
      </section>
      <section className={styles.final}>
        <h2>
          {de
            ? "Deine Schätze verdienen mehr als eine Notizliste."
            : "Your collection deserves more than a list."}
        </h2>
        <p>
          {de
            ? "Starte kostenlos mit bis zu 500 Stücken, 2.000 Bildern und 2 GB Speicher. Premium ist optional."
            : "Start free with up to 500 items, 2,000 images and 2 GB of storage. Premium is optional."}
        </p>
        <Link className={styles.primary} href={register}>
          {de ? "Kostenlos starten" : "Start for free"} <span aria-hidden="true">→</span>
        </Link>
        <Link className={styles.secondary} href={`/${locale}/${de ? "preise" : "pricing"}`}>
          {de ? "Alle Tarifdetails ansehen" : "See all plan details"}
        </Link>
      </section>
    </div>
  );
}
