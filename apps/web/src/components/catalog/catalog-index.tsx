"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CatalogSearch } from "./catalog-search";
import { ProposalComposer } from "./proposal-composer";
import { CatalogNavigation, useCatalogCapability } from "./catalog-navigation";
import type { Locale } from "./catalog-client";
export function CatalogIndex({ locale }: { locale: Locale }) {
  const t = useTranslations("Catalog");
  const capability = useCatalogCapability();
  const [proposing, setProposing] = useState(false);
  const [status, setStatus] = useState("");
  return (
    <section className="management-shell">
      <CatalogNavigation locale={locale} canModerate={capability} />
      <header className="management-heading">
        <p className="eyebrow">{t("referenceLibrary")}</p>
        <h1>{t("catalog")}</h1>
        <p>{t("catalogIntro")}</p>
      </header>
      <CatalogSearch locale={locale} />
      <div className="form-actions">
        <button
          type="button"
          onClick={() => {
            setProposing(true);
            setStatus("");
          }}
        >
          {t("proposeNew")}
        </button>
      </div>
      {proposing && (
        <ProposalComposer
          locale={locale}
          onCancel={() => setProposing(false)}
          onSubmitted={() => {
            setProposing(false);
            setStatus(t("proposalSubmitted"));
          }}
        />
      )}
      {status && (
        <p className="success" role="status">
          {status} <Link href={`/${locale}/catalog/proposals`}>{t("myProposals")}</Link>
        </p>
      )}
    </section>
  );
}
