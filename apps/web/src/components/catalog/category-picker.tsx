"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CategoryTemplate } from "@sammlerraum/contracts/catalog";
import { catalogRequest, catalogError, type Locale } from "./catalog-client";
type Category = Pick<CategoryTemplate, "id" | "key" | "labels">;
export function CategoryPicker({
  locale,
  value,
  onChange,
  disabled = false,
  label,
}: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const t = useTranslations("Catalog");
  const [rows, setRows] = useState<Category[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const body = await catalogRequest<{ categories: Category[]; nextCursor: string | null }>(
          "/api/v1/categories?limit=50",
          "GET",
          undefined,
          control.signal,
        );
        let categories = body.categories;
        if (value && !categories.some((row) => row.id === value)) {
          const selected = await catalogRequest<{ category: Category }>(
            `/api/v1/categories/${value}`,
            "GET",
            undefined,
            control.signal,
          );
          categories = [selected.category, ...categories];
        }
        if (!control.signal.aborted) {
          setRows(categories);
          setCursor(body.nextCursor);
          setError("");
        }
      } catch (problem) {
        if (!control.signal.aborted) setError(catalogError(problem, t));
      } finally {
        if (!control.signal.aborted) setLoading(false);
      }
    })();
    return () => control.abort();
  }, [retry, t, value]);
  async function more() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const body = await catalogRequest<{ categories: Category[]; nextCursor: string | null }>(
        `/api/v1/categories?limit=50&cursor=${encodeURIComponent(cursor)}`,
      );
      setRows((current) => [
        ...current,
        ...body.categories.filter((row) => !current.some((existing) => existing.id === row.id)),
      ]);
      setCursor(body.nextCursor);
    } catch (problem) {
      setError(catalogError(problem, t));
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <label>
        {label ?? t("category")}
        <select
          aria-label={label ?? t("category")}
          value={value}
          disabled={disabled || loading}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{t("noCategory")}</option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.labels[locale]}
            </option>
          ))}
        </select>
      </label>
      {loading && <p role="status">{t("loading")}</p>}
      {!loading && !rows.length && !error && <p className="empty-state">{t("noCategories")}</p>}
      {cursor && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => void more()}
          disabled={disabled || loading}
        >
          {t("moreCategories")}
        </button>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {t("retry")}
          </button>
        </p>
      )}
    </>
  );
}
