"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CatalogSearchResult } from "@sammlerraum/contracts/catalog-reads";
import { CategoryPicker } from "./category-picker";
import { authoredTitle, catalogRequest, catalogError, type Locale } from "./catalog-client";
export function variantLabel(
  variant: {
    text: Parameters<typeof authoredTitle>[0];
    language?: string | undefined;
    edition?: string | undefined;
    reference?: string | undefined;
  },
  locale: Locale,
) {
  return [authoredTitle(variant.text, locale), variant.language, variant.edition, variant.reference]
    .filter(Boolean)
    .join(" · ");
}
export function CatalogSearch({
  locale,
  onChoose,
  initialCategory = "",
}: {
  locale: Locale;
  onChoose?: (entryId: string) => void;
  initialCategory?: string;
}) {
  const t = useTranslations("Catalog");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("text");
  const [category, setCategory] = useState(initialCategory);
  const [namespace, setNamespace] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const lastQuery = useRef("");
  useEffect(() => () => controller.current?.abort(), []);
  function invalidate() {
    controller.current?.abort();
    lastQuery.current = "";
    setResults([]);
    setCursor(null);
    setSearched(false);
    setBusy(false);
    setError("");
  }
  async function search(event?: FormEvent, more = false) {
    event?.preventDefault();
    controller.current?.abort();
    const control = new AbortController();
    controller.current = control;
    const query = new URLSearchParams({
      mode,
      q,
      limit: "20",
      ...(category ? { categoryId: category } : {}),
      ...(mode === "identifier" && namespace ? { namespace } : {}),
      ...(mode === "identifier" && type ? { type } : {}),
    });
    const identity = query.toString();
    if (more && lastQuery.current !== identity) return;
    if (more && cursor) query.set("cursor", cursor);
    setBusy(true);
    setError("");
    try {
      const body = await catalogRequest<{
        results: CatalogSearchResult[];
        nextCursor: string | null;
      }>(`/api/v1/catalog/search?${query}`, "GET", undefined, control.signal);
      if (!control.signal.aborted) {
        lastQuery.current = identity;
        setResults((current) =>
          more
            ? [
                ...current,
                ...body.results.filter(
                  (row) => !current.some((existing) => existing.id === row.id),
                ),
              ]
            : body.results,
        );
        setCursor(body.nextCursor);
        setSearched(true);
      }
    } catch (problem) {
      if (!control.signal.aborted) setError(catalogError(problem, t));
    } finally {
      if (!control.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="catalog-search">
      <form className="compact-form" onSubmit={(event) => void search(event)}>
        <label>
          {t("searchBy")}
          <select
            aria-label={t("searchBy")}
            value={mode}
            onChange={(event) => {
              invalidate();
              setMode(event.target.value);
            }}
          >
            <option value="text">{t("byText")}</option>
            <option value="identifier">{t("byReference")}</option>
          </select>
        </label>
        <label>
          {t("searchCatalog")}
          <input
            value={q}
            minLength={mode === "text" ? 2 : 1}
            maxLength={mode === "text" ? 200 : 500}
            required
            onChange={(event) => {
              invalidate();
              setQ(event.target.value);
            }}
          />
        </label>
        <CategoryPicker
          locale={locale}
          value={category}
          onChange={(value) => {
            invalidate();
            setCategory(value);
          }}
          label={t("filterCategory")}
        />
        {mode === "identifier" && (
          <div className="form-row">
            <label>
              {t("namespace")}
              <input
                value={namespace}
                maxLength={64}
                pattern="[a-z][a-z0-9_]*"
                onChange={(event) => {
                  invalidate();
                  setNamespace(event.target.value);
                }}
              />
            </label>
            <label>
              {t("referenceType")}
              <input
                value={type}
                maxLength={64}
                pattern="[a-z][a-z0-9_]*"
                onChange={(event) => {
                  invalidate();
                  setType(event.target.value);
                }}
              />
            </label>
          </div>
        )}
        <button type="submit" disabled={busy}>
          {t("search")}
        </button>
      </form>
      {busy && <p role="status">{t("loading")}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {searched && !results.length && <p className="empty-state">{t("noResults")}</p>}
      <ul className="catalog-results">
        {results.map((row) => (
          <li key={row.id} className="management-card">
            <h3>
              <Link href={`/${locale}/catalog/${row.id}`}>{authoredTitle(row.text, locale)}</Link>
            </h3>
            <p>{row.category.labels[locale]}</p>
            <ul>
              {row.variants.map((variant) => (
                <li key={variant.id}>{variantLabel(variant, locale)}</li>
              ))}
            </ul>
            {row.variantCount > row.variants.length && (
              <p className="field-help">{t("moreVariantsInDetail")}</p>
            )}
            {row.identifiers.map((identifier) => (
              <p key={identifier.id}>
                {identifier.namespace} · {identifier.type} · {identifier.value}
              </p>
            ))}
            {onChoose && (
              <button type="button" onClick={() => onChoose(row.id)}>
                {t("chooseReference")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void search(undefined, true)}
        >
          {t("moreResults")}
        </button>
      )}
    </div>
  );
}
