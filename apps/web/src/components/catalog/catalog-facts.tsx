"use client";
import { useTranslations } from "next-intl";
import type {
  CatalogText,
  CatalogSource,
  CatalogSnapshot,
  CategoryTemplate,
} from "@sammlerraum/contracts/catalog";
import { authoredTitle, type Locale } from "./catalog-client";
import { variantLabel } from "./catalog-search";
import { HistoricalMoneyValueSchema, type MoneyView } from "@sammlerraum/contracts/legacy-money";
import { MoneyReadout } from "../money/legacy-money-editor";
import { catalogMoneyKey } from "./catalog-money-client";
import type { CatalogMoneyPreview } from "./catalog-money-model";
import { displayCatalogMoney } from "./catalog-money";
export function SourceFacts({ sources }: { sources: CatalogSource[] }) {
  const t = useTranslations("Catalog");
  return (
    <ul className="catalog-sources">
      {sources.map((row, index) => (
        <li key={index}>
          {row.note && <p>{row.note}</p>}
          {row.url && (
            <a href={row.url} target="_blank" rel="noopener noreferrer">
              {t("openSource")}
            </a>
          )}
          {row.license && (
            <p>
              {t("license")}: {row.license}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
export function TextFacts({ text, locale }: { text: CatalogText; locale: Locale }) {
  const t = useTranslations("Catalog");
  return (
    <div>
      <h3>{authoredTitle(text, locale)}</h3>
      <p className="field-help">
        {t("authoredLanguage")}: {text.language}
      </p>
      <p className="preserve-lines">
        {text.language === locale
          ? text.description
          : (text.translations.find((row) => row.language === locale)?.description ??
            text.description)}
      </p>
      {text.translations.length > 0 && (
        <details>
          <summary>{t("translations")}</summary>
          <h4>
            {text.language}: {text.title}
          </h4>
          <p className="preserve-lines">{text.description}</p>
          {text.translations.map((row) => (
            <div key={row.language}>
              <h4>
                {row.language}: {row.title}
              </h4>
              <p className="preserve-lines">{row.description}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
export function AttributeFacts({
  attributes,
  category,
  locale,
  money,
  previews,
  target = { kind: "ENTRY" },
  onReview,
}: {
  attributes: Array<{ definitionId: string; value: unknown }>;
  category: CategoryTemplate | null;
  locale: Locale;
  money?: ReadonlyMap<string, MoneyView>;
  previews?: ReadonlyMap<string, CatalogMoneyPreview>;
  target?: Extract<MoneyView["subject"], { family: "CATALOG" }>["target"];
  onReview?: (view: MoneyView) => void;
}) {
  const t = useTranslations("Catalog"),
    m = useTranslations("LegacyMoney");
  return (
    <dl>
      {attributes.map((row) => {
        const definition = category?.definitions.find((field) => field.id === row.definitionId);
        const display = (value: unknown): string => {
          if (typeof value === "boolean") return t(value ? "yes" : "no");
          if (Array.isArray(value)) return value.map(display).join(", ");
          if (
            typeof value === "object" &&
            value !== null &&
            "amountMinor" in value &&
            "currency" in value
          ) {
            const money = value as { amountMinor: number; currency: string };
            try {
              return displayCatalogMoney(money, locale);
            } catch {
              return t("unavailableAttribute");
            }
          }
          return (
            definition?.options.find((option) => option.key === value)?.labels[locale] ??
            String(value ?? "")
          );
        };
        const raw = HistoricalMoneyValueSchema.safeParse(row.value),
          key = catalogMoneyKey(target, row.definitionId);
        const view = money?.get(key),
          preview = previews?.get(row.definitionId),
          label = definition?.labels[locale] ?? t("unavailableAttribute");
        const exactView =
          raw.success &&
          view?.subject.family === "CATALOG" &&
          view.raw?.amountMinor === String(raw.data.amountMinor) &&
          view.raw.currency === raw.data.currency
            ? view
            : null;
        const exactPreview =
          raw.success &&
          preview?.raw.amountMinor === String(raw.data.amountMinor) &&
          preview.raw.currency === raw.data.currency
            ? preview
            : null;
        const amount = raw.success ? (
          exactPreview?.kind === "CAPTURED" ? (
            <div className="money-readout">
              <output aria-label={`${label} · ${m("storedValue")}`}>
                {exactPreview.decimal.replace(".", locale === "de" ? "," : ".")} {raw.data.currency}
              </output>
              <span>
                {m(exactPreview.source === "AUTHORED" ? "capturedProposal" : "retainedProposal")}
              </span>
              {exactPreview.eligibility === "UNIT_UNSUPPORTED" && <small>{m("unsupported")}</small>}
            </div>
          ) : exactView && !exactPreview ? (
            <>
              <MoneyReadout view={exactView} locale={locale} label={label} />
              {onReview && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onReview(exactView)}
                >
                  {m("review")}
                </button>
              )}
            </>
          ) : (
            <div className="money-readout">
              <output aria-label={`${label} · ${m("storedValue")}`}>
                {displayCatalogMoney(raw.data, locale)}
              </output>
              <span>{m("unknown")}</span>
              <small>
                {m(
                  exactPreview?.kind === "RAW" && exactPreview.changed
                    ? "proposalSourceChanged"
                    : "rawValue",
                )}
              </small>
            </div>
          )
        ) : null;
        return (
          <div key={row.definitionId}>
            <dt>{definition?.labels[locale] ?? t("unavailableAttribute")}</dt>
            <dd>{amount ?? display(row.value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
export function CatalogFacts({
  state,
  category,
  locale,
  money,
  previews,
  onReview,
}: {
  state: CatalogSnapshot;
  category: CategoryTemplate | null;
  locale: Locale;
  money?: ReadonlyMap<string, MoneyView>;
  previews?: ReadonlyMap<string, CatalogMoneyPreview>;
  onReview?: (view: MoneyView) => void;
}) {
  const t = useTranslations("Catalog");
  function scopedPreviews(
    target: Extract<MoneyView["subject"], { family: "CATALOG" }>["target"],
    attributes: { definitionId: string }[],
  ) {
    const values = new Map<string, CatalogMoneyPreview>();
    if (previews)
      for (const row of attributes) {
        const value = previews.get(catalogMoneyKey(target, row.definitionId));
        if (value) values.set(row.definitionId, value);
      }
    return values;
  }
  return (
    <div className="catalog-facts">
      <TextFacts text={state.text} locale={locale} />
      <AttributeFacts
        attributes={state.attributes}
        category={category}
        locale={locale}
        {...(money ? { money } : {})}
        {...(previews ? { previews: scopedPreviews({ kind: "ENTRY" }, state.attributes) } : {})}
        {...(onReview ? { onReview } : {})}
      />
      <h3>{t("canonicalSources")}</h3>
      <SourceFacts sources={state.sources} />
      <h3>{t("variants")}</h3>
      {state.variants.length ? (
        <ul className="catalog-variants">
          {state.variants.map((row) => (
            <li key={row.id}>
              <h4>{variantLabel(row, locale)}</h4>
              <TextFacts text={row.text} locale={locale} />
              <AttributeFacts
                attributes={row.attributes}
                category={category}
                locale={locale}
                target={{ kind: "VARIANT", variantId: row.id }}
                {...(money ? { money } : {})}
                {...(previews
                  ? {
                      previews: scopedPreviews(
                        { kind: "VARIANT", variantId: row.id },
                        row.attributes,
                      ),
                    }
                  : {})}
                {...(onReview ? { onReview } : {})}
              />
              <SourceFacts sources={row.sources} />
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noVariants")}</p>
      )}
      <h3>{t("references")}</h3>
      {state.identifiers.length ? (
        <ul>
          {state.identifiers.map((row) => (
            <li key={row.id}>
              {row.namespace} · {row.type} · {row.value}
              {row.variantId && (
                <p>
                  {state.variants.find((variant) => variant.id === row.variantId)
                    ? variantLabel(
                        state.variants.find((variant) => variant.id === row.variantId)!,
                        locale,
                      )
                    : t("retained")}
                </p>
              )}
              <SourceFacts sources={row.sources} />
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noReferences")}</p>
      )}
    </div>
  );
}
