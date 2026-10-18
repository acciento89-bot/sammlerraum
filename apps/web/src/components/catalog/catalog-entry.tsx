"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CatalogEntryRevision, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import { CatalogFacts } from "./catalog-facts";
import { CatalogHistory } from "./catalog-history";
import { ProposalComposer } from "./proposal-composer";
import { CatalogNavigation, useCatalogCapability } from "./catalog-navigation";
import { authoredTitle, catalogRequest, catalogError, type Locale } from "./catalog-client";
export function CatalogEntry({ entryId, locale }: { entryId: string; locale: Locale }) {
  const t = useTranslations("Catalog");
  const capability = useCatalogCapability();
  const [entry, setEntry] = useState<CatalogEntryRevision | null>(null);
  const [category, setCategory] = useState<CategoryTemplate | null>(null);
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const ticket = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++ticket.current;
    try {
      const body = await catalogRequest<{ entry: CatalogEntryRevision }>(
        `/api/v1/catalog/entries/${entryId}`,
      );
      const template = await catalogRequest<{ category: CategoryTemplate }>(
        `/api/v1/categories/${body.entry.state.categoryTemplateId}`,
      );
      if (sequence === ticket.current) {
        setEntry(body.entry);
        setCategory(template.category);
        setError("");
      }
    } catch (problem) {
      if (sequence === ticket.current) setError(catalogError(problem, t));
      throw problem;
    }
  }, [entryId, t]);
  useEffect(() => {
    void load().catch(() => undefined);
    return () => {
      ticket.current++;
    };
  }, [load]);
  return (
    <section className="management-shell">
      <CatalogNavigation locale={locale} canModerate={capability} />
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void load().catch(() => undefined)}>
            {t("retry")}
          </button>
        </p>
      )}
      {!entry && !error && <p role="status">{t("loading")}</p>}
      {entry && category && (
        <>
          <header className="management-heading">
            <p className="eyebrow">
              {category.labels[locale]} · {t("revision")} {entry.revision}
            </p>
            <h1>{authoredTitle(entry.state.text, locale)}</h1>
          </header>
          <section className="management-card">
            <CatalogFacts state={entry.state} category={category} locale={locale} />
          </section>
          <button
            type="button"
            onClick={() => {
              setProposing(true);
              setStatus("");
            }}
          >
            {t("proposeCorrection")}
          </button>
          {proposing && (
            <ProposalComposer
              key={entry.revision}
              locale={locale}
              entry={entry}
              initialKind="UPDATE_ENTRY"
              onCancel={() => setProposing(false)}
              onSubmitted={() => {
                setProposing(false);
                setStatus(t("proposalSubmitted"));
              }}
            />
          )}
          <CatalogHistory
            entry={entry}
            category={category}
            locale={locale}
            canModerate={capability}
            onChange={load}
          />
        </>
      )}
      {status && (
        <p className="success" role="status">
          {status} <Link href={`/${locale}/catalog/proposals`}>{t("myProposals")}</Link>
        </p>
      )}
    </section>
  );
}
