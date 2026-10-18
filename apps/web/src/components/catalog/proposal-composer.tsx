"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { CatalogEntryRevision, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import {
  SubmitCatalogProposalInputSchema,
  type CatalogProposalOperation,
} from "@sammlerraum/contracts/catalog-proposals";
import { CategoryPicker } from "./category-picker";
import { TextFields, SourceFields, AttributeFields } from "./catalog-fields";
import { readText, readSources, readAttributes } from "./catalog-form-values";
import { variantLabel } from "./catalog-search";
import { catalogRequest, catalogError, type Locale } from "./catalog-client";
type Kind = CatalogProposalOperation["kind"];
export function ProposalComposer({
  locale,
  entry,
  initialKind = "CREATE_ENTRY",
  onSubmitted,
  onCancel,
}: {
  locale: Locale;
  entry?: CatalogEntryRevision;
  initialKind?: Kind;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Catalog");
  const [kind, setKind] = useState<Kind>(initialKind);
  const [category, setCategory] = useState(entry?.state.categoryTemplateId ?? "");
  const [template, setTemplate] = useState<CategoryTemplate | null>(null);
  const [variantId, setVariantId] = useState(entry?.state.variants[0]?.id ?? "");
  const [identifierId, setIdentifierId] = useState(entry?.state.identifiers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    setTemplate(null);
    if (!category) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void catalogRequest<{ category: CategoryTemplate }>(
      `/api/v1/categories/${category}`,
      "GET",
      undefined,
      control.signal,
    )
      .then((body) => {
        if (!control.signal.aborted) {
          setTemplate(body.category);
          setError("");
        }
      })
      .catch((problem) => {
        if (!control.signal.aborted) setError(catalogError(problem, t));
      })
      .finally(() => {
        if (!control.signal.aborted) setLoading(false);
      });
    return () => control.abort();
  }, [category, t]);
  const variant = entry?.state.variants.find((row) => row.id === variantId);
  const identifier = entry?.state.identifiers.find((row) => row.id === identifierId);
  const isVariant = kind === "ADD_VARIANT" || kind === "UPDATE_VARIANT";
  const isIdentifier = kind.includes("IDENTIFIER");
  const text =
    kind === "UPDATE_ENTRY"
      ? entry?.state.text
      : kind === "UPDATE_VARIANT"
        ? variant?.text
        : undefined;
  const sources =
    kind === "UPDATE_ENTRY"
      ? entry?.state.sources
      : kind === "UPDATE_VARIANT"
        ? variant?.sources
        : kind === "UPDATE_IDENTIFIER"
          ? identifier?.sources
          : undefined;
  const attributes =
    kind === "UPDATE_ENTRY"
      ? entry?.state.attributes
      : kind === "UPDATE_VARIANT"
        ? variant?.attributes
        : [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      let patch: CatalogProposalOperation;
      const common = () => ({
        text: readText(form),
        sources: readSources(form),
        attributes: readAttributes(form, template?.definitions ?? []),
      });
      const optional = (name: string) => {
        const value = String(form.get(name) ?? "").trim();
        return value || undefined;
      };
      if (kind === "CREATE_ENTRY")
        patch = { kind, input: { categoryTemplateId: category, ...common() } };
      else if (kind === "UPDATE_ENTRY") patch = { kind, input: common() };
      else if (kind === "ADD_VARIANT" || kind === "UPDATE_VARIANT") {
        const input = {
          ...common(),
          ...(optional("variantLanguage") ? { language: optional("variantLanguage")! } : {}),
          ...(optional("edition") ? { edition: optional("edition")! } : {}),
          ...(optional("reference") ? { reference: optional("reference")! } : {}),
        };
        patch = kind === "ADD_VARIANT" ? { kind, input } : { kind, variantId, input };
      } else if (kind === "REMOVE_IDENTIFIER") patch = { kind, identifierId };
      else {
        const input = {
          namespace: String(form.get("namespace")),
          type: String(form.get("referenceType")),
          value: String(form.get("referenceValue")),
          sources: readSources(form),
          ...(optional("referenceVariant") ? { variantId: optional("referenceVariant")! } : {}),
        };
        patch = kind === "ADD_IDENTIFIER" ? { kind, input } : { kind, identifierId, input };
      }
      const evidenceUrl = optional("evidenceUrl");
      const input = {
        targetEntryId: entry?.state.id ?? null,
        baseRevision: entry?.revision ?? null,
        patch,
        summary: String(form.get("summary")),
        ...(evidenceUrl ? { source: { url: evidenceUrl } } : {}),
      };
      const parsed = SubmitCatalogProposalInputSchema.safeParse(input);
      if (!parsed.success) {
        setError(t("errors.VALIDATION_ERROR"));
        return;
      }
      await catalogRequest("/api/v1/catalog/proposals", "POST", parsed.data);
      onSubmitted();
    } catch (problem) {
      setError(catalogError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  const kinds: Kind[] = entry
    ? [
        "UPDATE_ENTRY",
        "ADD_VARIANT",
        "UPDATE_VARIANT",
        "ADD_IDENTIFIER",
        "UPDATE_IDENTIFIER",
        "REMOVE_IDENTIFIER",
      ]
    : ["CREATE_ENTRY"];
  return (
    <form
      className="management-card catalog-proposal"
      aria-label={t("proposalForm")}
      onSubmit={(event) => void submit(event)}
    >
      <h2>{t("proposalForm")}</h2>
      <p className="field-help">{t("proposalHelp")}</p>
      {entry && (
        <p>
          {t("baseRevision")} {entry.revision}
        </p>
      )}
      <fieldset disabled={busy}>
        <label>
          {t("proposalKind")}
          <select
            aria-label={t("proposalKind")}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as Kind);
              setError("");
            }}
          >
            {kinds.map((value) => (
              <option key={value} value={value}>
                {t(`operations.${value}`)}
              </option>
            ))}
          </select>
        </label>
        {!entry && <CategoryPicker locale={locale} value={category} onChange={setCategory} />}
        <div key={`${kind}-${variantId}-${identifierId}`} className="details-fields">
          {kind === "UPDATE_VARIANT" && (
            <label>
              {t("variantToEdit")}
              <select
                aria-label={t("variantToEdit")}
                value={variantId}
                onChange={(event) => setVariantId(event.target.value)}
                required
              >
                <option value="">{t("chooseOption")}</option>
                {entry?.state.variants.map((row) => (
                  <option key={row.id} value={row.id}>
                    {variantLabel(row, locale)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(kind === "UPDATE_IDENTIFIER" || kind === "REMOVE_IDENTIFIER") && (
            <label>
              {t("referenceToEdit")}
              <select
                aria-label={t("referenceToEdit")}
                value={identifierId}
                onChange={(event) => setIdentifierId(event.target.value)}
                required
              >
                <option value="">{t("chooseOption")}</option>
                {entry?.state.identifiers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.namespace} · {row.type} · {row.value}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isIdentifier && <TextFields {...(text ? { text } : {})} locale={locale} />}{" "}
          {isVariant && (
            <fieldset>
              <legend>{t("variantDetails")}</legend>
              <label>
                {t("variantLanguage")}
                <input
                  name="variantLanguage"
                  pattern="[a-z]{2,3}(-[A-Z]{2})?"
                  maxLength={6}
                  defaultValue={kind === "UPDATE_VARIANT" ? (variant?.language ?? "") : ""}
                />
              </label>
              <label>
                {t("edition")}
                <input
                  name="edition"
                  maxLength={200}
                  defaultValue={kind === "UPDATE_VARIANT" ? (variant?.edition ?? "") : ""}
                />
              </label>
              <label>
                {t("reference")}
                <input
                  name="reference"
                  maxLength={200}
                  defaultValue={kind === "UPDATE_VARIANT" ? (variant?.reference ?? "") : ""}
                />
              </label>
            </fieldset>
          )}
          {isIdentifier && kind !== "REMOVE_IDENTIFIER" && (
            <fieldset>
              <legend>{t("referenceDetails")}</legend>
              <label>
                {t("namespace")}
                <input
                  name="namespace"
                  maxLength={64}
                  pattern="[a-z][a-z0-9_]*"
                  required
                  defaultValue={kind === "UPDATE_IDENTIFIER" ? (identifier?.namespace ?? "") : ""}
                />
                <span className="field-help">{t("referenceKeyHelp")}</span>
              </label>
              <label>
                {t("referenceType")}
                <input
                  name="referenceType"
                  maxLength={64}
                  pattern="[a-z][a-z0-9_]*"
                  required
                  defaultValue={kind === "UPDATE_IDENTIFIER" ? (identifier?.type ?? "") : ""}
                />
              </label>
              <label>
                {t("referenceValue")}
                <input
                  name="referenceValue"
                  maxLength={500}
                  required
                  defaultValue={kind === "UPDATE_IDENTIFIER" ? (identifier?.value ?? "") : ""}
                />
              </label>
              <label>
                {t("referenceScope")}
                <select
                  name="referenceVariant"
                  aria-label={t("referenceScope")}
                  defaultValue={kind === "UPDATE_IDENTIFIER" ? (identifier?.variantId ?? "") : ""}
                >
                  <option value="">{t("entryOnly")}</option>
                  {entry?.state.variants.map((row) => (
                    <option key={row.id} value={row.id}>
                      {variantLabel(row, locale)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}
          {kind !== "REMOVE_IDENTIFIER" && <SourceFields {...(sources ? { sources } : {})} />}{" "}
          {!isIdentifier && template && (
            <AttributeFields
              key={category}
              definitions={template.definitions}
              attributes={attributes ?? []}
              locale={locale}
            />
          )}
        </div>
        <label>
          {t("changeSummary")}
          <textarea name="summary" required maxLength={500} />
        </label>
        <label>
          {t("evidenceUrl")}
          <input name="evidenceUrl" type="url" maxLength={2048} />
          <span className="field-help">{t("evidenceHelp")}</span>
        </label>
      </fieldset>
      <div className="form-actions">
        <button
          type="submit"
          disabled={
            busy ||
            loading ||
            !template ||
            (kind === "UPDATE_VARIANT" && !variantId) ||
            ((kind === "UPDATE_IDENTIFIER" || kind === "REMOVE_IDENTIFIER") && !identifierId)
          }
        >
          {t("submitProposal")}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
      {loading && <p role="status">{t("loading")}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
