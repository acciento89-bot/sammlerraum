import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { legalDocument, legalHref, type LegalDocumentKind } from "../../../../seo/legal-pages";
import { siteOrigin } from "../../../../seo/page-metadata";
import { isPublicLocale } from "../../../../seo/public-pages";

type Props = { params: Promise<{ locale: string; document: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, document } = await params;
  const copy = legalDocument(locale, document);
  if (!copy || !isPublicLocale(locale)) notFound();
  const kind = document as LegalDocumentKind;
  return {
    metadataBase: siteOrigin(),
    title: `${copy.title} · Sammlerraum`,
    alternates: {
      canonical: legalHref(locale, kind),
      languages: { "de-DE": legalHref("de", kind), en: legalHref("en", kind) },
    },
    robots: { index: false, follow: true },
  };
}

export default async function LegalInformationPage({ params }: Props) {
  const { locale, document } = await params;
  const copy = legalDocument(locale, document, {
    ai: process.env.AI_ANALYSIS_ENABLED === "true",
    billing: process.env.BILLING_ENABLED === "true",
    market:
      process.env.MARKET_SYNC_ENABLED === "true" &&
      (process.env.SCRYDEX_ENABLED === "true" || process.env.PRICECHARTING_ENABLED === "true"),
  });
  if (!copy || !isPublicLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <article className="legal-page" aria-labelledby="legal-title">
      <h1 id="legal-title">{copy.title}</h1>
      <p>
        {locale === "de" ? "Stand" : "Updated"}: <time dateTime={copy.updated}>{copy.updated}</time>
      </p>
      {copy.sections.map((section) => (
        <section key={section.id} aria-labelledby={`legal-${section.id}`}>
          <h2 id={`legal-${section.id}`}>{section.title}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {section.links && (
            <ul>
              {section.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
