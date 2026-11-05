"use client";
import { DeferredFocus } from "./deferred-focus";
import { SearchLabel } from "./search-label";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import { FilterLeafEditor } from "./filter-leaf-editor";
import { draftKey, fromDraft, newLeaf, replaceNode, type DraftNode } from "./filter-draft";
import { MetadataCache } from "./search-state";
export function FilterBuilder({
  value,
  onChange,
  locale,
  cache,
  helpText,
}: {
  value: DraftNode | null;
  onChange: (value: DraftNode | null) => void;
  locale: "de" | "en";
  cache: MetadataCache;
  helpText?: string;
}) {
  const t = useTranslations("Search");
  const [active, setActive] = useState<string | null>(value?.key ?? null);
  const [undo, setUndo] = useState<DraftNode | null>(null);
  const [status, setStatus] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const focus = useRef(new DeferredFocus()).current;
  useEffect(() => () => focus.cancel(), [focus]);
  function change(next: DraftNode | null, focusId?: string) {
    try {
      fromDraft(next);
    } catch (error) {
      if (error instanceof FilterValidationError && error.code === "FILTER_TOO_COMPLEX") {
        setStatus(t("tooComplex"));
        return;
      }
    }
    setUndo(null);
    onChange(next);
    if (focusId) {
      setActive(focusId);
      setStatus(t("added"));
      focus.afterRender(() => document.getElementById(focusId));
    }
  }
  function replace(key: string, next: DraftNode | null) {
    if (value) change(replaceNode(value, key, next));
  }
  function add(parent: DraftNode | null, group = false) {
    const leaf = newLeaf();
    const added: DraftNode = group ? { key: draftKey(), kind: "and", children: [leaf] } : leaf;
    if (!value) change(added, leaf.key);
    else if (parent && (parent.kind === "and" || parent.kind === "or"))
      change(
        replaceNode(value, parent.key, { ...parent, children: [...parent.children, added] }),
        leaf.key,
      );
    else change({ key: draftKey(), kind: "and", children: [value, added] }, leaf.key);
  }
  function render(node: DraftNode, level: number): React.ReactNode {
    return (
      <fieldset className="search-node" key={node.key} aria-describedby={`${node.key}-level`}>
        <legend>
          {node.kind === "leaf"
            ? t(`families.${node.value.kind}`)
            : node.kind === "not"
              ? t("notGroup")
              : t("group")}
        </legend>
        <p className="field-help" id={`${node.key}-level`}>
          {t("level", { level })}
        </p>
        <div className="search-actions">
          <button
            id={node.key}
            type="button"
            className="secondary-button"
            aria-expanded={active === node.key}
            onClick={() => setActive(active === node.key ? null : node.key)}
          >
            {active === node.key ? t("closeEditor") : t("edit")}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (node.kind === "not") replace(node.key, node.child);
              else replace(node.key, { key: draftKey(), kind: "not", child: node });
              setStatus(t("changed"));
            }}
          >
            {node.kind === "not" ? t("removeNegation") : t("negate")}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              replace(node.key, null);
              setUndo(value);
              setStatus(t("removed"));
              focus.afterRender(() =>
                container.current?.querySelector<HTMLButtonElement>("button"),
              );
            }}
          >
            {t("remove")}
          </button>
        </div>
        {node.kind === "leaf" ? (
          active === node.key ? (
            <FilterLeafEditor
              value={node.value}
              onChange={(leaf) => replace(node.key, { ...node, value: leaf })}
              locale={locale}
              cache={cache}
            />
          ) : (
            <p>{t("collapsedLeaf")}</p>
          )
        ) : node.kind === "not" ? (
          render(node.child, level + 1)
        ) : (
          <>
            <SearchLabel>
              {t("combination")}
              <select
                value={node.kind}
                onChange={(e) =>
                  replace(node.key, { ...node, kind: e.target.value as "and" | "or" })
                }
              >
                <option value="and">{t("all")}</option>
                <option value="or">{t("any")}</option>
              </select>
            </SearchLabel>
            {node.children.map((child) => render(child, level + 1))}
            <div className="search-actions">
              <button type="button" className="secondary-button" onClick={() => add(node)}>
                {t("addCondition")}
              </button>
              <button type="button" className="secondary-button" onClick={() => add(node, true)}>
                {t("addGroup")}
              </button>
            </div>
          </>
        )}
      </fieldset>
    );
  }
  return (
    <div ref={container} className="search-builder">
      <p className="field-help">{helpText ?? t("builderHelp")}</p>
      {value && render(value, 1)}
      {(!value || value.kind === "leaf" || value.kind === "not") && (
        <div className="search-actions">
          <button type="button" className="secondary-button" onClick={() => add(null)}>
            {t("addCondition")}
          </button>
          <button type="button" className="secondary-button" onClick={() => add(null, true)}>
            {t("addGroup")}
          </button>
        </div>
      )}
      {undo && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            change(undo);
            setUndo(null);
            setStatus(t("restored"));
          }}
        >
          {t("undo")}
        </button>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
