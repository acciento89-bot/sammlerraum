"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { CatalogEntryRevision, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import type { CatalogRevisionSummary } from "@sammlerraum/contracts/catalog-reads";
import { CatalogFacts } from "./catalog-facts";
import { catalogRequest, catalogError, CatalogRequestError, type Locale } from "./catalog-client";
export function CatalogHistory({
  entry,
  category,
  locale,
  canModerate,
  onChange,
}: {
  entry: CatalogEntryRevision;
  category: CategoryTemplate;
  locale: Locale;
  canModerate: boolean;
  onChange: () => Promise<void>;
}) {
  const t = useTranslations("Catalog");
  const [rows, setRows] = useState<CatalogRevisionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogEntryRevision | null>(null);
  const [expected, setExpected] = useState(entry.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const ticket = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++ticket.current;
    try {
      const body = await catalogRequest<{
        revisions: CatalogRevisionSummary[];
        nextCursor: string | null;
      }>(`/api/v1/catalog/entries/${entry.state.id}/revisions`);
      if (sequence === ticket.current) {
        setRows(body.revisions);
        setCursor(body.nextCursor);
        setError("");
      }
    } catch (problem) {
      if (sequence === ticket.current) setError(catalogError(problem, t));
    }
  }, [entry.state.id, entry.revision, t]);
  useEffect(() => {
    void load();
    return () => {
      ticket.current++;
    };
  }, [load]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const body = await catalogRequest<{
        revisions: CatalogRevisionSummary[];
        nextCursor: string | null;
      }>(
        `/api/v1/catalog/entries/${entry.state.id}/revisions?cursor=${encodeURIComponent(cursor)}`,
      );
      setRows((current) => [
        ...current,
        ...body.revisions.filter(
          (row) => !current.some((existing) => existing.revision === row.revision),
        ),
      ]);
      setCursor(body.nextCursor);
    } catch (problem) {
      setError(catalogError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  async function inspect(revision: number) {
    const sequence = ++ticket.current;
    setBusy(true);
    setError("");
    try {
      const body = await catalogRequest<{ entry: CatalogEntryRevision }>(
        `/api/v1/catalog/entries/${entry.state.id}/revisions/${revision}`,
      );
      if (sequence === ticket.current) {
        setPreview(body.entry);
        setExpected(entry.revision);
      }
    } catch (problem) {
      if (sequence === ticket.current) setError(catalogError(problem, t));
    } finally {
      if (sequence === ticket.current) setBusy(false);
    }
  }
  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !preview || !canModerate) return;
    const form = new FormData(event.currentTarget);
    if (!form.has("confirm")) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await catalogRequest(`/api/v1/catalog/entries/${entry.state.id}/rollback`, "POST", {
        expectedRevision: expected,
        targetRevision: preview.revision,
        reason: String(form.get("reason")),
      });
      setPreview(null);
      await onChange();
      await load();
      setStatus(t("restored"));
    } catch (problem) {
      if (problem instanceof CatalogRequestError && problem.status === 409) {
        setPreview(null);
        await onChange();
        await load();
      }
      setError(catalogError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-card" aria-label={t("history")}>
      <h2>{t("history")}</h2>
      <ul className="plain-list">
        {rows.map((row) => (
          <li key={row.revision}>
            <span>
              {t("revision")} {row.revision} · {new Date(row.createdAt).toLocaleString(locale)}
              {row.rollbackFromRevision !== null && (
                <>
                  {" "}
                  · {t("restoredFrom")} {row.rollbackFromRevision}
                </>
              )}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void inspect(row.revision)}
            >
              {t("previewRevision")} {row.revision}
              {locale === "de" ? " ansehen" : ""}
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button type="button" disabled={busy} onClick={() => void more()}>
          {t("moreHistory")}
        </button>
      )}
      {preview && (
        <div className="catalog-history-preview">
          <h3>
            {t("previewTitle")} {preview.revision}
          </h3>
          <p>
            {t("currentRevision")} {entry.revision}
          </p>
          <CatalogFacts state={preview.state} category={category} locale={locale} />
          {canModerate && preview.revision !== entry.revision && (
            <form
              key={`${preview.revision}-${expected}`}
              className="compact-form"
              onSubmit={(event) => void restore(event)}
            >
              <p className="field-help">{t("rollbackHelp")}</p>
              <label>
                {t("restorationReason")}
                <textarea name="reason" maxLength={1000} required />
              </label>
              <label className="checkbox-label">
                <input name="confirm" type="checkbox" required />
                {t("confirmRevision")}
              </label>
              <button type="submit" disabled={busy || expected !== entry.revision}>
                {t("confirmRestoration")}
              </button>
            </form>
          )}
          <button type="button" className="secondary-button" onClick={() => setPreview(null)}>
            {t("closePreview")}
          </button>
        </div>
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
