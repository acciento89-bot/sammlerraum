"use client";
import type { ScopedSearchCapabilities } from "@sammlerraum/contracts/scoped-search";
import { MarketFilterEditor } from "./market-filter-editor";
import { newScopedLeaf } from "./scoped-capabilities";
import { useMoneyConsumers } from "./money-consumer-context";
import { SearchLabel } from "./search-label";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DocumentCategorySchema } from "@sammlerraum/contracts/media";
import {
  CustomReferencesSchema,
  CatalogDefinitionReferenceSchema,
} from "@sammlerraum/contracts/search-references";
import { PredicateEditor, MoneyRange, type ValueChoice } from "./filter-predicate-editor";
import { ReferencePicker } from "./reference-picker";
import { MetadataCache, RequestChannel } from "./search-state";
import { searchRequest } from "./search-client";
import {
  defaultTest,
  families,
  newLeaf,
  operators,
  orderedOperators,
  type LeafValue,
  type TestDraft,
} from "./filter-draft";
const ids = (test: TestDraft) =>
  test.op === "in"
    ? (test.values ?? []).map(String)
    : typeof test.value === "string" && test.value
      ? [test.value]
      : [];
export function FilterLeafEditor({
  value,
  onChange,
  locale,
  cache,
  capabilities,
}: {
  value: LeafValue;
  onChange: (value: LeafValue) => void;
  locale: "de" | "en";
  cache: MetadataCache;
  capabilities?: ScopedSearchCapabilities | undefined;
}) {
  const canonicalMoneyEnabled = useMoneyConsumers();
  const t = useTranslations("Search");
  const kind = value.kind;
  const test = value.test ?? { op: "present" };
  const setTest = (test: TestDraft) => onChange({ ...value, test });
  let ops: string[] = ["present", "missing"];
  if (kind === "collection" || kind === "tradeStatus" || kind === "visibility") ops = ["eq", "in"];
  if (kind === "category" || kind === "condition") ops = ["eq", "in", "present", "missing"];
  if (kind === "tags") ops = ["hasAny", "hasAll", "present", "missing"];
  if (kind === "createdAt" || kind === "updatedAt") ops = orderedOperators;
  if (kind === "acquisitionDate") ops = [...orderedOperators, "present", "missing"];
  if (kind === "manualMoney" || (kind === "purchaseMoney" && canonicalMoneyEnabled))
    ops = ["present", "missing", "range"];
  if (kind === "grading") ops = ["present", "missing", "authored", "comparable"];
  const ref = kind === "collection" || kind === "category" || kind === "condition";
  return (
    <div className="form-stack">
      <SearchLabel>
        {t("family")}
        <select
          value={kind}
          onChange={(e) =>
            onChange(
              capabilities
                ? newScopedLeaf(e.target.value as LeafValue["kind"], capabilities).value
                : newLeaf(e.target.value as LeafValue["kind"]).value,
            )
          }
        >
          {families.map((f) => (
            <option key={f} value={f} disabled={capabilities && !capabilities.families.includes(f)}>
              {t(`families.${f}`)}
              {capabilities && !capabilities.families.includes(f) ? ` · ${t("notAvailable")}` : ""}
            </option>
          ))}
        </select>
      </SearchLabel>
      {capabilities && !capabilities.families.includes(kind) ? (
        <div role="status">
          <p>{t("unavailableFamily")}</p>
          <pre className="scoped-retained-condition">{JSON.stringify(value, null, 2)}</pre>
        </div>
      ) : kind === "duplicate" ? (
        <>
          <SearchLabel>
            {t("value")}
            <select
              value={String(value.value ?? false)}
              onChange={(e) => onChange({ kind: "duplicate", value: e.target.value === "true" })}
            >
              <option value="true">{t("true")}</option>
              <option value="false">{t("false")}</option>
            </select>
          </SearchLabel>
          <p>{t("duplicateHelp")}</p>
        </>
      ) : kind === "marketMoney" ? (
        <MarketFilterEditor value={value} onChange={onChange} locale={locale} />
      ) : kind === "customField" || kind === "catalogAttribute" ? (
        <DefinitionEditor value={value} onChange={onChange} locale={locale} cache={cache} />
      ) : (
        <>
          {kind === "condition" && (
            <>
              <ReferencePicker
                source="categories"
                locale={locale}
                selected={value.categoryTemplateId ? [value.categoryTemplateId] : []}
                onChange={(selected) =>
                  onChange({
                    ...value,
                    categoryTemplateId: selected[0] ?? "",
                    test: { op: "present" },
                  })
                }
                cache={cache}
                label={t("category")}
              />
              <p>{t("conditionHelp")}</p>
            </>
          )}
          {ref ? (
            <>
              <SearchLabel>
                {t("operator")}
                <select value={test.op} onChange={(e) => setTest(defaultTest(e.target.value))}>
                  {ops.map((op) => (
                    <option value={op} key={op}>
                      {t(`operators.${op}`)}
                    </option>
                  ))}
                </select>
              </SearchLabel>
              {!["present", "missing"].includes(test.op) &&
                (kind !== "condition" || value.categoryTemplateId) &&
                (capabilities?.scope === "MEMBER_COLLECTION" &&
                kind === "collection" &&
                capabilities.reference.kind === "MEMBER_COLLECTION" ? (
                  <SearchLabel>
                    {t("families.collection")}
                    <select
                      value={
                        ids(test).length > 0 &&
                        ids(test).every(
                          (id) =>
                            id ===
                            (capabilities.reference.kind === "MEMBER_COLLECTION"
                              ? capabilities.reference.collectionId
                              : ""),
                        )
                          ? capabilities.reference.collectionId
                          : "__unavailable"
                      }
                      onChange={() =>
                        setTest(
                          test.op === "in"
                            ? {
                                op: "in",
                                values: [
                                  capabilities.reference.kind === "MEMBER_COLLECTION"
                                    ? capabilities.reference.collectionId
                                    : "",
                                ],
                              }
                            : {
                                op: "eq",
                                value:
                                  capabilities.reference.kind === "MEMBER_COLLECTION"
                                    ? capabilities.reference.collectionId
                                    : "",
                              },
                        )
                      }
                    >
                      {(!ids(test).length ||
                        ids(test).some(
                          (id) =>
                            id !==
                            (capabilities.reference.kind === "MEMBER_COLLECTION"
                              ? capabilities.reference.collectionId
                              : ""),
                        )) && (
                        <option value="__unavailable" disabled>
                          {t("notAvailable")}
                        </option>
                      )}
                      <option value={capabilities.reference.collectionId}>
                        {t("scopeSelectedCollection")}
                      </option>
                    </select>
                  </SearchLabel>
                ) : (
                  <ReferencePicker
                    source={
                      kind === "collection"
                        ? "collections"
                        : kind === "category"
                          ? "categories"
                          : "conditions"
                    }
                    parent={value.categoryTemplateId ?? ""}
                    locale={locale}
                    selected={ids(test)}
                    onChange={(selected) =>
                      setTest(
                        test.op === "in"
                          ? { op: "in", values: selected }
                          : { op: "eq", value: selected[0] ?? "" },
                      )
                    }
                    multiple={test.op === "in"}
                    cache={cache}
                    label={t(`families.${kind}`)}
                  />
                ))}
            </>
          ) : kind === "grading" ? (
            <>
              <SearchLabel>
                {t("operator")}
                <select value={test.op} onChange={(e) => setTest(defaultTest(e.target.value))}>
                  {ops.map((op) => (
                    <option key={op} value={op}>
                      {t(`operators.${op}`)}
                    </option>
                  ))}
                </select>
              </SearchLabel>
              <p>{t("gradingHelp")}</p>
              {(test.op === "authored" || test.op === "comparable") && (
                <>
                  <SearchLabel>
                    {t("provider")}
                    <input
                      value={test.provider ?? ""}
                      onChange={(e) => setTest({ ...test, provider: e.target.value })}
                    />
                  </SearchLabel>
                  {test.op === "authored" ? (
                    <>
                      {(["grade", "certificateNo"] as const).map((field) => (
                        <SearchLabel key={field}>
                          {t(field)}
                          <input
                            value={test[field] ?? ""}
                            onChange={(e) => {
                              const next = { ...test };
                              if (e.target.value) next[field] = e.target.value;
                              else delete next[field];
                              setTest(next);
                            }}
                          />
                        </SearchLabel>
                      ))}
                    </>
                  ) : (
                    <>
                      <SearchLabel>
                        {t("scale")}
                        <input
                          value={test.scale ?? ""}
                          onChange={(e) => setTest({ ...test, scale: e.target.value })}
                        />
                      </SearchLabel>
                      <PredicateEditor
                        test={typeof test.value === "object" ? test.value : { op: "eq", value: "" }}
                        onChange={(value) => setTest({ ...test, value })}
                        ops={orderedOperators}
                        type="DECIMAL"
                      />
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {kind === "media" && (
                <>
                  <SearchLabel>
                    {t("mediaKind")}
                    <select
                      value={value.mediaKind ?? "IMAGE"}
                      onChange={(e) => {
                        const next = {
                          ...value,
                          mediaKind: e.target.value as "IMAGE" | "DOCUMENT",
                        };
                        delete next.documentCategory;
                        onChange(next);
                      }}
                    >
                      <option
                        value="IMAGE"
                        disabled={capabilities && !capabilities.mediaKinds.includes("IMAGE")}
                      >
                        {t("image")}
                      </option>
                      <option
                        value="DOCUMENT"
                        disabled={capabilities && !capabilities.mediaKinds.includes("DOCUMENT")}
                      >
                        {t("document")}
                      </option>
                    </select>
                  </SearchLabel>
                  {value.mediaKind === "DOCUMENT" && (
                    <SearchLabel>
                      {t("documentCategory")}
                      <select
                        value={value.documentCategory ?? ""}
                        onChange={(e) => {
                          const next = { ...value };
                          if (e.target.value) next.documentCategory = e.target.value;
                          else delete next.documentCategory;
                          onChange(next);
                        }}
                      >
                        <option value="">{t("anyDocumentCategory")}</option>
                        {DocumentCategorySchema.options.map((category) => (
                          <option
                            key={category}
                            value={category}
                            disabled={
                              capabilities &&
                              !capabilities.receiptCategories &&
                              (category === "PURCHASE_RECEIPT" || category === "INVOICE")
                            }
                          >
                            {t(`documents.${category}`)}
                          </option>
                        ))}
                      </select>
                    </SearchLabel>
                  )}
                </>
              )}
              {kind === "manualMoney" ? (
                <>
                  <SearchLabel>
                    {t("operator")}
                    <select value={test.op} onChange={(e) => setTest(defaultTest(e.target.value))}>
                      {ops.map((op) => (
                        <option key={op} value={op}>
                          {t(`operators.${op}`)}
                        </option>
                      ))}
                    </select>
                  </SearchLabel>
                  {test.op === "range" && (
                    <MoneyRange
                      key={test.unit?.currency}
                      test={test}
                      onChange={setTest}
                      locale={locale}
                    />
                  )}
                </>
              ) : (
                <PredicateEditor
                  locale={locale}
                  test={test}
                  onChange={setTest}
                  ops={ops}
                  type={
                    kind === "createdAt" || kind === "updatedAt"
                      ? "INSTANT"
                      : kind === "acquisitionDate"
                        ? "DATE"
                        : kind === "purchaseMoney"
                          ? "MONEY"
                          : "TEXT"
                  }
                  choices={
                    kind === "tradeStatus"
                      ? ["NOT_FOR_TRADE", "OPEN_TO_TRADE", "FOR_SALE", "RESERVED"].map((v) => ({
                          value: v,
                          label: t(`trade.${v}`),
                        }))
                      : kind === "visibility"
                        ? ["PRIVATE", "UNLISTED", "PUBLIC"].map((v) => ({
                            value: v,
                            label: t(`visibility.${v}`),
                          }))
                        : undefined
                  }
                />
              )}{" "}
              {kind === "purchaseMoney" && (
                <p>{t(canonicalMoneyEnabled ? "canonicalRangeHelp" : "legacyMoneyHelp")}</p>
              )}
              {kind === "visibility" && <p>{t("visibilityHelp")}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
function DefinitionEditor({
  value,
  onChange,
  locale,
  cache,
}: {
  value: LeafValue;
  onChange: (value: LeafValue) => void;
  locale: "de" | "en";
  cache: MetadataCache;
}) {
  const canonicalMoneyEnabled = useMoneyConsumers();
  const t = useTranslations("Search");
  const custom = value.kind === "customField";
  const selector = value.selector ?? {};
  const parent = String(selector[custom ? "collectionId" : "categoryTemplateId"] ?? "");
  const definitionId = String(selector.definitionId ?? "");
  const predicate = value.predicate ?? { valueType: "SHORT_TEXT", test: { op: "present" } };
  const [options, setOptions] = useState<ValueChoice[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unavailable">("ready");
  const [retry, setRetry] = useState(0);
  const channel = useRef(new RequestChannel());
  useEffect(() => {
    setOptions([]);
    if (!parent || !definitionId) return;
    const request = channel.current.begin();
    setStatus("loading");
    void (async () => {
      if (custom) {
        const body = await cache.expand(request.signal, () =>
          searchRequest(
            "/api/v1/search/references/custom-fields",
            CustomReferencesSchema,
            request.signal,
            { references: [[parent, definitionId]], detail: "OPTIONS" },
          ),
        );
        if (!channel.current.current(request.id)) return;
        if (body.detail !== "OPTIONS") {
          setStatus("unavailable");
          return;
        }
        const ref = body.references[0];
        if (ref?.state !== "AVAILABLE" || !("options" in ref.definition)) {
          setStatus("unavailable");
          return;
        }
        cache.set(`${locale}:custom-fields:${parent}:${definitionId}`, {
          id: definitionId,
          label: ref.definition.name,
          type: ref.definition.type,
        });
        setOptions(
          ref.definition.options.map((label) => ({
            value: label.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("und"),
            label,
          })),
        );
        setStatus(ref.definition.type === predicate.valueType ? "ready" : "unavailable");
      } else {
        const body = await cache.expand(request.signal, () =>
          searchRequest(
            `/api/v1/categories/${parent}?view=definition&definitionId=${definitionId}`,
            CatalogDefinitionReferenceSchema,
            request.signal,
          ),
        );
        if (!channel.current.current(request.id)) return;
        cache.set(`${locale}:categories::${body.category.id}`, {
          id: body.category.id,
          label: body.category.labels[locale],
        });
        cache.set(`${locale}:catalog-definitions:${parent}:${definitionId}`, {
          id: definitionId,
          label: body.definition.labels[locale],
          type: body.definition.type,
        });
        setOptions(body.definition.options.map((o) => ({ value: o.key, label: o.labels[locale] })));
        setStatus(body.definition.type === predicate.valueType ? "ready" : "unavailable");
      }
    })().catch(() => {
      if (channel.current.current(request.id)) setStatus("error");
    });
    return () => channel.current.cancel();
  }, [parent, definitionId, custom, locale, cache, retry, predicate.valueType]);
  return (
    <>
      <ReferencePicker
        source={custom ? "collections" : "categories"}
        locale={locale}
        selected={parent ? [parent] : []}
        onChange={(ids) =>
          onChange({
            ...value,
            selector: {
              ...selector,
              [custom ? "collectionId" : "categoryTemplateId"]: ids[0] ?? "",
              definitionId: "",
            },
          })
        }
        label={custom ? t("collection") : t("category")}
        cache={cache}
      />
      {parent && (
        <ReferencePicker
          source={custom ? "custom-fields" : "catalog-definitions"}
          parent={parent}
          locale={locale}
          selected={definitionId ? [definitionId] : []}
          onChange={(ids) => {
            if (!ids.length) onChange({ ...value, selector: { ...selector, definitionId: "" } });
          }}
          onChoose={(choice) =>
            onChange({
              ...value,
              selector: { ...selector, definitionId: choice.id },
              predicate: { valueType: choice.type ?? "SHORT_TEXT", test: { op: "present" } },
            })
          }
          label={t("definition")}
          cache={cache}
        />
      )}{" "}
      {!custom && (
        <SearchLabel>
          {t("target")}
          <select
            value={String(selector.target ?? "ENTRY")}
            onChange={(e) =>
              onChange({ ...value, selector: { ...selector, target: e.target.value } })
            }
          >
            <option value="ENTRY">{t("entry")}</option>
            <option value="SELECTED_VARIANT">{t("variant")}</option>
          </select>
        </SearchLabel>
      )}
      {definitionId && (
        <>
          <p>{t("valueType", { type: t(`types.${predicate.valueType}`) })}</p>
          {status === "loading" && <p role="status">{t("loading")}</p>}
          {status === "error" && (
            <p role="alert">
              {t("referenceFailed")}{" "}
              <button type="button" onClick={() => setRetry(retry + 1)}>
                {t("retry")}
              </button>
            </p>
          )}
          {status === "unavailable" && <p role="alert">{t("unavailableReference")}</p>}
          <PredicateEditor
            locale={locale}
            type={predicate.valueType}
            test={predicate.test}
            onChange={(test) => onChange({ ...value, predicate: { ...predicate, test } })}
            ops={
              predicate.valueType === "MONEY" && canonicalMoneyEnabled
                ? ["present", "missing", "range"]
                : operators(predicate.valueType)
            }
            choices={
              predicate.valueType === "SINGLE_SELECT" || predicate.valueType === "MULTI_SELECT"
                ? options
                : undefined
            }
            customChoices={custom}
          />
          {predicate.valueType === "MONEY" && (
            <p>{t(canonicalMoneyEnabled ? "canonicalRangeHelp" : "legacyMoneyHelp")}</p>
          )}
          <p>{t("presenceHelp")}</p>
        </>
      )}
    </>
  );
}
