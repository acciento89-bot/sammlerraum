"use client";
import { useTranslations } from "next-intl";
import type { PurchaseCostResult } from "@sammlerraum/contracts/money-coverage";
import { formatDashboardInteger, formatDashboardMoney } from "./dashboard-format";
export function PurchaseCosts({ data, locale }: { data: PurchaseCostResult; locale: "de" | "en" }) {
  const t = useTranslations("Dashboard"),
    integer = (value: string | number) => formatDashboardInteger(String(value), locale);
  const coverage = data.coverage,
    selection = data.selectionCoverage;
  return (
    <section
      className="management-card"
      aria-labelledby="dashboard-purchase-heading"
      data-testid="dashboard-purchase-costs"
    >
      <h3 id="dashboard-purchase-heading">{t("purchaseTitle")}</h3>
      <p role="status" data-testid="purchase-cost-state">
        {t(`purchaseStates.${data.state}`)}
      </p>
      <p>
        {t("purchaseOuterCoverage", {
          items: integer(coverage.selectedItems),
          units: integer(coverage.selectedUnits),
          unknown: integer(coverage.unknownPaths + coverage.ineligiblePaths),
        })}
      </p>
      {selection && (
        <p>
          {t("purchaseSelectedCoverage", {
            items: integer(selection.selectedItems),
            units: integer(selection.selectedUnits),
            priced: integer(selection.presentUnits),
            missing: integer(selection.missingUnits),
          })}
        </p>
      )}
      {data.state === "PARTIAL" && <p>{t("purchasePartialHelp")}</p>}
      {data.state === "UNAVAILABLE" && <p>{t("purchaseUnknownHelp")}</p>}
      {data.groups && data.groups.length > 0 && (
        <ul className="dashboard-money-groups">
          {data.groups.map((group) => (
            <li key={`${group.currency}:${group.unitKey}:${group.exponent}`}>
              <strong>
                {formatDashboardMoney(group.totalMinor, group.exponent, locale)} {group.currency}
              </strong>
              <span className="field-help">
                {" "}
                · {t("purchaseStoredScale", { scale: group.exponent })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.groups && data.groups.length > 0 && (
        <p className="field-help">{t("purchaseGroupingHelp")}</p>
      )}
    </section>
  );
}
