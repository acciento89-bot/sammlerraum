"use client";
import { ScopedSavedRow } from "./scoped-saved-row";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ScopedDiscoveryPageSchema,
  type ScopedSearchReference,
} from "@sammlerraum/contracts/scoped-search";
import {
  ScopedSmartCollectionListSchema,
  type ScopedSmartCollectionDetail,
} from "@sammlerraum/contracts/smart-collections";
import type { z } from "zod";
import { ScopedSearchPanel, type ScopedPanelTarget } from "./scoped-search-panel";
import { CollectorNavigation } from "./collector-navigation";
import { scopedRequest } from "./scoped-search-client";
type Choice = z.infer<typeof ScopedDiscoveryPageSchema>["items"][number];
export function SharedSearchHub({
  locale,
  initialCollection,
}: {
  locale: "de" | "en";
  initialCollection?: string | undefined;
}) {
  const t = useTranslations("ScopedSearch");
  const [choices, setChoices] = useState<Choice[]>([]),
    [saved, setSaved] = useState<ScopedSmartCollectionDetail[]>([]);
  const [selected, setSelected] = useState<ScopedSearchReference | null>(
    initialCollection ? { kind: "MEMBER_COLLECTION", collectionId: initialCollection } : null,
  );
  const [savedId, setSavedId] = useState<string>(),
    [error, setError] = useState("");
  const [cursors, setCursors] = useState<Record<string, string | null>>({}),
    [savedCursor, setSavedCursor] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  async function loadScopes(
    family: "MEMBER_COLLECTION" | "SHARE",
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const page = await scopedRequest(
      `/api/v1/search/scopes?family=${family}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      undefined,
      ScopedDiscoveryPageSchema,
      signal,
    );
    if (signal?.aborted) return;
    setChoices((previous) => [
      ...previous.filter((choice) => !page.items.some((item) => key(item) === key(choice))),
      ...page.items,
    ]);
    setCursors((previous) => ({ ...previous, [family]: page.nextCursor }));
    if (page.items[0]) setSelected((previous) => previous ?? reference(page.items[0]!));
  }
  async function loadSaved(cursor?: string, signal?: AbortSignal) {
    const page = await scopedRequest(
      `/api/v1/scoped-smart-collections${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      undefined,
      ScopedSmartCollectionListSchema,
      signal,
    );
    if (signal?.aborted) return;
    setSaved((previous) => (cursor ? [...previous, ...page.items] : page.items));
    setSavedCursor(page.nextCursor);
  }
  useEffect(() => {
    const abort = new AbortController();
    control.current = abort;
    void Promise.all([
      loadScopes("MEMBER_COLLECTION", undefined, abort.signal),
      loadScopes("SHARE", undefined, abort.signal),
      loadSaved(undefined, abort.signal),
    ]).catch(() => {
      if (!abort.signal.aborted) setError(t("error"));
    });
    return () => abort.abort();
    // Scope/data labels reload through explicit actions; no credentials persist here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function reference(choice: Choice): ScopedSearchReference {
    return choice.kind === "SHARE"
      ? { kind: "SHARE", shareId: choice.shareId }
      : { kind: "MEMBER_COLLECTION", collectionId: choice.collectionId };
  }
  function key(ref: ScopedSearchReference | Choice) {
    return ref.kind === "SHARE" ? `share:${ref.shareId}` : `member:${ref.collectionId}`;
  }
  const target: ScopedPanelTarget | null =
    selected?.kind === "SHARE"
      ? { kind: "SHARE", access: { shareId: selected.shareId } }
      : selected;
  const selectedKey = selected ? key(selected) : "";
  return (
    <div className="management-shell">
      <CollectorNavigation locale={locale} current="shared" />
      <header className="management-heading">
        <h1>{t("hubTitle")}</h1>
        <p>{t("hubIntro")}</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="management-card">
        <label>
          {t("chooseScope")}
          <select
            value={selectedKey}
            onChange={(event) => {
              const choice = choices.find((value) => key(value) === event.target.value);
              if (choice) {
                setSelected(reference(choice));
                setSavedId(undefined);
              }
            }}
          >
            <option value="" disabled>
              {t("chooseScope")}
            </option>
            {selected && !choices.some((choice) => key(choice) === selectedKey) && (
              <option value={selectedKey}>{t("selectedScope")}</option>
            )}
            {choices.map((choice) => (
              <option key={key(choice)} value={key(choice)}>
                {choice.kind === "MEMBER_COLLECTION"
                  ? choice.name
                  : t(choice.pinRequired ? "protectedShare" : "namedShare")}
              </option>
            ))}
          </select>
        </label>
        {Object.entries(cursors).map(
          ([family, cursor]) =>
            cursor && (
              <button
                type="button"
                className="secondary-button"
                key={family}
                onClick={() =>
                  void loadScopes(
                    family as "MEMBER_COLLECTION" | "SHARE",
                    cursor,
                    control.current?.signal,
                  ).catch(() => setError(t("error")))
                }
              >
                {t("moreScopes")}
              </button>
            ),
        )}
        {!selected && !error && <p>{t("noScopes")}</p>}
      </section>
      {target && (
        <ScopedSearchPanel
          key={selectedKey}
          locale={locale}
          target={target}
          initialOpen
          initialSavedId={savedId}
          onSavedChanged={() =>
            void loadSaved(undefined, control.current?.signal).catch(() =>
              setError(t("savedUnavailable")),
            )
          }
        />
      )}
      {!!saved.length && (
        <section className="management-card">
          <h2>{t("savedTitle")}</h2>
          <ul className="scoped-saved-list">
            {saved.map((entry) => (
              <ScopedSavedRow
                key={entry.id}
                entry={entry}
                scopeLabel={
                  choices.find(
                    (choice) =>
                      key(choice) === key(entry.definition.scope) &&
                      choice.kind === "MEMBER_COLLECTION",
                  )?.kind === "MEMBER_COLLECTION"
                    ? (
                        choices.find(
                          (choice) => key(choice) === key(entry.definition.scope),
                        ) as Extract<Choice, { kind: "MEMBER_COLLECTION" }>
                      ).name
                    : undefined
                }
                onOpen={() => {
                  setSelected(entry.definition.scope);
                  setSavedId(entry.id);
                }}
                onRemoved={() => {
                  setSaved((entries) => entries.filter((item) => item.id !== entry.id));
                  if (savedId === entry.id) setSavedId(undefined);
                }}
              />
            ))}
          </ul>
          {savedCursor && (
            <button
              type="button"
              onClick={() =>
                void loadSaved(savedCursor, control.current?.signal).catch(() =>
                  setError(t("savedUnavailable")),
                )
              }
            >
              {t("moreSaved")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
