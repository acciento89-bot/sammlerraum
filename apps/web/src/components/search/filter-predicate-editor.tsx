"use client";
import { useMoneyConsumers } from "./money-consumer-context";
import { CURRENCY_AUTHORITY_VERSION } from "@sammlerraum/domain/money/currencies";
import { fromUtcControl, toUtcControl } from "./predicate-input";
import { SearchLabel } from "./search-label";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  valuationCurrencyCodes,
  currencyMinorUnitExponent,
} from "@sammlerraum/domain/money/currencies";
import { parseLocalizedMoney, parseLocalizedMoneyAtScale } from "@sammlerraum/domain/money/money";
import { defaultTest, supportedLegacyQueryUnit, type TestDraft } from "./filter-draft";
export type ValueChoice = { value: string; label: string };
function scalar(value: string, type: string): string | number {
  return type === "INTEGER" && /^[+-]?\d+$/u.test(value) ? Number(value) : value;
}
export function PredicateEditor({
  test,
  onChange,
  ops,
  type = "TEXT",
  choices,
  customChoices = false,
  locale = "en",
}: {
  test: TestDraft;
  onChange: (test: TestDraft) => void;
  ops: string[];
  type?: string;
  choices?: ValueChoice[] | undefined;
  customChoices?: boolean;
  locale?: "de" | "en";
}) {
  const t = useTranslations("Search");
  const canonicalMoneyEnabled = useMoneyConsumers();
  const multi = ["in", "hasAny", "hasAll"].includes(test.op);
  const presence = ["present", "missing"].includes(test.op);
  const valueInput = (label: string, value: unknown, change: (value: string | number) => void) => (
    <SearchLabel>
      {label}
      <input
        type={type === "DATE" ? "date" : type === "INSTANT" ? "datetime-local" : "text"}
        step={type === "INSTANT" ? "0.001" : undefined}
        inputMode={type === "INTEGER" ? "numeric" : type === "DECIMAL" ? "decimal" : undefined}
        value={
          type === "INSTANT" && typeof value === "string"
            ? toUtcControl(value)
            : typeof value === "string" || typeof value === "number"
              ? value
              : ""
        }
        onChange={(e) =>
          change(type === "INSTANT" ? fromUtcControl(e.target.value) : scalar(e.target.value, type))
        }
      />
    </SearchLabel>
  );
  return (
    <>
      <SearchLabel>
        {t("operator")}
        <select value={test.op} onChange={(e) => onChange(defaultTest(e.target.value, type))}>
          {!ops.includes(test.op) && (
            <option value={test.op} disabled>
              {t("unsupportedOperator")}
            </option>
          )}
          {type === "MONEY" && test.op !== "range" && !ops.includes("range") && (
            <option value="range" disabled>
              {t("operators.range")} · {t("notAvailable")}
            </option>
          )}
          {ops.map((op) => (
            <option key={op} value={op}>
              {t(`operators.${op}`)}
            </option>
          ))}
        </select>
      </SearchLabel>
      {type === "INSTANT" && <p className="field-help">{t("utcHelp")}</p>}
      {type === "DATE" && <p className="field-help">{t("dateHelp")}</p>}
      {test.op === "range" &&
        (canonicalMoneyEnabled && supportedLegacyQueryUnit(test.unit) ? (
          <MoneyRange
            key={`${test.unit?.currency}:${test.unit?.minorUnitExponent}:${locale}`}
            test={test}
            onChange={onChange}
            locale={locale}
            legacy
          />
        ) : (
          <RetainedRange test={test} />
        ))}
      {!presence &&
        test.op !== "range" &&
        (multi ? (
          type === "DATE" || type === "INSTANT" ? (
            <fieldset className="search-reference">
              <legend>{t("dateValues")}</legend>
              {(test.values ?? []).map((entry, index) => (
                <div key={index}>
                  {valueInput(`${t("value")} ${index + 1}`, entry, (value) =>
                    onChange({
                      ...test,
                      values: (test.values ?? []).map((old, at) => (at === index ? value : old)),
                    }),
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      onChange({
                        ...test,
                        values: test.values?.filter((_, at) => at !== index) ?? [],
                      })
                    }
                  >
                    {t("removeSelection", { number: index + 1 })}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary-button"
                onClick={() => onChange({ ...test, values: [...(test.values ?? []), ""] })}
              >
                {t("addValue")}
              </button>
            </fieldset>
          ) : choices && !customChoices ? (
            <SearchLabel>
              {t("values")}
              <select
                multiple
                value={(test.values ?? []).map(String)}
                onChange={(e) =>
                  onChange({
                    ...test,
                    values: Array.from(e.target.selectedOptions, (o) => o.value),
                  })
                }
              >
                {(test.values ?? [])
                  .filter((value) => !choices.some((c) => c.value === value))
                  .map((value) => (
                    <option key={String(value)} value={String(value)}>
                      {t("retainedValue", { value: String(value) })}
                    </option>
                  ))}
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </SearchLabel>
          ) : (
            <SearchLabel>
              {t("values")}
              <textarea
                rows={3}
                value={(test.values ?? []).join("\n")}
                onChange={(e) =>
                  onChange({
                    ...test,
                    values:
                      e.target.value === ""
                        ? []
                        : e.target.value.split("\n").map((v) => scalar(v, type)),
                  })
                }
              />
            </SearchLabel>
          )
        ) : test.op === "between" ? (
          <>
            {valueInput(t("minimum"), test.min, (min) => onChange({ ...test, min }))}
            {valueInput(t("maximum"), test.max, (max) => onChange({ ...test, max }))}
          </>
        ) : type === "BOOLEAN" ? (
          <SearchLabel>
            {t("value")}
            <select
              value={String(test.value)}
              onChange={(e) => onChange({ ...test, value: e.target.value === "true" })}
            >
              <option value="false">{t("false")}</option>
              <option value="true">{t("true")}</option>
            </select>
          </SearchLabel>
        ) : choices && !customChoices ? (
          <SearchLabel>
            {t("value")}
            <select
              value={typeof test.value === "string" ? test.value : ""}
              onChange={(e) => onChange({ ...test, value: e.target.value })}
            >
              <option value="">{t("choose")}</option>
              {typeof test.value === "string" &&
                test.value &&
                !choices.some((c) => c.value === test.value) && (
                  <option value={test.value}>{t("retainedValue", { value: test.value })}</option>
                )}
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </SearchLabel>
        ) : (
          valueInput(t("value"), test.value, (value) => onChange({ ...test, value }))
        ))}
      {customChoices && choices && choices.length > 0 && (
        <details>
          <summary>{t("suggestions")}</summary>
          <ul>
            {choices.map((c) => (
              <li key={c.value}>{c.label}</li>
            ))}
          </ul>
          <p>{t("customIdentityHelp")}</p>
        </details>
      )}
    </>
  );
}
function amountText(minor: string | undefined, exponent: number, locale: "de" | "en") {
  if (minor === undefined) return "";
  if (!/^\d+$/u.test(minor)) return minor;
  const padded = minor.padStart(exponent + 1, "0");
  return exponent
    ? padded.slice(0, -exponent) + (locale === "de" ? "," : ".") + padded.slice(-exponent)
    : padded;
}
export function MoneyRange({
  test,
  onChange,
  locale,
  legacy = false,
}: {
  test: TestDraft;
  onChange: (test: TestDraft) => void;
  locale: "de" | "en";
  legacy?: boolean;
}) {
  const t = useTranslations("Search");
  const currency = test.unit?.currency ?? "EUR";
  const exponent = test.unit?.minorUnitExponent ?? 2;
  const [raw, setRaw] = useState({
    min: amountText(test.minMinor, exponent, locale),
    max: amountText(test.maxMinor, exponent, locale),
  });
  function update(kind: "min" | "max", value: string) {
    setRaw({ ...raw, [kind]: value });
    const next = { ...test };
    const field = kind === "min" ? "minMinor" : "maxMinor";
    if (value === "") delete next[field];
    else {
      try {
        next[field] = (
          legacy
            ? parseLocalizedMoneyAtScale(value, locale, currency, exponent)
            : parseLocalizedMoney(value, locale, currency)
        ).amountMinor.toString();
      } catch {
        next[field] = `invalid:${value}`;
      }
    }
    onChange(next);
  }
  return (
    <>
      <p>{t(legacy ? "canonicalRangeHelp" : "moneyHelp")}</p>
      <SearchLabel>
        {t("currency")}
        <select
          value={currency}
          onChange={(e) => {
            const nextCurrency = e.target.value;
            const nextExponent = currencyMinorUnitExponent(nextCurrency);
            setRaw({ min: "", max: "" });
            onChange({
              op: "range",
              unit: {
                currency: nextCurrency,
                minorUnitExponent: nextExponent,
                ...(legacy ? { unitKey: `${CURRENCY_AUTHORITY_VERSION}:${nextCurrency}` } : {}),
              },
            });
          }}
        >
          {valuationCurrencyCodes.map((code) => (
            <option key={code} value={code}>
              {code} · {currencyMinorUnitExponent(code)}
            </option>
          ))}
        </select>
      </SearchLabel>
      <p>{t("exponent", { value: exponent })}</p>
      <SearchLabel>
        {t("minimum")}
        <input
          inputMode="decimal"
          value={raw.min}
          onChange={(e) => update("min", e.target.value)}
        />
      </SearchLabel>
      <SearchLabel>
        {t("maximum")}
        <input
          inputMode="decimal"
          value={raw.max}
          onChange={(e) => update("max", e.target.value)}
        />
      </SearchLabel>
    </>
  );
}

export function RetainedRange({ test }: { test: TestDraft }) {
  const t = useTranslations("Search");
  return (
    <fieldset>
      <legend>{t("retainedRange")}</legend>
      {test.unit && (
        <>
          <SearchLabel>
            {t("currency")}
            <input readOnly value={test.unit.currency} />
          </SearchLabel>
          <SearchLabel>
            {t("exponent", { value: test.unit.minorUnitExponent })}
            <input readOnly value={test.unit.minorUnitExponent} />
          </SearchLabel>
          {test.unit.unitKey && (
            <SearchLabel>
              {t("unitKey")}
              <input readOnly value={test.unit.unitKey} />
            </SearchLabel>
          )}
        </>
      )}
      {test.minMinor !== undefined && (
        <SearchLabel>
          {t("minimumMinor")}
          <input readOnly value={test.minMinor} />
        </SearchLabel>
      )}
      {test.maxMinor !== undefined && (
        <SearchLabel>
          {t("maximumMinor")}
          <input readOnly value={test.maxMinor} />
        </SearchLabel>
      )}
    </fieldset>
  );
}
