"use client";
import { useTranslations } from "next-intl";
import type { ManualValuationDto } from "@sammlerraum/contracts/valuations";
import { formatValuationMoney, observationTime, type Locale } from "./valuation-money";
export function ManualValuationRow({ row, locale }: { row: ManualValuationDto; locale: Locale }) {
  const t = useTranslations("Valuations");
  return (
    <article className="value-record" data-valuation-id={row.id}>
      <strong className="value-amount">{formatValuationMoney(row, locale)}</strong>
      <dl>
        <div>
          <dt>{t("observed")}</dt>
          <dd>
            <time dateTime={row.observedAt}>
              {observationTime(row.observedAt, "MILLISECOND", locale)} UTC
            </time>
          </dd>
        </div>
        <div>
          <dt>{t("created")}</dt>
          <dd>
            <time dateTime={row.createdAt}>
              {observationTime(row.createdAt, "MILLISECOND", locale)} UTC
            </time>
          </dd>
        </div>
      </dl>
      {row.note !== null && <p className="preserve-lines">{row.note}</p>}
    </article>
  );
}
export function ManualValuationHistory({
  rows,
  locale,
}: {
  rows: ManualValuationDto[];
  locale: Locale;
}) {
  const t = useTranslations("Valuations");
  return rows.length ? (
    <ol className="value-list">
      {rows.map((row) => (
        <li key={row.id}>
          <ManualValuationRow row={row} locale={locale} />
        </li>
      ))}
    </ol>
  ) : (
    <p>{t("emptyManual")}</p>
  );
}
