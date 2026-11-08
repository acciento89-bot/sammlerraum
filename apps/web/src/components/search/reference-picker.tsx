"use client";
import { SearchLabel } from "./search-label";
import { useEffect, useRef, useState, useId } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { CategorySummarySchema } from "@sammlerraum/contracts/catalog-reads";
import {
  CollectionReferencePageSchema,
  CollectionReferencesSchema,
  CustomReferencePageSchema,
  ConditionReferencePageSchema,
  ConditionReferencesSchema,
  CatalogDefinitionChoicesSchema,
} from "@sammlerraum/contracts/search-references";
import { searchRequest } from "./search-client";
import { MetadataCache, RequestChannel } from "./search-state";
export type Choice = { id: string; label: string; type?: string; retired?: boolean };
export type ReferenceSource =
  | "collections"
  | "categories"
  | "conditions"
  | "custom-fields"
  | "catalog-definitions";
const categoriesSchema = z
  .object({
    categories: z
      .array(z.unknown())
      .max(50)
      .transform((rows) => rows.map((row) => CategorySummarySchema.parse(row))),
    nextCursor: z.string().nullable(),
  })
  .strict();
export async function referencePage(
  source: ReferenceSource,
  parent: string,
  locale: "de" | "en",
  cursor: string | undefined,
  signal: AbortSignal,
  cache?: MetadataCache,
): Promise<{ choices: Choice[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
  if (source === "collections") {
    const page = await searchRequest(
      `/api/v1/search/references/collections?${query}`,
      CollectionReferencePageSchema,
      signal,
    );
    return {
      choices: page.collections.map((c) => ({ id: c.id, label: c.name })),
      nextCursor: page.nextCursor,
    };
  }
  if (source === "categories") {
    const page = await searchRequest(`/api/v1/categories?${query}`, categoriesSchema, signal);
    return {
      choices: page.categories.map((c) => ({ id: c.id, label: c.labels[locale] })),
      nextCursor: page.nextCursor,
    };
  }
  if (source === "conditions") {
    query.set("categoryId", parent);
    const page = await searchRequest(
      `/api/v1/search/references/conditions?${query}`,
      ConditionReferencePageSchema,
      signal,
    );
    cache?.set(`${locale}:categories::${page.category.id}`, {
      id: page.category.id,
      label: page.category.labels[locale],
    });
    return {
      choices: page.options.map((c) => ({ id: c.id, label: c.labels[locale], retired: !c.active })),
      nextCursor: page.nextCursor,
    };
  }
  if (source === "custom-fields") {
    query.set("collectionId", parent);
    const page = await searchRequest(
      `/api/v1/search/references/custom-fields?${query}`,
      CustomReferencePageSchema,
      signal,
    );
    cache?.set(`${locale}:collections::${page.collection.id}`, {
      id: page.collection.id,
      label: page.collection.name,
    });
    return {
      choices: page.definitions.map((c) => ({ id: c.id, label: c.name, type: c.type })),
      nextCursor: page.nextCursor,
    };
  }
  const page = await searchRequest(
    `/api/v1/categories/${parent}?view=definitions`,
    CatalogDefinitionChoicesSchema,
    signal,
  );
  cache?.set(`${locale}:categories::${page.category.id}`, {
    id: page.category.id,
    label: page.category.labels[locale],
  });
  return {
    choices: page.definitions.map((c) => ({ id: c.id, label: c.labels[locale], type: c.type })),
    nextCursor: null,
  };
}
export async function hydrateReferences(
  source: "collections" | "categories" | "conditions",
  ids: string[],
  parent: string,
  locale: "de" | "en",
  signal: AbortSignal,
  cache?: MetadataCache,
): Promise<Choice[]> {
  if (!ids.length) return [];
  if (source === "collections") {
    const body = await searchRequest(
      "/api/v1/search/references/collections",
      CollectionReferencesSchema,
      signal,
      { ids },
    );
    return body.references.flatMap((r) =>
      r.state === "AVAILABLE" ? [{ id: r.id, label: r.collection.name }] : [],
    );
  }
  const body = await searchRequest(
    "/api/v1/search/references/conditions",
    ConditionReferencesSchema,
    signal,
    { references: ids.map((id) => (source === "categories" ? [id, null] : [parent, id])) },
  );
  for (const reference of body.references)
    if (reference.state === "AVAILABLE")
      cache?.set(`${locale}:categories::${reference.category.id}`, {
        id: reference.category.id,
        label: reference.category.labels[locale],
      });
  return body.references.flatMap((r) =>
    r.state === "AVAILABLE"
      ? source === "categories"
        ? [{ id: r.category.id, label: r.category.labels[locale] }]
        : r.option
          ? [{ id: r.option.id, label: r.option.labels[locale], retired: !r.option.active }]
          : []
      : [],
  );
}
export function ReferencePicker({
  source,
  parent = "",
  locale,
  selected,
  onChange,
  label,
  multiple = false,
  cache,
  onChoose,
}: {
  source: ReferenceSource;
  parent?: string;
  locale: "de" | "en";
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  multiple?: boolean;
  cache: MetadataCache;
  onChoose?: (choice: Choice) => void;
}) {
  const t = useTranslations("Search");
  const [open, setOpen] = useState(false);
  const pickerId = useId();
  useEffect(
    () =>
      cache.watchPicker((id) => {
        setOpen(id === pickerId);
        if (id !== pickerId) {
          setPage({ choices: [], nextCursor: null });
          setCursor(undefined);
        }
      }),
    [cache, pickerId],
  );
  const [page, setPage] = useState<{ choices: Choice[]; nextCursor: string | null }>({
    choices: [],
    nextCursor: null,
  });
  const [cursor, setCursor] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const channel = useRef(new RequestChannel());
  const namespace = `${locale}:${source}:${parent}:`;
  // A selector-open/page action performs one page read and at most one selected-ID batch.
  useEffect(() => {
    if (!open) return;
    const request = channel.current.begin();
    setLoading(true);
    setError(false);
    const ids = selected.filter((id) => !cache.get(namespace + id));
    void Promise.all([
      cache.expand(request.signal, () =>
        referencePage(source, parent, locale, cursor, request.signal, cache),
      ),
      ids.length && (source === "collections" || source === "categories" || source === "conditions")
        ? cache.expand(request.signal, () =>
            hydrateReferences(source, ids, parent, locale, request.signal, cache),
          )
        : Promise.resolve([]),
    ])
      .then(([next, labels]) => {
        if (!channel.current.current(request.id)) return;
        for (const choice of [...next.choices, ...labels]) cache.set(namespace + choice.id, choice);
        setPage(next);
        setLoading(false);
      })
      .catch(() => {
        if (channel.current.current(request.id)) {
          setError(true);
          setLoading(false);
        }
      });
    return () => channel.current.cancel();
  }, [open, parent, source, cursor, retry, locale, cache, namespace]);
  return (
    <fieldset className="search-reference">
      <legend>{label}</legend>
      <p>{t("selected", { count: selected.length })}</p>
      {selected.length > 0 && (
        <ul className="search-selected">
          {selected.map((id, index) => {
            const choice = cache.get<Choice>(namespace + id);
            return (
              <li key={id}>
                <span>
                  {choice?.label ?? t("unresolvedSelection", { number: index + 1 })}
                  {choice?.retired ? ` · ${t("retired")}` : ""}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onChange(selected.filter((value) => value !== id))}
                >
                  {t("removeSelection", { number: index + 1 })}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="secondary-button"
        aria-expanded={open}
        onClick={() => cache.selectPicker(open ? null : pickerId)}
      >
        {open ? t("closeChoices") : t("choose")}
      </button>
      {open && (
        <div aria-busy={loading}>
          {loading && <p role="status">{t("loading")}</p>}
          {error ? (
            <p role="alert">
              {t("referenceFailed")}{" "}
              <button type="button" onClick={() => setRetry(retry + 1)}>
                {t("retry")}
              </button>
            </p>
          ) : (
            <>
              <SearchLabel>
                {t("availableChoices")}
                <select
                  value=""
                  disabled={loading}
                  onChange={(e) => {
                    const choice = page.choices.find((c) => c.id === e.target.value);
                    if (!choice) return;
                    onChoose?.(choice);
                    onChange(multiple ? [...new Set([...selected, choice.id])] : [choice.id]);
                  }}
                >
                  <option value="">{t("choose")}</option>
                  {page.choices.map((choice) => (
                    <option
                      key={choice.id}
                      value={choice.id}
                      disabled={multiple && selected.includes(choice.id)}
                    >
                      {choice.label}
                      {choice.retired ? ` · ${t("retired")}` : ""}
                      {choice.type ? ` · ${t(`types.${choice.type}`)}` : ""}
                    </option>
                  ))}
                </select>
              </SearchLabel>
              <div className="search-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!cursor || loading}
                  onClick={() => setCursor(undefined)}
                >
                  {t("firstPage")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!page.nextCursor || loading}
                  onClick={() => setCursor(page.nextCursor ?? undefined)}
                >
                  {t("nextPage")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
