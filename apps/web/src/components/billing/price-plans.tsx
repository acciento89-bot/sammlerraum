"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  QUOTA_FEATURES,
  PREMIUM_FEATURES,
  type BillingPolicy,
} from "@sammlerraum/contracts/billing";
import type { BillingOffer } from "@sammlerraum/contracts/billing-ui";
import {
  formatDashboardInteger as integer,
  formatDashboardMoney as money,
} from "../search/dashboard-format";
export function PricePlans({
  locale,
  policy,
  offers,
  choose,
  busy = false,
}: {
  locale: "de" | "en";
  policy: BillingPolicy | null;
  offers: BillingOffer[] | null;
  choose?: (cadence: "MONTHLY" | "YEARLY") => void;
  busy?: boolean;
}) {
  const t = useTranslations("Billing");
  return (
    <>
      <div className="billing-plans">
        <article className="management-card">
          <p className="eyebrow">{t("plans.FREE")}</p>
          <h2>{t("freeForever")}</h2>
          <p>{t("freeCore")}</p>
          <Link href={`/${locale}/collections`}>{t("openCollection")}</Link>
        </article>
        {offers?.map((offer) => (
          <article
            className="management-card billing-premium"
            key={offer.cadence}
            data-testid={`billing-offer-${offer.cadence}`}
          >
            <p className="eyebrow">{t("plans.PREMIUM")}</p>
            <h2>{t(`cadence.${offer.cadence}`)}</h2>
            <p className="billing-price">
              {money(offer.amountMinor, offer.minorUnitExponent, locale)}{" "}
              <span>{offer.currency}</span>
            </p>
            <p>{t(`period.${offer.cadence}`)}</p>
            <p className="field-help">{t(`tax.${offer.taxBehavior}`)}</p>
            {choose ? (
              <button type="button" disabled={busy} onClick={() => choose(offer.cadence)}>
                {t("choose", { cadence: t(`cadence.${offer.cadence}`) })}
              </button>
            ) : (
              <Link className="billing-link" href={`/${locale}/account/billing`}>
                {t("viewAccount")}
              </Link>
            )}
          </article>
        ))}
        {!offers && (
          <article className="management-card">
            <p className="eyebrow">{t("plans.PREMIUM")}</p>
            <h2>{t("pricingUnavailable")}</h2>
            <p>{t("noGuessedPrice")}</p>
          </article>
        )}
      </div>
      {offers && <p className="field-help">{t("checkoutTotal")}</p>}
      <p className="field-help">{t("serviceAvailability")}</p>
      {policy ? (
        <div className="billing-comparison" role="region" aria-label={t("compare")} tabIndex={0}>
          <p className="field-help">{t("comparisonScroll")}</p>
          <table>
            <caption>{t("compare")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("feature")}</th>
                <th scope="col">{t("plans.FREE")}</th>
                <th scope="col">{t("plans.PREMIUM")}</th>
              </tr>
            </thead>
            <tbody>
              {QUOTA_FEATURES.map((feature) => (
                <tr key={feature}>
                  <th scope="row">{t(`features.${feature}`)}</th>
                  {(["FREE", "PREMIUM"] as const).map((plan) => (
                    <td key={plan}>
                      {policy[plan][feature] === null
                        ? t("unlimited")
                        : integer(String(policy[plan][feature]), locale)}
                    </td>
                  ))}
                </tr>
              ))}
              {PREMIUM_FEATURES.map((feature) => (
                <tr key={feature}>
                  <th scope="row">{t(`features.${feature}`)}</th>
                  {(["FREE", "PREMIUM"] as const).map((plan) => (
                    <td key={plan}>{t(policy[plan][feature] ? "included" : "notIncluded")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="status">{t("policyUnavailable")}</p>
      )}
    </>
  );
}
