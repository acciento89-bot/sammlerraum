"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { CatalogEntryRevision, CategoryTemplate } from "@sammlerraum/contracts/catalog";
import {
  SubmitCatalogProposalInputSchema,
  SubmitCatalogMoneyProposalInputSchema,
  type CatalogProposalOperation,
} from "@sammlerraum/contracts/catalog-proposals";
import type { MoneyView } from "@sammlerraum/contracts/legacy-money";
import type { MoneyCapabilities } from "@sammlerraum/contracts/money-capabilities";
import { LegacyMoneyEditor } from "../money/legacy-money-editor";
import {
  initialMoneyDraft,
  rememberMoneyDraft,
  recallMoneyDraft,
  forgetMoneyDraft,
  clearMoneyDrafts,
  MoneyDraftError,
  type MoneyDraft,
} from "../money/legacy-money-draft";
import {
  loadMoneyCapabilities,
  requireMoneyAuthoring,
  MoneyClientError,
} from "../money/legacy-money-client";
import { useCollectorConfirmation } from "../search/use-saved-confirmation";
import {
  readCanonicalMoney,
  catalogMoneyKey,
  submitCanonicalMoneyProposal,
} from "./catalog-money-client";
import { buildCatalogMoneyFields, type CatalogMoneyContext } from "./catalog-money-model";
import {
  recallCatalogMoneySession,
  rememberCatalogMoneySession,
  forgetCatalogMoneySession,
  type CatalogMoneySession,
} from "./catalog-money-session";
import { CategoryPicker } from "./category-picker";
import { TextFields, SourceFields, AttributeFields } from "./catalog-fields";
import { readText, readSources, readAttributes } from "./catalog-form-values";
import { variantLabel } from "./catalog-search";
import { catalogRequest, catalogError, type Locale } from "./catalog-client";
type Kind = CatalogProposalOperation["kind"];
export function ProposalComposer({
  locale,
  actor,
  entry,
  initialKind = "CREATE_ENTRY",
  onSubmitted,
  onCancel,
}: {
  locale: Locale;
  actor: string;
  entry?: CatalogEntryRevision;
  initialKind?: Kind;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Catalog"),
    m = useTranslations("LegacyMoney");
  const scope = entry?.state.id ?? "new";
  const [cached] = useState(() => recallCatalogMoneySession(actor, scope));
  const baseRevision = cached ? cached.baseRevision : (entry?.revision ?? null);
  const [kind, setKind] = useState<Kind>(cached?.kind ?? initialKind);
  const [category, setCategory] = useState(
    cached?.categoryId || entry?.state.categoryTemplateId || "",
  );
  const [template, setTemplate] = useState<CategoryTemplate | null>(null);
  const [variantId, setVariantId] = useState(
    cached?.variantId || entry?.state.variants[0]?.id || "",
  );
  const [identifierId, setIdentifierId] = useState(
    cached?.identifierId || entry?.state.identifiers[0]?.id || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(cached?.summary ?? "");
  const [outcome, setOutcome] = useState<CatalogMoneySession["outcome"]>(
    cached?.outcome ?? "READY",
  );
  const [proposalId, setProposalId] = useState(cached?.proposalId ?? "");
  const [caps, setCaps] = useState<MoneyCapabilities>();
  const [actorExpired, setActorExpired] = useState(false);
  const [moneyProblem, setMoneyProblem] = useState("");
  const [moneyMap, setMoneyMap] = useState(new Map<string, MoneyView>());
  const [moneyReady, setMoneyReady] = useState(false),
    [moneyRetry, setMoneyRetry] = useState(0);
  const [moneyDrafts, setMoneyDrafts] = useState<Record<string, MoneyDraft>>({});
  const pendingNavigation = useCollectorConfirmation(busy, () => false);
  const session = (nextOutcome = outcome, nextId = proposalId): CatalogMoneySession => ({
    kind,
    categoryId: category,
    variantId,
    identifierId,
    baseRevision,
    summary,
    outcome: nextOutcome,
    proposalId: nextId,
  });
  useEffect(() => {
    rememberCatalogMoneySession(actor, scope, session());
  }, [
    actor,
    scope,
    kind,
    category,
    variantId,
    identifierId,
    baseRevision,
    summary,
    outcome,
    proposalId,
  ]);
  useEffect(() => {
    let cancelled = false;
    setMoneyReady(false);
    void (async () => {
      try {
        const actual = await loadMoneyCapabilities();
        if (actual.actorId !== actor) {
          clearMoneyDrafts();
          if (!cancelled) setActorExpired(true);
          return;
        }
        if (entry && baseRevision !== entry.revision) throw new MoneyClientError("CONFLICT");
        const map = entry
          ? await readCanonicalMoney(entry.state, entry.revision)
          : new Map<string, MoneyView>();
        if (!cancelled) {
          setCaps(actual);
          setMoneyMap(map);
          setMoneyReady(true);
          setMoneyProblem("");
        }
      } catch (problem) {
        if (!cancelled)
          setMoneyProblem(
            problem instanceof MoneyClientError && problem.code === "CONFLICT"
              ? m("conflict")
              : m("readFailed"),
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actor, entry, baseRevision, moneyRetry, m]);
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
  const moneyTarget =
    kind === "ADD_VARIANT" || kind === "UPDATE_VARIANT" ? "OPERATION_VARIANT" : "ENTRY";
  const context: CatalogMoneyContext | null =
    entry && (kind === "UPDATE_ENTRY" || kind === "UPDATE_VARIANT")
      ? {
          entryId: entry.state.id,
          revision: entry.revision,
          target: kind === "UPDATE_VARIANT" ? { kind: "VARIANT", variantId } : { kind: "ENTRY" },
        }
      : null;
  const draftKey = (definitionId: string) =>
    `catalog:${scope}:${baseRevision ?? "new"}:${kind}:${category}:${kind === "UPDATE_VARIANT" ? variantId : "ENTRY"}:${definitionId}`;
  const selectedViews = new Map<string, MoneyView>();
  if (context)
    for (const field of template?.definitions.filter((field) => field.type === "MONEY") ?? []) {
      const view = moneyMap.get(catalogMoneyKey(context.target, field.id));
      if (view) selectedViews.set(field.id, view);
    }
  const moneyDefinitions = isIdentifier
    ? []
    : (template?.definitions.filter((field) => field.type === "MONEY") ?? []);
  useEffect(() => {
    if (!moneyReady || !template) return;
    const drafts: Record<string, MoneyDraft> = {};
    const target =
      kind === "UPDATE_VARIANT"
        ? { kind: "VARIANT" as const, variantId }
        : { kind: "ENTRY" as const };
    const existing = kind === "UPDATE_ENTRY" || kind === "UPDATE_VARIANT";
    for (const field of template.definitions.filter((field) => field.type === "MONEY")) {
      const view = existing ? moneyMap.get(catalogMoneyKey(target, field.id)) : null;
      drafts[field.id] =
        recallMoneyDraft(actor, draftKey(field.id)) ?? initialMoneyDraft(view ?? null);
    }
    setMoneyDrafts(drafts);
  }, [actor, scope, baseRevision, kind, category, variantId, template, moneyMap, moneyReady]);
  const draftsReady =
    moneyReady && moneyDefinitions.every((field) => Boolean(moneyDrafts[field.id]));
  function changeMoney(definitionId: string, draft: MoneyDraft) {
    setMoneyDrafts((current) => ({ ...current, [definitionId]: draft }));
    rememberMoneyDraft(actor, draftKey(definitionId), draft);
  }
  function moneyError(problem: unknown) {
    if (problem instanceof MoneyDraftError)
      return m(
        problem.code === "MONEY_REPLACEMENT_ACK_REQUIRED"
          ? "confirmRequired"
          : problem.code === "MONEY_CORRECTION_REASON_REQUIRED"
            ? "proposalSummaryReason"
            : problem.code === "MONEY_DRAFT_NOT_LOADED"
              ? "readFailed"
              : "invalid",
      );
    if (problem instanceof MoneyClientError)
      return m(
        problem.code === "CONFLICT"
          ? "conflict"
          : problem.code === "OUTCOME_UNKNOWN"
            ? "unknownOutcome"
            : problem.code === "ACKNOWLEDGED_UNREADABLE"
              ? "ackUnreadable"
              : problem.code === "CAPABILITY_UNAVAILABLE"
                ? "disabled"
                : problem.code === "READ_FAILED"
                  ? "readFailed"
                  : "refused",
      );
    return catalogError(problem, t);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !draftsReady || outcome !== "READY" || !caps?.authoringProfiles.length)
      return;
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const actual = await loadMoneyCapabilities();
      if (actual.actorId !== actor) {
        clearMoneyDrafts();
        setActorExpired(true);
        return;
      }
      setCaps(actual);
      requireMoneyAuthoring(actual);
      const money = buildCatalogMoneyFields(
        context,
        moneyTarget,
        moneyDefinitions,
        attributes ?? [],
        selectedViews,
        moneyDrafts,
        summary,
      );
      let patch: CatalogProposalOperation;
      const common = () => ({
        text: readText(form),
        sources: readSources(form),
        attributes: [
          ...readAttributes(
            form,
            template?.definitions.filter((field) => field.type !== "MONEY") ?? [],
          ),
          ...money.attributes,
        ],
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
        baseRevision,
        patch,
        summary: String(form.get("summary")),
        ...(evidenceUrl ? { source: { url: evidenceUrl } } : {}),
      };
      const parsed = SubmitCatalogProposalInputSchema.safeParse(input);
      if (!parsed.success) {
        setError(t("errors.VALIDATION_ERROR"));
        return;
      }
      const request = SubmitCatalogMoneyProposalInputSchema.parse({
        proposal: parsed.data,
        money: { schemaVersion: 1, intents: money.intents },
      });
      rememberCatalogMoneySession(actor, scope, session("UNKNOWN"));
      const receipt = await submitCanonicalMoneyProposal(request, actual);
      setOutcome("SAVED");
      setProposalId(receipt.id);
      rememberCatalogMoneySession(actor, scope, session("SAVED", receipt.id));
      for (const field of moneyDefinitions) forgetMoneyDraft(actor, draftKey(field.id));
      pendingNavigation.navigateAfterGuard(() => {
        forgetCatalogMoneySession(actor, scope);
        onSubmitted();
      });
    } catch (problem) {
      const next =
        problem instanceof MoneyClientError && problem.code === "OUTCOME_UNKNOWN"
          ? "UNKNOWN"
          : problem instanceof MoneyClientError && problem.code === "ACKNOWLEDGED_UNREADABLE"
            ? "ACKNOWLEDGED_UNREADABLE"
            : problem instanceof MoneyClientError && problem.code === "CONFLICT"
              ? "CONFLICT"
              : "READY";
      setOutcome(next);
      rememberCatalogMoneySession(actor, scope, session(next));
      setError(moneyError(problem));
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
  if (actorExpired)
    return (
      <p role="alert" className="error">
        {m("sessionChanged")}
      </p>
    );
  return (
    <form
      className="management-card catalog-proposal"
      aria-label={t("proposalForm")}
      onSubmit={(event) => void submit(event)}
    >
      {pendingNavigation.node}
      <h2>{t("proposalForm")}</h2>
      {moneyProblem && (
        <p role="alert" className="error">
          {moneyProblem}
        </p>
      )}
      {moneyReady && !caps?.authoringProfiles.length && (
        <p role="status" className="notice">
          {m("disabled")}
        </p>
      )}
      {!moneyReady && (
        <button type="button" disabled={busy} onClick={() => setMoneyRetry((value) => value + 1)}>
          {m("checkCurrent")}
        </button>
      )}
      {outcome !== "READY" && (
        <p className="notice">
          {m(
            outcome === "CONFLICT"
              ? "conflict"
              : outcome === "SAVED"
                ? "savedSeparately"
                : outcome === "ACKNOWLEDGED_UNREADABLE"
                  ? "ackUnreadable"
                  : "unknownOutcome",
          )}{" "}
          <a href={`/${locale}/catalog/proposals`}>{t("myProposals")}</a>
        </p>
      )}
      <p className="field-help">{t("proposalHelp")}</p>
      {entry && (
        <p>
          {t("baseRevision")} {entry.revision}
        </p>
      )}
      <fieldset disabled={busy || outcome !== "READY"}>
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
              definitions={template.definitions.filter((field) => field.type !== "MONEY")}
              attributes={attributes ?? []}
              locale={locale}
            />
          )}
        </div>
        {moneyDefinitions.map((field) => (
          <LegacyMoneyEditor
            key={field.id}
            label={field.labels[locale]}
            name={`catalog-money-${field.id}`}
            locale={locale}
            view={selectedViews.get(field.id) ?? null}
            existing={Boolean(attributes?.some((row) => row.definitionId === field.id))}
            draft={moneyDrafts[field.id] ?? initialMoneyDraft(null)}
            onChange={(draft) => changeMoney(field.id, draft)}
            loaded={draftsReady}
            disabled={busy || !caps?.authoringProfiles.length || outcome !== "READY"}
            correctionReasonFromSummary
          />
        ))}
        <label>
          {t("changeSummary")}
          <textarea
            name="summary"
            required
            maxLength={500}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
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
            !draftsReady ||
            !caps?.authoringProfiles.length ||
            outcome !== "READY" ||
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
