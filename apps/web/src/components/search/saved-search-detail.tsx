"use client";
import {
  readSavedAcknowledgement,
  rememberSavedAcknowledgement,
  clearSavedAcknowledgements,
} from "./saved-acknowledgements";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SearchLifecycleSchema,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
import { parseSmartCollectionDefinition } from "@sammlerraum/contracts/smart-collections";
import { CollectorNavigation } from "./collector-navigation";
import { FilterBuilder } from "./filter-builder";
import { available, fromDraft, toDraft, type DraftNode } from "./filter-draft";
import { MetadataCache, RequestChannel } from "./search-state";
import { SearchHttpError } from "./search-client";
import { SearchLabel } from "./search-label";
import { SearchResults, type SearchPageData } from "./search-results";
import { SavedSearchDialog } from "./saved-search-dialog";
import { useSavedConfirmation } from "./use-saved-confirmation";
import { containDialogTab } from "./dialog-keyboard";
import {
  getSavedSearch,
  resolveSavedSearchPage,
  SavedRevisionChangedError,
  updateSavedSearch,
  deleteSavedSearch,
  SavedMutationUnknownError,
  type SavedDetail,
} from "./smart-collections-client";

export function SavedSearchDetail({
  id,
  locale,
  actor,
}: {
  id: string;
  locale: "de" | "en";
  actor: string;
}) {
  const t = useTranslations("SavedSearches"),
    search = useTranslations("Search"),
    router = useRouter();
  const read = useRef(new RequestChannel()),
    write = useRef(new RequestChannel()),
    cache = useRef(new MetadataCache()).current;
  const [receipt, setReceipt] = useState<ReturnType<typeof readSavedAcknowledgement>>();
  const [saved, setSaved] = useState<SavedDetail | null>(null),
    [latest, setLatest] = useState<SavedDetail | null>(null),
    [rows, setRows] = useState<SearchPageData | null>(null);
  const [name, setName] = useState(""),
    [text, setText] = useState(""),
    [draft, setDraft] = useState<DraftNode | null>(null),
    [lifecycle, setLifecycle] = useState<NormalizedItemSearchQuery["lifecycle"]>("ACTIVE");
  const [epoch, setEpoch] = useState(0),
    [dirty, setDirty] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [unknown, setUnknown] = useState<"update" | "delete" | null>(null),
    [conflict, setConflict] = useState(false),
    [copyOpen, setCopyOpen] = useState(false),
    [copyProtected, setCopyProtected] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const deleteDialog = useRef<HTMLDialogElement>(null),
    copyDialog = useRef<HTMLDialogElement>(null);
  const confirmation = useSavedConfirmation(
    dirty || !!unknown || busy || copyProtected,
    () => {
      if (copyOpen) {
        if (copyDialog.current?.getAttribute("aria-busy") === "true") return false;
        copyDialog.current?.close();
        setCopyOpen(false);
        return () => setCopyOpen(true);
      }
      if (deleteOpen) {
        if (busy) return false;
        deleteDialog.current?.close();
        setDeleteOpen(false);
        return () => setDeleteOpen(true);
      }
    },
    {
      isRecoveryNavigation: (destination) =>
        copyProtected &&
        !dirty &&
        destination.pathname === `/${locale}/smart-collections` &&
        !destination.search,
    },
  );
  const accept = useCallback(
    (detail: SavedDetail) => {
      setSaved(detail);
      setName(detail.name);
      setText(detail.definition.text);
      setDraft(toDraft(detail.definition.filter));
      setLifecycle(detail.definition.lifecycle);
      setEpoch((v) => v + 1);
      setDirty(false);
      setUnknown(null);
      setConflict(false);
      setLatest(null);
      setCursor(undefined);
      setRows(null);
      cache.clear();
    },
    [cache],
  );
  function memberFailure(problem: unknown) {
    setRows(null);
    if (problem instanceof SavedRevisionChangedError) {
      setCursor(undefined);
      setLatest(problem.current);
      setConflict(true);
      setError("revisionChanged");
    } else
      setError(
        problem instanceof SearchHttpError && problem.status === 404
          ? "notFound"
          : problem instanceof SearchHttpError && problem.code === "SMART_COLLECTION_UNRESOLVABLE"
            ? "unresolvable"
            : "membersFailed",
      );
  }
  const load = useCallback(async () => {
    if (read.current.closed) return;
    const request = read.current.begin();
    setLoading(true);
    setError("");
    setRows(null);
    setCursor(undefined);
    try {
      const detail = await getSavedSearch(id, request.signal);
      if (!read.current.current(request.id)) return;
      accept(detail);
      try {
        const result = await resolveSavedSearchPage(id, detail.revision, request.signal);
        if (read.current.current(request.id)) setRows(result);
      } catch (problem) {
        if (read.current.current(request.id)) memberFailure(problem);
      }
    } catch (problem) {
      if (read.current.current(request.id))
        setError(
          problem instanceof SearchHttpError && problem.status === 404
            ? "notFound"
            : "detailFailed",
        );
    } finally {
      if (read.current.current(request.id)) setLoading(false);
    }
  }, [id, accept]);
  useEffect(() => {
    setReceipt(readSavedAcknowledgement(actor, id));
    void load();
    const clear = () => {
      read.current.close();
      clearSavedAcknowledgements();
      setReceipt(undefined);
      write.current.close();
      cache.clear();
      setSaved(null);
      setLatest(null);
      setRows(null);
      setName("");
      setText("");
      setDraft(null);
      setEpoch((v) => v + 1);
      setDirty(false);
      setBusy(false);
      setLoading(false);
      setUnknown(null);
      setConflict(false);
      setNotice("");
      setCopyOpen(false);
      setDeleteOpen(false);
      setError("session");
    };
    window.addEventListener("sammlerraum:search-cleared", clear);
    return () => {
      read.current.cancel();
      write.current.cancel();
      cache.clear();
      window.removeEventListener("sammlerraum:search-cleared", clear);
    };
  }, [id, actor, load, cache]);
  useEffect(() => {
    if (deleteOpen) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleteOpen]);
  let query: NormalizedItemSearchQuery | null = null;
  try {
    const filter = fromDraft(draft);
    if (filter && !available(filter.root)) throw Error();
    const d = parseSmartCollectionDefinition({ version: 1, text, filter, lifecycle });
    query = { ...d, limit: 20 };
  } catch {
    /* Incomplete or unavailable drafts remain editable, never silently stripped. */
  }
  async function members(next?: string) {
    if (!saved || loading || busy || dirty || unknown || conflict || read.current.closed) return;
    const request = read.current.begin();
    setLoading(true);
    setRows(null);
    setCursor(next);
    setError("");
    try {
      const result = await resolveSavedSearchPage(id, saved.revision, request.signal, {
        limit: 20,
        ...(next ? { cursor: next } : {}),
      });
      if (read.current.current(request.id)) setRows(result);
    } catch (problem) {
      if (read.current.current(request.id)) memberFailure(problem);
    } finally {
      if (read.current.current(request.id)) setLoading(false);
    }
  }
  async function save() {
    if (!saved || !query || busy || unknown || conflict || write.current.closed) return;
    const request = write.current.begin();
    read.current.cancel();
    setBusy(true);
    setRows(null);
    setCursor(undefined);
    setError("");
    setNotice("");
    try {
      const detail = await updateSavedSearch(
        id,
        saved.revision,
        name,
        { version: 1, text: query.text, filter: query.filter, lifecycle: query.lifecycle },
        request.signal,
      );
      if (!write.current.current(request.id)) return;
      rememberSavedAcknowledgement(actor, detail);
      setReceipt(readSavedAcknowledgement(actor, id));
      accept(detail);
      setNotice("saved");
      setBusy(false);
      // Acknowledged revision is retained independently from member refresh.
      const memberRequest = read.current.begin();
      try {
        const result = await resolveSavedSearchPage(id, detail.revision, memberRequest.signal);
        if (read.current.current(memberRequest.id)) setRows(result);
      } catch (problem) {
        if (read.current.current(memberRequest.id)) memberFailure(problem);
      }
    } catch (problem) {
      if (!write.current.current(request.id)) return;
      setBusy(false);
      if (problem instanceof SavedMutationUnknownError) setUnknown("update");
      else if (problem instanceof SearchHttpError && problem.status === 409) {
        setConflict(true);
        setError("conflict");
      } else
        setError(
          problem instanceof SearchHttpError && problem.status === 404 ? "notFound" : "invalid",
        );
    }
  }
  async function inspect() {
    if (read.current.closed) return;
    const request = read.current.begin();
    setLoading(true);
    setRows(null);
    setError("");
    try {
      const current = await getSavedSearch(id, request.signal);
      if (read.current.current(request.id)) {
        setLatest(current);
        setNotice("latestRead");
      }
    } catch (problem) {
      if (read.current.current(request.id))
        setError(
          problem instanceof SearchHttpError && problem.status === 404
            ? "notFound"
            : "detailFailed",
        );
    } finally {
      if (read.current.current(request.id)) setLoading(false);
    }
  }
  async function remove() {
    if (!saved || busy || unknown || conflict || write.current.closed) return;
    const request = write.current.begin();
    read.current.cancel();
    setRows(null);
    setBusy(true);
    setError("");
    try {
      await deleteSavedSearch(id, saved.revision, request.signal);
      if (!write.current.current(request.id)) return;
      confirmation.navigateAfterGuard(() => {
        setDirty(false);
        setSaved(null);
        setDeleteOpen(false);
        setBusy(false);
        router.replace(`/${locale}/smart-collections`);
      });
    } catch (problem) {
      if (!write.current.current(request.id)) return;
      setBusy(false);
      setDeleteOpen(false);
      if (problem instanceof SavedMutationUnknownError) setUnknown("delete");
      else if (problem instanceof SearchHttpError && problem.status === 409) {
        setConflict(true);
        setError("conflict");
      } else
        setError(
          problem instanceof SearchHttpError && problem.status === 404 ? "notFound" : "failed",
        );
    }
  }
  function refresh() {
    if (dirty || unknown) confirmation.confirm(() => void load());
    else void load();
  }
  return (
    <section className="management-shell search-shell">
      <CollectorNavigation locale={locale} current="saved" />
      {confirmation.node}
      <header className="management-heading">
        <h1>{saved?.name ?? t("detailTitle")}</h1>
        <p>{t("liveHelp")}</p>
        {saved && <p>{t("revision", { revision: saved.revision })}</p>}
        <Link href={`/${locale}/smart-collections`} prefetch={false}>
          {t("back")}
        </Link>
      </header>
      {!saved && receipt && error === "detailFailed" && (
        <aside className="notice" role="status">
          <p>{receipt.name}</p>
          <p>{t("ack", { revision: receipt.revision })}</p>
          <p>{t("receiptHelp")}</p>
        </aside>
      )}
      {loading && <p role="status">{t("loading")}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      {error && (
        <div className="notice" role="alert">
          <p>{t(error)}</p>
          {error === "session" && (
            <Link href={`/${locale}/login`} prefetch={false}>
              {t("signIn")}
            </Link>
          )}
        </div>
      )}
      {unknown && (
        <div role="alert" className="notice">
          <p>{t(unknown === "update" ? "unknownUpdate" : "unknownDelete")}</p>
          <button className="secondary-button" disabled={loading} onClick={() => void inspect()}>
            {t("inspect")}
          </button>
        </div>
      )}
      {conflict && (
        <div className="notice">
          <p>{t("conflictHelp")}</p>
          <button className="secondary-button" disabled={loading} onClick={() => void inspect()}>
            {t("inspect")}
          </button>
        </div>
      )}
      {latest && (
        <aside className="management-card">
          <h2>{t("latestTitle")}</h2>
          <p>
            {latest.name} · {t("revision", { revision: latest.revision })}
          </p>
          <p>{t("latestHelp")}</p>
          <button
            onClick={() =>
              confirmation.confirm(() => {
                accept(latest);
                setNotice("");
                void load();
              })
            }
          >
            {t("reopenLatest")}
          </button>
        </aside>
      )}
      {!saved && error !== "session" && (
        <button disabled={loading} onClick={() => void load()}>
          {t("retry")}
        </button>
      )}
      {saved && (
        <div className="search-layout">
          <aside className="management-card search-filter-panel">
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <h2>{t("edit")}</h2>
              <fieldset disabled={busy || loading} className="form-stack">
                <SearchLabel>
                  {t("name")}
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDirty(true);
                    }}
                  />
                </SearchLabel>
                <SearchLabel>
                  {search("text")}
                  <input
                    maxLength={400}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setDirty(true);
                    }}
                  />
                </SearchLabel>
                <SearchLabel>
                  {search("lifecycle")}
                  <select
                    value={lifecycle}
                    onChange={(e) => {
                      setLifecycle(SearchLifecycleSchema.parse(e.target.value));
                      setDirty(true);
                    }}
                  >
                    {SearchLifecycleSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {search(`lifecycles.${value}`)}
                      </option>
                    ))}
                  </select>
                </SearchLabel>
                <FilterBuilder
                  helpText={t("builderHelp")}
                  key={`${actor}:${id}:${epoch}`}
                  value={draft}
                  locale={locale}
                  cache={cache}
                  onChange={(value) => {
                    setDraft(value);
                    setDirty(true);
                  }}
                />
                {!query && <p role="alert">{t("invalidDraft")}</p>}
                {dirty && <p role="status">{t("draftPending")}</p>}
                <div className="search-actions">
                  <button type="submit" disabled={!dirty || !query || !!unknown || conflict}>
                    {t("saveChanges")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!query}
                    onClick={() => setCopyOpen(true)}
                  >
                    {t("saveNew")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!dirty || !!unknown}
                    onClick={() => confirmation.confirm(() => accept(saved))}
                  >
                    {t("discard")}
                  </button>
                </div>
              </fieldset>
              <div className="search-actions">
                <button
                  type="button"
                  disabled={busy || loading || !!unknown || conflict}
                  onClick={() => setDeleteOpen(true)}
                >
                  {t("delete")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || loading}
                  onClick={refresh}
                >
                  {t("refreshDefinition")}
                </button>
              </div>
            </form>
          </aside>
          <section
            className="search-result-region"
            aria-labelledby="saved-results-heading"
            aria-busy={loading || busy}
          >
            <h2 id="saved-results-heading">{search("results")}</h2>
            {rows && !dirty && !unknown && !conflict && (
              <SearchResults data={rows} locale={locale} cache={cache} />
            )}{" "}
            {dirty && <p>{t("pendingMembers")}</p>}
            <div className="search-actions">
              <button
                disabled={loading || busy || dirty || !!unknown || conflict}
                onClick={() => void members()}
              >
                {t("refresh")}
              </button>
              <button
                disabled={loading || busy || dirty || !!unknown || conflict || !cursor}
                onClick={() => void members()}
              >
                {t("firstPage")}
              </button>
              <button
                disabled={loading || busy || dirty || !!unknown || conflict || !rows?.nextCursor}
                onClick={() => void members(rows?.nextCursor ?? undefined)}
              >
                {t("nextPage")}
              </button>
            </div>
          </section>
        </div>
      )}
      {saved && query && (
        <SavedSearchDialog
          modalRef={copyDialog}
          onProtectionChange={setCopyProtected}
          onCreated={(detail) => {
            copyDialog.current?.close();
            setCopyOpen(false);
            confirmation.navigateAfterGuard(() =>
              router.push(`/${locale}/smart-collections/${detail.id}`),
            );
          }}
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          locale={locale}
          query={query}
          actor={actor}
          initialName={name}
        />
      )}
      <dialog
        ref={deleteDialog}
        aria-busy={busy}
        className="search-confirm"
        aria-labelledby="saved-detail-delete-title"
        onKeyDown={containDialogTab}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setDeleteOpen(false);
        }}
      >
        <h2 id="saved-detail-delete-title">{t("deleteTitle")}</h2>
        <p>{t("deletePrompt", { name: saved?.name ?? "" })}</p>
        <p>{t("deleteHelp")}</p>
        <div className="search-actions">
          <button
            autoFocus
            disabled={busy}
            className="secondary-button"
            onClick={() => setDeleteOpen(false)}
          >
            {t("cancel")}
          </button>
          <button disabled={busy || !!unknown || conflict} onClick={() => void remove()}>
            {t("delete")}
          </button>
        </div>
      </dialog>
    </section>
  );
}
