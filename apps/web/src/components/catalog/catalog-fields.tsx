"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  CatalogText,
  CatalogSource,
  CatalogAttributeDefinition,
  CatalogSnapshot,
} from "@sammlerraum/contracts/catalog";
import { majorUnits, itemCurrencyOptions } from "../items/item-form-values";
import type { Locale } from "./catalog-client";
export function TextFields({ text, locale }: { text?: CatalogText; locale: Locale }) {
  const t = useTranslations("Catalog");
  const sequence = useRef(20);
  const [translations, setTranslations] = useState(
    (text?.translations ?? []).map((row, index) => ({ ...row, key: String(index) })),
  );
  return (
    <fieldset>
      <legend>{t("authoredText")}</legend>
      <label>
        {t("title")}
        <input name="title" defaultValue={text?.title ?? ""} maxLength={300} required />
      </label>
      <label>
        {t("textLanguage")}
        <input
          name="textLanguage"
          defaultValue={text?.language ?? locale}
          maxLength={6}
          pattern="[a-z]{2,3}(-[A-Z]{2})?"
          required
        />
        <span className="field-help">{t("languageHelp")}</span>
      </label>
      <label>
        {t("description")}
        <textarea name="description" maxLength={20000} defaultValue={text?.description ?? ""} />
      </label>
      <details open={translations.length > 0}>
        <summary>{t("translations")}</summary>
        <p className="field-help">{t("translationHelp")}</p>
        <input type="hidden" name="translationCount" value={translations.length} />
        {translations.map((row, index) => (
          <div className="compact-form" key={row.key}>
            <label>
              {t("translationLanguage")}
              <input
                name={`translationLanguage-${index}`}
                value={row.language}
                maxLength={6}
                pattern="[a-z]{2,3}(-[A-Z]{2})?"
                required
                onChange={(event) =>
                  setTranslations((current) =>
                    current.map((value) =>
                      value.key === row.key ? { ...value, language: event.target.value } : value,
                    ),
                  )
                }
              />
            </label>
            <label>
              {t("translatedTitle")}
              <input
                name={`translationTitle-${index}`}
                value={row.title}
                maxLength={300}
                required
                onChange={(event) =>
                  setTranslations((current) =>
                    current.map((value) =>
                      value.key === row.key ? { ...value, title: event.target.value } : value,
                    ),
                  )
                }
              />
            </label>
            <label>
              {t("translatedDescription")}
              <textarea
                name={`translationDescription-${index}`}
                value={row.description}
                maxLength={20000}
                onChange={(event) =>
                  setTranslations((current) =>
                    current.map((value) =>
                      value.key === row.key ? { ...value, description: event.target.value } : value,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setTranslations((current) => current.filter((value) => value.key !== row.key))
              }
            >
              {t("removeTranslation")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary-button"
          disabled={translations.length >= 20}
          onClick={() =>
            setTranslations((current) => [
              ...current,
              { key: String(sequence.current++), language: "", title: "", description: "" },
            ])
          }
        >
          {t("addTranslation")}
        </button>
      </details>
    </fieldset>
  );
}
export function SourceFields({ sources = [] }: { sources?: CatalogSource[] }) {
  const t = useTranslations("Catalog");
  const sequence = useRef(20);
  const [rows, setRows] = useState(sources.map((row, index) => ({ ...row, key: String(index) })));
  return (
    <fieldset>
      <legend>{t("canonicalSources")}</legend>
      <p className="field-help">{t("canonicalSourcesHelp")}</p>
      <input type="hidden" name="sourceCount" value={rows.length} />
      {rows.map((row, index) => (
        <div className="compact-form" key={row.key}>
          {(["url", "note", "license"] as const).map((field) => (
            <label key={field}>
              {t(`source${field}`)}
              <input
                name={`source-${field}-${index}`}
                type={field === "url" ? "url" : "text"}
                maxLength={field === "url" ? 2048 : field === "note" ? 2000 : 500}
                value={row[field] ?? ""}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((value) =>
                      value.key === row.key ? { ...value, [field]: event.target.value } : value,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRows((current) => current.filter((value) => value.key !== row.key))}
          >
            {t("removeSource")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={rows.length >= 20}
        onClick={() => setRows((current) => [...current, { key: String(sequence.current++) }])}
      >
        {t("addSource")}
      </button>
    </fieldset>
  );
}
export function AttributeFields({
  definitions,
  attributes = [],
  locale,
}: {
  definitions: CatalogAttributeDefinition[];
  attributes?: CatalogSnapshot["attributes"];
  locale: Locale;
}) {
  const t = useTranslations("Catalog");
  if (!definitions.length) return null;
  return (
    <fieldset>
      <legend>{t("referenceAttributes")}</legend>
      {definitions.map((field) => {
        const value = attributes.find((row) => row.definitionId === field.id)?.value;
        const name = `attribute-${field.id}`;
        const label = field.labels[locale];
        const primitive =
          typeof value === "string" || typeof value === "number" ? String(value) : "";
        return (
          <div className="compact-form" key={field.id}>
            <label className="checkbox-label">
              <input
                name={`attribute-enabled-${field.id}`}
                type="checkbox"
                defaultChecked={value !== undefined}
              />
              {t("useAttribute")} — {label}
            </label>
            {field.type === "BOOLEAN" ? (
              <label className="checkbox-label">
                <input name={name} type="checkbox" defaultChecked={value === true} />
                {label}
              </label>
            ) : field.type === "LONG_TEXT" ? (
              <label>
                {label}
                <textarea name={name} defaultValue={primitive} maxLength={20000} />
              </label>
            ) : field.type === "SINGLE_SELECT" ? (
              <label>
                {label}
                <select name={name} aria-label={label} defaultValue={primitive}>
                  <option value="">{t("chooseOption")}</option>
                  {field.options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.labels[locale]}
                    </option>
                  ))}
                </select>
              </label>
            ) : field.type === "MULTI_SELECT" ? (
              <fieldset>
                <legend>{label}</legend>
                {field.options.map((option) => (
                  <label className="checkbox-label" key={option.key}>
                    <input
                      name={name}
                      type="checkbox"
                      value={option.key}
                      defaultChecked={Array.isArray(value) && value.includes(option.key)}
                    />
                    {option.labels[locale]}
                  </label>
                ))}
              </fieldset>
            ) : field.type === "MONEY" ? (
              (() => {
                const money =
                  typeof value === "object" && value !== null && !Array.isArray(value)
                    ? (value as { amountMinor: number; currency: string })
                    : null;
                return (
                  <div className="form-row">
                    <label>
                      {label}
                      <input
                        name={`${name}-amount`}
                        inputMode="decimal"
                        defaultValue={money ? majorUnits(money.amountMinor, money.currency) : ""}
                      />
                    </label>
                    <label>
                      {t("currency")}
                      <select name={`${name}-currency`} defaultValue={money?.currency ?? "EUR"}>
                        {itemCurrencyOptions.map((currency) => (
                          <option key={currency}>{currency}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })()
            ) : (
              <label>
                {label}
                <input
                  name={name}
                  type={field.type === "DATE" ? "date" : field.type === "URL" ? "url" : "text"}
                  inputMode={["INTEGER", "DECIMAL"].includes(field.type) ? "decimal" : "text"}
                  defaultValue={primitive}
                  maxLength={20000}
                />
              </label>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
