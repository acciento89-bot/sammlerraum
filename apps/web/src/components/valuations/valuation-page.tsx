"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ValuationController } from "./valuation-state";
import { valuationTransport } from "./valuation-client";
import type { Locale } from "./valuation-money";
import { ManualValuationForm } from "./manual-valuation-form";
import { ManualValuationHistory, ManualValuationRow } from "./manual-valuation-history";
import { MarketObservationHistory } from "./market-observation-history";
export function ValuationPage({
  itemId,
  title,
  locale,
}: {
  itemId: string;
  title: string;
  locale: Locale;
}) {
  const t = useTranslations("Valuations");
  const [controller] = useState(() => new ValuationController(valuationTransport(itemId)));
  const [state, setState] = useState(controller.state);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const unsubscribe = controller.subscribe(() => setState(controller.state));
    void controller.load();
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);
  useEffect(() => setDirty(false), [state.draftVersion]);
  const busy = state.mutation === "submitting",
    unknown = state.mutation === "unknown";
  const controls = busy || unknown || state.loading;
  if (state.access)
    return (
      <section className="management-shell">
        <h1>{t("title")}</h1>
        <p role="alert">{t(state.access)}</p>
        {state.access === "session" && <Link href={`/${locale}/login`}>{t("login")}</Link>}
      </section>
    );
  const summary = state.summary;
  const externalCurrent = summary?.external.scope === state.options.scope;
  return (
    <section className="management-shell valuations-shell">
      <nav className="management-nav" aria-label={t("title")}>
        <Link href={`/${locale}/items/${itemId}`}>{t("back")}</Link>
        {(["de", "en"] as const)
          .filter((language) => language !== locale)
          .map((language) =>
            controls ? (
              <span key={language} aria-disabled="true">
                {language === "de" ? "Deutsch" : "English"}
              </span>
            ) : (
              <Link key={language} prefetch={false} href={`/${language}/items/${itemId}/values`}>
                {t(dirty ? "discardLanguage" : "switchLanguage", {
                  language: language === "de" ? "Deutsch" : "English",
                })}
              </Link>
            ),
          )}
      </nav>
      <header className="management-heading">
        <p className="eyebrow">{title}</p>
        <h1>{t("title")}</h1>
        <p className="form-intro">{t("perUnit")}</p>
        {summary && <p>{t("quantity", { quantity: summary.quantity })}</p>}
      </header>
      <div className="value-actions">
        <button disabled={busy || state.loading} onClick={() => void controller.load()}>
          {t("retry")}
        </button>
        {state.loading && <p role="status">{t("loading")}</p>}
      </div>
      {state.stale && <p className="notice">{t("stale")}</p>}
      {state.error && <p role="alert">{t(state.error)}</p>}
      {unknown && state.error !== "unknown" && <p role="alert">{t("unknown")}</p>}
      {state.mutation === "saved" && (
        <p role="status" className="success">
          {t("saved")}
        </p>
      )}
      {unknown && <button onClick={() => controller.newEntry()}>{t("newEntry")}</button>}
      {state.ack && (
        <section aria-labelledby="values-confirmed" className="value-card">
          <h2 id="values-confirmed">{t("confirmed")}</h2>
          <ManualValuationRow row={state.ack} locale={locale} />
        </section>
      )}
      {summary && (
        <>
          <div className="value-overview">
            <section aria-labelledby="values-latest" className="value-card">
              <h2 id="values-latest">{t("latest")}</h2>
              {summary.manual.latest ? (
                <ManualValuationRow row={summary.manual.latest} locale={locale} />
              ) : (
                <p>{t("noEstimate")}</p>
              )}
            </section>
            {summary.lifecycle === "ACTIVE" ? (
              <ManualValuationForm
                key={state.draftVersion}
                locale={locale}
                disabled={!controller.canAppend}
                submitting={busy}
                onDirty={setDirty}
                onSubmit={(input) => void controller.append(input)}
              />
            ) : (
              <p className="notice">{t(summary.lifecycle)}</p>
            )}
          </div>
          <section aria-labelledby="values-personal" className="value-card">
            <h2 id="values-personal">{t("manualHistory")}</h2>
            <p className="field-help">{t("order")}</p>
            <ManualValuationHistory rows={summary.manual.history.records} locale={locale} />
            <div className="value-actions">
              <button
                disabled={controls || !summary.manual.history.nextCursor}
                onClick={() =>
                  void controller.load({
                    ...state.options,
                    manualCursor: summary.manual.history.nextCursor!,
                  })
                }
              >
                {t("older")}
              </button>
              <button
                disabled={controls || !state.options.manualCursor}
                onClick={() => {
                  const { manualCursor: _, ...options } = state.options;
                  void controller.load(options);
                }}
              >
                {t("newest")}
              </button>
            </div>
          </section>
          <section aria-labelledby="values-external" className="value-card">
            <h2 id="values-external">{t("external")}</h2>
            <p>{t("scopeHelp")}</p>
            <label>
              {t("scope")}
              <select
                aria-label={t("scope")}
                disabled={controls}
                value={state.options.scope ?? summary.external.scope}
                onChange={(e) =>
                  void controller.scope(e.target.value as "CURRENT_MAPPING" | "HISTORICAL_MAPPING")
                }
              >
                <option value="CURRENT_MAPPING">{t("CURRENT_MAPPING")}</option>
                <option value="HISTORICAL_MAPPING">{t("HISTORICAL_MAPPING")}</option>
              </select>
            </label>
            {summary.catalog && (
              <p>
                <Link href={`/${locale}/catalog/${summary.catalog.entryId}`}>{t("catalog")}</Link> ·{" "}
                {t("revision", { revision: summary.catalog.revision })}
                {summary.catalog.variantId && <> · {t("variant")}</>}
                {!summary.catalog.variantActive && <> · {t("variantRetired")}</>}
              </p>
            )}
            {externalCurrent && summary.currencyConflict && (
              <p className="notice">{t("conflict")}</p>
            )}
            {externalCurrent && summary.external.availability !== "AVAILABLE" && (
              <p>{t(summary.external.availability)}</p>
            )}
            <div className="value-source-groups">
              {(externalCurrent ? summary.external.groups : []).map((group, index) => {
                const expanded = state.selector === group.source;
                const history = expanded && state.source ? state.source.history : group.history;
                return (
                  <section
                    key={group.source}
                    aria-labelledby={`value-source-${index}`}
                    className="value-source"
                  >
                    <h3 id={`value-source-${index}`}>
                      {t(group.key.kind)} · {group.key.currency}
                    </h3>
                    <p>{group.key.providerId}</p>
                    <details>
                      <summary>{t("sourceDetails")}</summary>
                      <p>
                        {group.key.identifierNamespace} · {group.key.identifierType} ·{" "}
                        {group.key.externalId}
                      </p>
                    </details>
                    <MarketObservationHistory rows={history.records} locale={locale} />
                    {expanded && state.sourceLoading && <p role="status">{t("loading")}</p>}
                    <div className="value-actions">
                      <button
                        disabled={controls || state.sourceLoading}
                        onClick={() => void controller.source(group.source)}
                      >
                        {t("sourceHistory")}
                      </button>
                      <button
                        disabled={controls || state.sourceLoading || !history.nextCursor}
                        onClick={() => void controller.source(group.source, history.nextCursor!)}
                      >
                        {t("older")}
                      </button>
                      {expanded && (
                        <button
                          disabled={controls || state.sourceLoading}
                          onClick={() => void controller.source(group.source)}
                        >
                          {t("newest")}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="value-actions">
              <button
                disabled={controls || !externalCurrent || !summary.external.nextGroupCursor}
                onClick={() =>
                  void controller.load({
                    ...state.options,
                    groupCursor: summary.external.nextGroupCursor!,
                  })
                }
              >
                {t("nextSources")}
              </button>
              <button
                disabled={controls || !state.options.groupCursor}
                onClick={() => {
                  const { groupCursor: _, ...options } = state.options;
                  void controller.load(options);
                }}
              >
                {t("firstSources")}
              </button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
