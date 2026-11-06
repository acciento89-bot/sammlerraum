"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CatalogSnapshot, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import type { MoneyView } from "@sammlerraum/contracts/legacy-money";
import { readCanonicalMoney } from "./catalog-money-client";
import { CatalogFacts } from "./catalog-facts";
export function CanonicalCatalogFacts({
  state,
  revision,
  category,
  locale,
  onReview,
  refresh = 0,
}: {
  state: CatalogSnapshot;
  revision: number;
  category: CategoryTemplate | null;
  locale: "de" | "en";
  onReview?: (view: MoneyView) => void;
  refresh?: number;
}) {
  const t = useTranslations("LegacyMoney");
  const [result, setResult] = useState<{
      entryId: string;
      revision: number;
      values: Map<string, MoneyView>;
    } | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(false);
    void readCanonicalMoney(state, revision)
      .then((value) => {
        if (!cancelled) setResult({ entryId: state.id, revision, values: value });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [state, revision, retry, refresh]);
  const money = result?.entryId === state.id && result.revision === revision ? result.values : null;
  return (
    <>
      {error && (
        <p className="notice" role="status">
          {t("readFailed")}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {t("checkCurrent")}
          </button>
        </p>
      )}
      <CatalogFacts
        state={state}
        category={category}
        locale={locale}
        {...(money ? { money } : {})}
        {...(onReview ? { onReview } : {})}
      />
    </>
  );
}
