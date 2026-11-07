"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  currencyMinorUnitExponent,
  valuationCurrencyCodes,
} from "@sammlerraum/domain/money/currencies";
import type { ManualValuationInputDto } from "@sammlerraum/contracts/valuations";
import { emptyDraft, formatValuationMoney, manualInput, type Locale } from "./valuation-money";
export function ManualValuationForm({
  locale,
  disabled,
  submitting,
  onSubmit,
  onDirty,
}: {
  locale: Locale;
  disabled: boolean;
  submitting: boolean;
  onSubmit: (input: ManualValuationInputDto) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const t = useTranslations("Valuations");
  const [draft, setDraft] = useState(emptyDraft);
  const [invalid, setInvalid] = useState(false);
  const [inputLocale] = useState(locale);
  function change(patch: Partial<typeof draft>) {
    setDraft((old) => ({ ...old, ...patch }));
    onDirty(true);
    setInvalid(false);
  }
  let preview = "";
  try {
    const value = manualInput(draft, inputLocale);
    preview = formatValuationMoney(
      {
        amountMinor: value.amountMinor,
        currency: value.currency,
        minorUnitExponent: currencyMinorUnitExponent(value.currency),
      },
      locale,
    );
  } catch {}
  function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    try {
      onSubmit(manualInput(draft, inputLocale));
    } catch {
      setInvalid(true);
    }
  }
  return (
    <form onSubmit={submit} className="value-form" aria-label={t("append")} noValidate>
      <fieldset disabled={disabled}>
        <legend>{t("append")}</legend>
        <div className="value-input-grid">
          <label>
            {t("amount")}
            <input
              name="amount"
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => change({ amount: e.target.value })}
              maxLength={80}
              aria-describedby="valuation-money-help"
              required
            />
          </label>
          <label>
            {t("currency")}
            <select
              aria-label={t("currency")}
              name="currency"
              value={draft.currency}
              onChange={(e) => change({ currency: e.target.value })}
            >
              {valuationCurrencyCodes.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
        </div>
        <p id="valuation-money-help" className="field-help">
          {t("moneyHelp", { digits: currencyMinorUnitExponent(draft.currency) })}
        </p>
        {preview && <p className="value-preview">{t("preview", { amount: preview })}</p>}
        <label>
          {t("when")}
          <select
            aria-label={t("when")}
            value={draft.earlier ? "earlier" : "now"}
            onChange={(e) => change({ earlier: e.target.value === "earlier" })}
          >
            <option value="now">{t("now")}</option>
            <option value="earlier">{t("earlier")}</option>
          </select>
        </label>
        {draft.earlier && (
          <div className="value-input-grid">
            <label>
              {t("date")}
              <input
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={draft.date}
                onChange={(e) => change({ date: e.target.value })}
                required
              />
            </label>
            <label>
              {t("time")}
              <input
                type="time"
                step="0.001"
                value={draft.time}
                onChange={(e) => change({ time: e.target.value })}
                required
              />
            </label>
          </div>
        )}
        <p className="field-help">{t("utcHelp")}</p>
        <label>
          {t("note")}
          <textarea
            aria-label={t("note")}
            value={draft.note}
            onChange={(e) => change({ note: e.target.value })}
            aria-describedby="valuation-note-count"
            rows={3}
          />
        </label>
        <p className="field-help" id="valuation-note-count">
          {t("noteCount", { count: [...draft.note.trim()].length })}
        </p>
        {invalid && <p role="alert">{t("formError")}</p>}
        <button type="submit">{t(submitting ? "saving" : "save")}</button>
      </fieldset>
    </form>
  );
}
