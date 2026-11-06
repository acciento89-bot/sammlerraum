"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { usePersonalMilestones } from "./use-personal-milestones";
import { MilestoneRows } from "./milestone-rows";
import { observationTime } from "../valuations/valuation-money";
export function PersonalMilestones({ actor, locale }: { actor: string; locale: "de" | "en" }) {
  const t = useTranslations("Milestones"),
    heading = useId(),
    { state, load, closed } = usePersonalMilestones(actor, 5);
  return (
    <section
      className="management-card milestone-preview"
      aria-labelledby={heading}
      aria-busy={state.loading}
      data-testid="milestone-preview"
    >
      <h2 id={heading}>{t("title")}</h2>
      <p>{t("scope")}</p>
      <p className="field-help">{t("dateHelp")}</p>
      {state.loading && <p role="status">{t("loading")}</p>}
      {state.error && (
        <div role="alert">
          <p>{state.error === "session" ? t("session") : t("loadFailed")}</p>
          {state.error === "session" ? (
            <Link href={`/${locale}/login`} prefetch={false}>
              {t("signIn")}
            </Link>
          ) : (
            <button type="button" onClick={() => void load(undefined, true)}>
              {t("retry")}
            </button>
          )}
        </div>
      )}
      {state.stale && <p role="status">{t("stale")}</p>}
      {state.page && (
        <>
          <p data-testid="milestone-total">{t("total", { count: state.page.total })}</p>
          <p className="field-help">
            {t("readAt", { time: observationTime(state.page.readAt, "MILLISECOND", locale) })}
          </p>
          {state.page.total === 0 ? (
            <p>{t("empty")}</p>
          ) : (
            <>
              <MilestoneRows items={state.page.items} locale={locale} />
              <p className="field-help">
                {t("previewCount", { shown: state.page.items.length, total: state.page.total })}
              </p>
            </>
          )}
        </>
      )}
      <div className="milestone-actions">
        <Link href={`/${locale}/milestones`} prefetch={false}>
          {t("manage")}
        </Link>
        <button
          type="button"
          className="secondary-button"
          disabled={state.loading || closed}
          onClick={() => void load(undefined, true)}
        >
          {t("refresh")}
        </button>
      </div>
    </section>
  );
}
