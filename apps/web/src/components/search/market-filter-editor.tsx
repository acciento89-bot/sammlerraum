"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MarketFilterOptionsSchema, MarketSelectorSchema } from "@sammlerraum/contracts/search";
import type { z } from "zod";
import type { LeafValue } from "./filter-draft";
import { scopedRequest } from "./scoped-search-client";
import { MoneyRange } from "./filter-predicate-editor";
import { SearchLabel } from "./search-label";
type Selector = z.infer<typeof MarketFilterOptionsSchema>["selectors"][number];
export function MarketFilterEditor({
  value,
  onChange,
  locale,
}: {
  value: LeafValue;
  onChange: (value: LeafValue) => void;
  locale: "de" | "en";
}) {
  const t = useTranslations("Search");
  const [sources, setSources] = useState<Selector[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    void scopedRequest(
      "/api/v1/search/market-selectors",
      undefined,
      MarketFilterOptionsSchema,
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted) setSources(result.selectors);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, []);
  const key = (selector: unknown) => {
    const parsed = MarketSelectorSchema.safeParse(selector);
    return parsed.success
      ? JSON.stringify({
          ...parsed.data,
          qualifiers: Object.fromEntries(
            Object.entries(parsed.data.qualifiers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          ),
        })
      : "";
  };
  const selected = sources.findIndex((source) => key(source) === key(value.selector));
  const source = selected >= 0 ? sources[selected] : undefined;
  const test = value.test ?? { op: "present" };
  const ops = [
    "present",
    "missing",
    ...(source?.kind === "PRICE_RANGE" ? ["overlaps", "containedBy"] : ["range"]),
  ];
  return (
    <div className="form-stack">
      <SearchLabel>
        {t("marketSource")}
        <select
          value={String(selected)}
          disabled={loading || !sources.length}
          onChange={(event) => {
            const next = sources[Number(event.target.value)];
            if (next) onChange({ kind: "marketMoney", selector: next, test: { op: "present" } });
          }}
        >
          <option value="-1">{t("choose")}</option>
          {sources.map((item, index) => (
            <option key={key(item)} value={String(index)}>
              {item.providerId} · {item.currency} · {t(`marketKinds.${item.kind}`)} ·{" "}
              {item.sourceMetric}
            </option>
          ))}
        </select>
      </SearchLabel>
      {loading ? (
        <p role="status">{t("loading")}</p>
      ) : error ? (
        <p role="alert">{t("marketSourcesFailed")}</p>
      ) : !sources.length ? (
        <p role="status">{t("marketNoSources")}</p>
      ) : null}
      {source ? (
        <>
          <p>
            {t("marketSourceUnit", {
              currency: source.currency,
              exponent: source.minorUnitExponent,
            })}
          </p>
          {!!Object.keys(source.qualifiers).length && (
            <dl>
              {Object.entries(source.qualifiers).map(([name, v]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          <SearchLabel>
            {t("operator")}
            <select
              value={test.op}
              onChange={(event) => onChange({ ...value, test: { op: event.target.value } })}
            >
              {ops.map((op) => (
                <option key={op} value={op}>
                  {t(`operators.${op}`)}
                </option>
              ))}
            </select>
          </SearchLabel>
          {!["present", "missing"].includes(test.op) && (
            <MoneyRange
              key={`${key(source)}:${test.op}`}
              test={{
                ...test,
                unit: { currency: source.currency, minorUnitExponent: source.minorUnitExponent },
              }}
              legacy
              fixedUnit
              locale={locale}
              onChange={(next) => {
                const { unit: _unit, ...bounds } = next;
                onChange({ ...value, test: bounds });
              }}
            />
          )}
        </>
      ) : value.selector ? (
        <>
          <p role="status">{t("marketRetained")}</p>
          <pre className="scoped-retained-condition">
            {JSON.stringify({ selector: value.selector, test }, null, 2)}
          </pre>
        </>
      ) : null}
    </div>
  );
}
