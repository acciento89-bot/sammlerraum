"use client";
import { recallCatalogMoneySession } from "./catalog-money-session";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CatalogEntryRevision, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import {
  LegacyMoneySubjectSchema,
  type MoneySubject,
  type MoneyView,
} from "@sammlerraum/contracts/legacy-money";
import { LegacyMoneyReview } from "../money/legacy-money-review";
import { loadMoneyCapabilities, MoneyClientError } from "../money/legacy-money-client";
import { clearMoneyDrafts } from "../money/legacy-money-draft";
import { activeMoneyReview, setActiveMoneyReview } from "../money/money-review-draft";
import { useCollectorConfirmation } from "../search/use-saved-confirmation";
import { readCanonicalMoney, catalogMoneyKey } from "./catalog-money-client";
import { CanonicalCatalogFacts } from "./canonical-catalog-facts";
import { CatalogHistory } from "./catalog-history";
import { ProposalComposer } from "./proposal-composer";
import { CatalogNavigation, useCatalogCapability } from "./catalog-navigation";
import { authoredTitle, catalogRequest, catalogError, type Locale } from "./catalog-client";
export function CatalogEntry({
  entryId,
  locale,
  actor,
}: {
  entryId: string;
  locale: Locale;
  actor: string;
}) {
  const t = useTranslations("Catalog"),
    m = useTranslations("LegacyMoney");
  const capability = useCatalogCapability();
  const [entry, setEntry] = useState<CatalogEntryRevision | null>(null);
  const [category, setCategory] = useState<CategoryTemplate | null>(null);
  const [proposing, setProposing] = useState(() =>
    Boolean(recallCatalogMoneySession(actor, entryId)),
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reviewView, setReviewView] = useState<MoneyView | null>(null),
    [reviewBusy, setReviewBusy] = useState(false),
    [reviewLoading, setReviewLoading] = useState(false),
    [reviewAuthoring, setReviewAuthoring] = useState(false),
    [reviewLabel, setReviewLabel] = useState(""),
    [moneyRefresh, setMoneyRefresh] = useState(0);
  const reviewTicket = useRef(0),
    reviewScope = `catalog-review:${entryId}`;
  const pendingReview = useCollectorConfirmation(reviewBusy, () => false);
  async function openSubject(input: MoneySubject) {
    const subject = LegacyMoneySubjectSchema.parse(input);
    if (subject.family !== "CATALOG" || !capability || reviewBusy) return;
    const sequence = ++reviewTicket.current;
    setReviewLoading(true);
    try {
      const caps = await loadMoneyCapabilities();
      if (sequence !== reviewTicket.current) return;
      if (caps.actorId !== actor) {
        clearMoneyDrafts();
        setReviewView(null);
        throw new MoneyClientError("REFUSED");
      }
      const source = await catalogRequest<{ entry: CatalogEntryRevision }>(
        `/api/v1/catalog/entries/${subject.entryId}/revisions/${subject.revision}`,
      );
      if (source.entry.revision !== subject.revision || source.entry.state.id !== subject.entryId)
        throw new MoneyClientError("READ_FAILED");
      const values = await readCanonicalMoney(source.entry.state, subject.revision),
        actual = values.get(catalogMoneyKey(subject.target, subject.definitionId));
      if (!actual || JSON.stringify(actual.subject) !== JSON.stringify(subject))
        throw new MoneyClientError("READ_FAILED");
      if (sequence !== reviewTicket.current) return;
      setReviewAuthoring(caps.authoringProfiles.length > 0);
      setActiveMoneyReview(actor, reviewScope, actual.subject);
      setReviewView(actual);
      const field =
        category?.definitions.find((field) => field.id === subject.definitionId)?.labels[locale] ??
        m("storedValue");
      setReviewLabel(
        `${authoredTitle(source.entry.state.text, locale)} · ${field} · ${t("revision")} ${subject.revision}`,
      );
    } catch {
      if (sequence === reviewTicket.current) setError(m("readFailed"));
    } finally {
      if (sequence === reviewTicket.current) setReviewLoading(false);
    }
  }
  useEffect(() => {
    if (capability) {
      const subject = activeMoneyReview(actor, reviewScope);
      if (subject) void openSubject(subject);
    } else setReviewView(null);
    return () => {
      reviewTicket.current++;
    };
  }, [actor, entryId, capability]);
  const onReview = (view: MoneyView) => {
    void openSubject(view.subject);
  };
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
      {pendingReview.node}
      <CatalogNavigation locale={locale} canModerate={capability} />
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void load().catch(() => undefined)}>
            {t("retry")}
          </button>
        </p>
      )}
      {reviewLoading && <p role="status">{m("loading")}</p>}
      {reviewView && capability && (
        <div className="management-card">
          <p className="eyebrow">{reviewLabel}</p>
          {!reviewAuthoring && <p role="status">{m("disabled")}</p>}
          <LegacyMoneyReview
            key={JSON.stringify(reviewView.subject)}
            view={reviewView}
            actor={actor}
            locale={locale}
            disabled={proposing || reviewLoading || !reviewAuthoring}
            onBusy={setReviewBusy}
            onExpired={() => {
              clearMoneyDrafts();
              setReviewView(null);
              setError(m("sessionChanged"));
            }}
            onClose={() => {
              reviewTicket.current++;
              setActiveMoneyReview(actor, reviewScope, null);
              setReviewView(null);
              setReviewLoading(false);
            }}
            onOrigin={(subject) => {
              void openSubject(subject);
            }}
            onChanged={(next) => {
              if (JSON.stringify(next.subject) === JSON.stringify(reviewView.subject)) {
                setReviewView(next);
                setMoneyRefresh((value) => value + 1);
              }
            }}
          />
        </div>
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
            <CanonicalCatalogFacts
              refresh={moneyRefresh}
              {...(capability && !proposing && !reviewBusy && !reviewLoading ? { onReview } : {})}
              state={entry.state}
              revision={entry.revision}
              category={category}
              locale={locale}
            />
          </section>
          <button
            type="button"
            disabled={reviewBusy || reviewLoading}
            onClick={() => {
              setProposing(true);
              setStatus("");
            }}
          >
            {t("proposeCorrection")}
          </button>
          {proposing && (
            <ProposalComposer
              actor={actor}
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
            moneyRefresh={moneyRefresh}
            disabled={reviewBusy}
            {...(capability && !proposing && !reviewBusy && !reviewLoading ? { onReview } : {})}
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
