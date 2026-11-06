"use client";
import { useTranslations } from "next-intl";
import type { MoneyView } from "@sammlerraum/contracts/legacy-money";
import { valuationCurrencyCodes as currencyChoices } from "@sammlerraum/domain/money/currencies";
import {
  initialMoneyDraft,
  displayStoredMoney,
  previewMoneyDraft,
  type MoneyDraft,
} from "./legacy-money-draft";
export function MoneyReadout({
  view,
  locale,
  label,
}: {
  view: MoneyView;
  locale: "de" | "en";
  label: string;
}) {
  const t = useTranslations("LegacyMoney"),
    display = displayStoredMoney(view, locale);
  return (
    <div className="money-readout">
      <output aria-label={`${label} · ${t("storedValue")}`}>
        {display.amount === null ? t("missing") : `${display.amount} ${display.currency}`}
      </output>
      <span className="money-status">
        {t(
          display.status === "UNKNOWN"
            ? "unknown"
            : display.status === "MISSING"
              ? "missing"
              : display.status === "UNIT_UNSUPPORTED"
                ? "unsupported"
                : "interpreted",
        )}
      </span>
      {display.status === "UNKNOWN" && <small>{t("rawValue")}</small>}
    </div>
  );
}
export function LegacyMoneyEditor({
  label,
  name,
  locale,
  view,
  existing,
  draft,
  onChange,
  disabled,
  loaded = true,
  onReview,
}: {
  label: string;
  name: string;
  locale: "de" | "en";
  view: MoneyView | null;
  existing: boolean;
  draft: MoneyDraft;
  onChange(value: MoneyDraft): void;
  disabled?: boolean;
  loaded?: boolean;
  onReview?(): void;
}) {
  const t = useTranslations("LegacyMoney");
  const hasRaw = Boolean(view?.raw),
    changing = draft.mode !== "KEEP";
  const inputVisible = draft.mode === "REPLACE" || (!hasRaw && loaded && draft.mode === "KEEP");
  let preview: ReturnType<typeof previewMoneyDraft> | null = null;
  try {
    if (draft.mode === "REPLACE" && draft.decimal.trim()) preview = previewMoneyDraft(draft);
  } catch {
    /* Invalid input remains visible, never converted or submitted implicitly. */
  }
  const currencyOptions = currencyChoices.includes(draft.currency)
    ? currencyChoices
    : [draft.currency, ...currencyChoices];
  return (
    <section className="money-editor" aria-label={label}>
      <h4>{label}</h4>
      {existing && !loaded ? (
        <p role="status">{t("loading")}</p>
      ) : view ? (
        <MoneyReadout view={view} locale={locale} label={label} />
      ) : (
        <p className="money-status">{t("missing")}</p>
      )}
      <fieldset disabled={disabled || !loaded}>
        {hasRaw && draft.mode === "KEEP" && (
          <div className="money-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onChange({
                  ...draft,
                  expectedFactToken: view!.factToken,
                  mode: "REPLACE",
                  acknowledged: false,
                })
              }
            >
              {t("replace")}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onChange({
                  ...draft,
                  expectedFactToken: view!.factToken,
                  mode: "CLEAR",
                  acknowledged: false,
                })
              }
            >
              {t("clear")}
            </button>
            {onReview && (
              <button type="button" className="secondary-button" onClick={onReview}>
                {t("review")}
              </button>
            )}
          </div>
        )}
        {inputVisible && (
          <div className="form-row">
            <label>
              {hasRaw ? t("newAmount") : label}
              <input
                name={name}
                inputMode="decimal"
                maxLength={96}
                value={draft.decimal}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    mode: e.target.value.trim() || hasRaw ? "REPLACE" : "KEEP",
                    decimal: e.target.value,
                    acknowledged: false,
                  })
                }
              />
            </label>
            <label>
              {t("currency")}
              <select
                name={`${name}-currency`}
                value={draft.currency}
                onChange={(e) =>
                  onChange({ ...draft, currency: e.target.value, acknowledged: false })
                }
              >
                {currencyOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {draft.mode === "REPLACE" && preview && (
          <p className="money-preview" role="status">
            {t("preview", {
              amount: preview.normalizedDecimal.replace(".", locale === "de" ? "," : "."),
              currency: preview.raw.currency,
            })}
          </p>
        )}
        {draft.mode === "REPLACE" && draft.decimal.trim() && !preview && (
          <p className="error">{t("invalid")}</p>
        )}
        {changing && hasRaw && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.acknowledged}
                onChange={(e) => onChange({ ...draft, acknowledged: e.target.checked })}
              />
              {t(draft.mode === "CLEAR" ? "clearAck" : "replacementAck")}
            </label>
            {draft.mode === "REPLACE" && (
              <label>
                {t("reason")}
                <textarea
                  maxLength={4000}
                  value={draft.correctionReason}
                  onChange={(e) => onChange({ ...draft, correctionReason: e.target.value })}
                  required
                />
              </label>
            )}
          </>
        )}
        {changing && hasRaw && draft.expectedFactToken !== view?.factToken && (
          <p className="notice" role="status">
            {t("staleDraft")}
          </p>
        )}
        {changing && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onChange(initialMoneyDraft(view))}
          >
            {t("keep")}
          </button>
        )}
      </fieldset>
    </section>
  );
}
