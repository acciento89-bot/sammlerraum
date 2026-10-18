"use client";
import { useTranslations } from "next-intl";
import type { MarketObservationDto } from "@sammlerraum/contracts/valuations";
import {
  formatValuationMoney,
  observationTime,
  safeSourceUrl,
  type Locale,
} from "./valuation-money";
export function MarketObservationHistory({
  rows,
  locale,
}: {
  rows: MarketObservationDto[];
  locale: Locale;
}) {
  const t = useTranslations("Valuations");
  return (
    <ol className="value-list">
      {rows.map((row) => {
        const money = (amountMinor: string) =>
          formatValuationMoney(
            {
              amountMinor,
              currency: row.source.currency,
              minorUnitExponent: row.minorUnitExponent,
            },
            locale,
          );
        const url = safeSourceUrl(row.sourceUrl);
        return (
          <li key={row.id}>
            <article className="value-record" data-observation-id={row.id}>
              <strong className="value-amount">
                {row.price.type === "POINT"
                  ? money(row.price.amountMinor)
                  : `${money(row.price.lowMinor)} – ${money(row.price.highMinor)}`}
              </strong>
              <p>
                {t(row.observedBasis)} · {t(row.observedPrecision)}
              </p>
              <dl>
                <div>
                  <dt>{t("observed")}</dt>
                  <dd>
                    <time dateTime={row.observedAt}>
                      {observationTime(row.observedAt, row.observedPrecision, locale)} UTC
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>{t("fetched")}</dt>
                  <dd>
                    <time dateTime={row.fetchedAt}>
                      {observationTime(row.fetchedAt, "MILLISECOND", locale)} UTC
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>{t("recorded")}</dt>
                  <dd>
                    <time dateTime={row.recordedAt}>
                      {observationTime(row.recordedAt, "MILLISECOND", locale)} UTC
                    </time>
                  </dd>
                </div>
              </dl>
              {row.sourceReference && (
                <p>
                  {t("reference")}: {row.sourceReference}
                </p>
              )}
              {url && (
                <a href={url.href} target="_blank" rel="noopener noreferrer">
                  {t("sourceLink", { host: url.host })}
                </a>
              )}
              <details>
                <summary>{t("sourceDetails")}</summary>
                <dl>
                  <div>
                    <dt>{t("metric")}</dt>
                    <dd>{row.sourceMetric}</dd>
                  </div>
                  {Object.entries(row.qualifiers).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{typeof value === "boolean" ? t(value ? "yes" : "no") : value}</dd>
                    </div>
                  ))}
                  {row.confidence?.sourceLabel !== undefined && (
                    <div>
                      <dt>{t("sourceLabel")}</dt>
                      <dd>{row.confidence.sourceLabel}</dd>
                    </div>
                  )}
                  {row.confidence?.sampleSize !== undefined && (
                    <div>
                      <dt>{t("sampleSize")}</dt>
                      <dd>{row.confidence.sampleSize}</dd>
                    </div>
                  )}
                  {row.confidence?.methodology !== undefined && (
                    <div>
                      <dt>{t("methodology")}</dt>
                      <dd>{row.confidence.methodology}</dd>
                    </div>
                  )}
                </dl>
                <p>
                  {t("revision", { revision: row.catalogMatch.observedRevision })} →{" "}
                  {t("revision", { revision: row.catalogMatch.currentRevision })}
                </p>
                {row.catalogMatch.revisionChanged && <p>{t("revisionChanged")}</p>}
                {row.catalogMatch.identifierRecordChanged && <p>{t("identifierChanged")}</p>}
                {!row.catalogMatch.identifierActive && <p>{t("mappingRetired")}</p>}
                {!row.catalogMatch.variantActive && <p>{t("variantRetired")}</p>}
              </details>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
