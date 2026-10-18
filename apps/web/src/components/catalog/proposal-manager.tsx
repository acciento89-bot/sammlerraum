"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CatalogEntryRevision, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import { CatalogNavigation, useCatalogCapability } from "./catalog-navigation";
import { ProposalFacts, type Proposal } from "./proposal-facts";
import { SourceFacts } from "./catalog-facts";
import { catalogRequest, catalogError, CatalogRequestError, type Locale } from "./catalog-client";
export function ProposalManager({ locale, review = false }: { locale: Locale; review?: boolean }) {
  const t = useTranslations("Catalog");
  const capability = useCatalogCapability();
  const [rows, setRows] = useState<Proposal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState(review ? "PENDING" : "");
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [base, setBase] = useState<CatalogEntryRevision | null>(null);
  const [category, setCategory] = useState<CategoryTemplate | null>(null);
  const [currentRevision, setCurrentRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [contextState, setContextState] = useState<"loading" | "ready" | "unavailable" | null>(
    null,
  );
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const listTicket = useRef(0);
  const detailTicket = useRef(0);
  const prefix = review ? "/api/v1/catalog/moderation/proposals" : "/api/v1/catalog/proposals";
  const load = useCallback(async () => {
    const ticket = ++listTicket.current;
    setLoading(true);
    try {
      const body = await catalogRequest<{ proposals: Proposal[]; nextCursor: string | null }>(
        `${prefix}?limit=20${filter ? `&state=${filter}` : ""}`,
      );
      if (ticket === listTicket.current) {
        setRows(body.proposals);
        setCursor(body.nextCursor);
        setError("");
      }
    } catch (problem) {
      if (ticket === listTicket.current) setError(catalogError(problem, t));
    } finally {
      if (ticket === listTicket.current) setLoading(false);
    }
  }, [prefix, filter, t]);
  useEffect(() => {
    void load();
    return () => {
      listTicket.current++;
      detailTicket.current++;
    };
  }, [load]);
  async function more() {
    if (!cursor || busy) return;
    const ticket = listTicket.current;
    setBusy(true);
    try {
      const body = await catalogRequest<{ proposals: Proposal[]; nextCursor: string | null }>(
        `${prefix}?limit=20${filter ? `&state=${filter}` : ""}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (ticket !== listTicket.current) return;
      setRows((current) => [
        ...current,
        ...body.proposals.filter((row) => !current.some((existing) => existing.id === row.id)),
      ]);
      setCursor(body.nextCursor);
    } catch (problem) {
      if (ticket === listTicket.current) setError(catalogError(problem, t));
    } finally {
      if (ticket === listTicket.current) setBusy(false);
    }
  }
  async function context(proposal: Proposal, ticket: number) {
    let original: CatalogEntryRevision | null = null;
    let current: CatalogEntryRevision | null = null;
    let unavailable = false;
    if (proposal.targetEntryId) {
      const [old, now] = await Promise.allSettled([
        catalogRequest<{ entry: CatalogEntryRevision }>(
          `/api/v1/catalog/entries/${proposal.targetEntryId}/revisions/${proposal.baseRevision}`,
        ),
        catalogRequest<{ entry: CatalogEntryRevision }>(
          `/api/v1/catalog/entries/${proposal.targetEntryId}`,
        ),
      ]);
      original = old.status === "fulfilled" ? old.value.entry : null;
      current = now.status === "fulfilled" ? now.value.entry : null;
      unavailable = old.status === "rejected" || now.status === "rejected";
    }
    if (ticket !== detailTicket.current) return;
    setBase(original);
    setCurrentRevision(current?.revision ?? null);
    const categoryId =
      original?.state.categoryTemplateId ??
      current?.state.categoryTemplateId ??
      (proposal.patch.kind === "CREATE_ENTRY" ? proposal.patch.input.categoryTemplateId : null);
    let template: CategoryTemplate | null = null;
    if (categoryId) {
      try {
        template = (
          await catalogRequest<{ category: CategoryTemplate }>(`/api/v1/categories/${categoryId}`)
        ).category;
      } catch {
        unavailable = true;
      }
    } else unavailable = true;
    if (ticket !== detailTicket.current) return;
    setCategory(template);
    setContextState(unavailable ? "unavailable" : "ready");
  }
  async function detail(id: string) {
    const ticket = ++detailTicket.current;
    setReading(true);
    setError("");
    setSelected(null);
    setBase(null);
    setCategory(null);
    setCurrentRevision(null);
    setContextState(null);
    try {
      const body = await catalogRequest<{ proposal: Proposal }>(`${prefix}/${id}`);
      if (ticket !== detailTicket.current) return;
      // Authenticated proposal content and rejection do not depend on reference reads.
      setSelected(body.proposal);
      setContextState("loading");
      void context(body.proposal, ticket);
    } catch (problem) {
      if (ticket === detailTicket.current) setError(catalogError(problem, t));
    } finally {
      if (ticket === detailTicket.current) setReading(false);
    }
  }
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reading || deciding || !selected) return;
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value;
    if (decision !== "APPROVE" && decision !== "REJECT") return;
    if (decision === "APPROVE" && contextState !== "ready") return;
    setBusy(true);
    setDeciding(true);
    setError("");
    setStatus("");
    try {
      const body = await catalogRequest<{ proposal: Proposal }>(
        `/api/v1/catalog/proposals/${selected.id}/decision`,
        "POST",
        { decision, reason: String(form.get("reason")) },
      );
      setSelected(body.proposal);
      await load();
      setStatus(t("decisionRecorded"));
    } catch (problem) {
      if (problem instanceof CatalogRequestError && problem.status === 409) {
        await detail(selected.id);
        await load();
      }
      setError(catalogError(problem, t));
    } finally {
      setBusy(false);
      setDeciding(false);
    }
  }
  return (
    <section className="management-shell">
      <CatalogNavigation locale={locale} canModerate={capability} />
      <header className="management-heading">
        <h1>{t(review ? "reviewProposals" : "myProposals")}</h1>
        <p>{t(review ? "reviewIntro" : "ownIntro")}</p>
      </header>
      <label className="catalog-filter">
        {t("proposalState")}
        <select
          aria-label={t("proposalState")}
          value={filter}
          disabled={deciding}
          onChange={(event) => {
            detailTicket.current++;
            listTicket.current++;
            setBusy(false);
            setReading(false);
            setContextState(null);
            setRows([]);
            setCursor(null);
            setLoading(true);
            setSelected(null);
            setFilter(event.target.value);
          }}
        >
          {!review && <option value="">{t("allStates")}</option>}
          {["PENDING", "APPROVED", "REJECTED", "CONFLICT"].map((state) => (
            <option key={state} value={state}>
              {t(`states.${state}`)}
            </option>
          ))}
        </select>
      </label>
      {loading && <p role="status">{t("loading")}</p>}
      {!loading && !rows.length && !error && <p className="empty-state">{t("noProposals")}</p>}
      <ul className="catalog-results">
        {rows.map((row) => (
          <li className="management-card" key={row.id}>
            <button
              type="button"
              className="text-button"
              disabled={busy || reading || deciding}
              onClick={() => void detail(row.id)}
            >
              {row.summary}
            </button>
            <p>
              {t(`operations.${row.patch.kind}`)} · {t(`states.${row.state}`)}
            </p>
            <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(locale)}</time>
          </li>
        ))}
      </ul>
      {cursor && (
        <button type="button" disabled={busy || reading || deciding} onClick={() => void more()}>
          {t("moreProposals")}
        </button>
      )}
      {selected && (
        <section className="management-card" aria-label={t("proposalDetail")}>
          <h2>{selected.summary}</h2>
          <p>{t(`states.${selected.state}`)}</p>
          {selected.decisionReason && (
            <p>
              {t("decisionReason")}: {selected.decisionReason}
            </p>
          )}
          {selected.moderatedAt && <p>{new Date(selected.moderatedAt).toLocaleString(locale)}</p>}
          {selected.resultEntryId && (
            <Link href={`/${locale}/catalog/${selected.resultEntryId}`}>
              {t("resultEntry")} · {t("revision")} {selected.resultRevision}
            </Link>
          )}
          {selected.targetEntryId && (
            <p>
              <Link href={`/${locale}/catalog/${selected.targetEntryId}`}>
                {t("viewCurrentEntry")}
              </Link>{" "}
              · {t("currentRevision")} {currentRevision}
            </p>
          )}
          {selected.source && (
            <>
              <h3>{t("proposalEvidence")}</h3>
              <SourceFacts sources={[selected.source]} />
            </>
          )}
          {contextState === "loading" && <p role="status">{t("contextLoading")}</p>}
          {contextState === "unavailable" && <p className="notice">{t("contextUnavailable")}</p>}
          <ProposalFacts proposal={selected} base={base} category={category} locale={locale} />
          {selected.state === "CONFLICT" && <p className="notice">{t("proposalConflictHelp")}</p>}
          {review && selected.state === "PENDING" && (
            <form className="compact-form" onSubmit={(event) => void decide(event)}>
              {currentRevision !== null && currentRevision !== selected.baseRevision && (
                <p className="notice">{t("staleProposal")}</p>
              )}
              <label>
                {t("decisionReason")}
                <textarea name="reason" maxLength={1000} required />
              </label>
              <div className="form-actions">
                <button
                  type="submit"
                  name="decision"
                  value="APPROVE"
                  disabled={busy || reading || deciding || contextState !== "ready"}
                >
                  {t("approve")}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="REJECT"
                  className="secondary-button"
                  disabled={busy || reading || deciding}
                >
                  {t("reject")}
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void load()}>
            {t("retry")}
          </button>
        </p>
      )}
    </section>
  );
}
