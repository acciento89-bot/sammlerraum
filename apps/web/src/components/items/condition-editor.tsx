"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { ConditionScheme, ItemCondition } from "@sammlerraum/contracts/condition";
import { CategoryPicker } from "../catalog/category-picker";
import { catalogRequest, catalogError, type Locale } from "../catalog/catalog-client";
export function ConditionEditor({
  itemId,
  locale,
  condition,
  linked,
  readOnly,
  onChange,
}: {
  itemId: string;
  locale: Locale;
  condition: ItemCondition;
  linked: boolean;
  readOnly: boolean;
  onChange: () => Promise<void>;
}) {
  const t = useTranslations("Catalog");
  const [category, setCategory] = useState(condition.categoryTemplateId ?? "");
  const [option, setOption] = useState(condition.conditionOption?.id ?? "");
  const [scheme, setScheme] = useState<ConditionScheme | null>(null);
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setCategory(condition.categoryTemplateId ?? "");
    setOption(condition.conditionOption?.id ?? "");
    setClear(false);
  }, [condition]);
  useEffect(() => {
    const control = new AbortController();
    setScheme(null);
    if (!condition.categoryTemplateId) return;
    setLoading(true);
    void catalogRequest<{ scheme: ConditionScheme | null }>(
      `/api/v1/categories/${condition.categoryTemplateId}/condition-scheme`,
      "GET",
      undefined,
      control.signal,
    )
      .then((body) => {
        if (!control.signal.aborted) {
          setScheme(body.scheme);
          setError("");
        }
      })
      .catch((problem) => {
        if (!control.signal.aborted) setError(catalogError(problem, t));
      })
      .finally(() => {
        if (!control.signal.aborted) setLoading(false);
      });
    return () => control.abort();
  }, [condition.categoryTemplateId, t, retry]);
  async function save(event: FormEvent, kind: "category" | "condition") {
    event.preventDefault();
    if (busy || readOnly) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await catalogRequest(
        `/api/v1/items/${itemId}/${kind}`,
        "PUT",
        kind === "category"
          ? { categoryTemplateId: category || null, clearCondition: clear }
          : { optionId: option || null },
      );
      await onChange();
      setStatus(t(kind === "category" ? "categorySaved" : "conditionSaved"));
    } catch (problem) {
      setError(catalogError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  const retained = condition.conditionOption;
  const categoryChanged = category !== (condition.categoryTemplateId ?? "");
  return (
    <section className="management-card" aria-label={t("conditionSection")}>
      <h2>{t("conditionSection")}</h2>
      {readOnly ? (
        <>
          <p>{t("readOnly")}</p>
          <CategoryPicker
            locale={locale}
            value={condition.categoryTemplateId ?? ""}
            onChange={() => undefined}
            disabled
          />
          <p>{retained?.labels[locale] ?? t("noCondition")}</p>
        </>
      ) : (
        <>
          <form className="compact-form" onSubmit={(event) => void save(event, "category")}>
            <CategoryPicker
              locale={locale}
              value={category}
              onChange={setCategory}
              disabled={busy || linked}
            />
            {linked && <p className="field-help">{t("unlinkBeforeCategory")}</p>}
            {categoryChanged && retained && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={clear}
                  onChange={(event) => setClear(event.target.checked)}
                />
                {t("clearForCategory")}
              </label>
            )}
            <button
              type="submit"
              disabled={busy || !categoryChanged || Boolean(retained && !clear)}
            >
              {t("saveCategory")}
            </button>
          </form>
          <form className="compact-form" onSubmit={(event) => void save(event, "condition")}>
            <label>
              {t("personalCondition")}
              <select
                aria-label={t("personalCondition")}
                value={option}
                onChange={(event) => setOption(event.target.value)}
                disabled={busy || loading || !condition.categoryTemplateId}
              >
                <option value="">{t("noCondition")}</option>
                {retained && !scheme?.options.some((row) => row.id === retained.id) && (
                  <option value={retained.id} disabled>
                    {retained.labels[locale]} — {t("retained")}
                  </option>
                )}
                {scheme?.options.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.labels[locale]}
                  </option>
                ))}
              </select>
            </label>
            {retained && (!retained.active || condition.schemeActive === false) && (
              <p className="notice">{t("retainedCondition")}</p>
            )}
            {!scheme && !loading && condition.categoryTemplateId && (
              <p className="field-help">{t("noScheme")}</p>
            )}
            <button type="submit" disabled={busy || loading || option === (retained?.id ?? "")}>
              {t("saveCondition")}
            </button>
          </form>
        </>
      )}
      {loading && <p role="status">{t("loading")}</p>}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setRetry((value) => value + 1);
              void onChange().catch(() => undefined);
            }}
          >
            {t("retry")}
          </button>
        </p>
      )}
    </section>
  );
}
