import { Icon } from "./icon";
import styles from "./kamilunavo-products.module.css";

// Links lead to the owner's public catalog, where current store availability is maintained.
export function KamilunavoProducts({ locale }: { locale: "de" | "en" }) {
  const de = locale === "de";
  const products = [
    {
      name: "Kintaroq",
      body: de
        ? "Geräte verstehen, Fehler eingrenzen und die passende Hilfe finden."
        : "Understand your devices, narrow down faults and find the right help.",
      path: "/kintaroq",
      icon: "compass" as const,
      action: de ? "Kintaroq entdecken" : "Discover Kintaroq",
    },
    {
      name: de ? "Apps für deinen Alltag" : "Apps for everyday life",
      body: de
        ? "Praktische Helfer für Technik, Organisation und die kleinen Aufgaben im Alltag."
        : "Practical tools for technical work, organisation and everyday tasks.",
      path: "/products#products",
      icon: "grid" as const,
      action: de ? "Apps ansehen" : "Explore apps",
    },
    {
      name: de ? "Zeit für eine Spielpause" : "Time for a game break",
      body: de
        ? "Entdecke unsere Spiele und finde deine nächste kleine Herausforderung."
        : "Discover our games and find your next little challenge.",
      path: "/products#games",
      icon: "spark" as const,
      action: de ? "Spiele entdecken" : "Explore games",
    },
  ];

  return (
    <section className={styles.section} aria-labelledby="kamilunavo-products-heading">
      <header className={styles.heading}>
        <p>KAMILUNAVO</p>
        <h2 id="kamilunavo-products-heading">
          {de ? "Noch mehr zu entdecken" : "More to discover"}
        </h2>
        <span>
          {de
            ? "Sammlerraum ist Teil unserer Ideenwelt. Schau dich auch bei unseren anderen Produkten um."
            : "Sammlerraum is part of our family of ideas. Take a look at our other products, too."}
        </span>
      </header>
      <div className={styles.grid}>
        {products.map((product) => (
          <a
            key={product.path}
            className={styles.card}
            href={`https://kamilunavo.com${product.path}`}
          >
            <span className={styles.icon}>
              <Icon name={product.icon} />
            </span>
            <h3>{product.name}</h3>
            <p>{product.body}</p>
            <span className={styles.action}>
              {product.action} <Icon name="arrow" />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
