"use client";
import { useTranslations } from "next-intl";
import type { MarketReferenceTotal } from "@sammlerraum/contracts/dashboard";
import {
  formatDashboardInteger as integer,
  formatDashboardMoney as money,
} from "./dashboard-format";
import { observationTime } from "../valuations/valuation-money";
export function MarketReferenceValues({
  groups,
  locale,
}: {
  groups: readonly MarketReferenceTotal[];
  locale: "de" | "en";
}) {
  const t = useTranslations("Dashboard"),
    values = useTranslations("Valuations");
  return (
    <section
      className="management-card"
      aria-labelledby="dashboard-market-heading"
      data-testid="dashboard-market-reference-values"
    >
      <h3 id="dashboard-market-heading">{t("marketReferenceTitle")}</h3>
      <p>{t("marketReferenceHelp")}</p>
      <p>{t("marketReferenceScope")}</p>
      <ul className="dashboard-money-groups">
        {groups.map((group, n) => (
          <li key={n}>
            <h4>
              {group.selector.providerId} · {values(group.selector.kind)}
            </h4>
            <p>
              {group.selector.sourceMetric} · {group.selector.identifierNamespace}/
              {group.selector.identifierType}
            </p>
            <p>
              {Object.entries(group.selector.qualifiers)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                .join(" · ")}
            </p>
            <p>{t(`marketReferenceBasis.${group.basis}`)}</p>
            <p role="status">{t(`marketReferenceCoverage.${group.coverage}`)}</p>
            {group.total && (
              <strong>
                {group.total.type === "POINT"
                  ? money(group.total.amountMinor, group.selector.minorUnitExponent, locale)
                  : `${money(group.total.lowMinor, group.selector.minorUnitExponent, locale)} – ${money(group.total.highMinor, group.selector.minorUnitExponent, locale)}`}{" "}
                {group.selector.currency}
              </strong>
            )}
            <p>
              {t("marketReferenceCounts", {
                contributing: integer(group.contributingItemCount, locale),
                candidates: integer(group.candidateItemCount, locale),
                missing: integer(group.missingItemCount, locale),
                quantity: integer(group.contributedQuantity, locale),
              })}
            </p>
            <p>{t("storedScale", { scale: group.selector.minorUnitExponent })}</p>
            {group.observedAtFrom && group.observedAtTo && (
              <p>
                {t("marketReferencePeriod", {
                  from: observationTime(group.observedAtFrom, "MILLISECOND", locale),
                  to: observationTime(group.observedAtTo, "MILLISECOND", locale),
                })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
