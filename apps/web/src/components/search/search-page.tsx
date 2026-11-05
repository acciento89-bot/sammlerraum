"use client";
import { SearchLabel } from "./search-label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  parseItemSearchQuery,
  SearchLifecycleSchema,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
import { FilterBuilder } from "./filter-builder";
import { available, fromDraft, toDraft, type DraftNode } from "./filter-draft";
import { searchErrorKey, searchItems, SearchHttpError } from "./search-client";
import { MetadataCache, RequestChannel } from "./search-state";
import { parseSearchLocation, tabQueryStore, writeSearchHistory } from "./search-url-state";
import { SearchResults, type SearchPageData } from "./search-results";
import { CollectorNavigation } from "./collector-navigation";
function containDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  const first = controls[0],
    last = controls.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
const initial: NormalizedItemSearchQuery = {
  text: "",
  filter: null,
  lifecycle: "ACTIVE",
  limit: 20,
};
export function SearchPage({ locale, actor }: { locale: "de" | "en"; actor: string }) {
  const t = useTranslations("Search");
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<DraftNode | null>(null);
  const [lifecycle, setLifecycle] = useState(initial.lifecycle);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<SearchPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [stale, setStale] = useState(false);
  const [localError, setLocalError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [confirm, setConfirm] = useState<null | (() => void)>(null);
  const [dirty, setDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const cache = useRef(new MetadataCache()).current;
  const channel = useRef(new RequestChannel());
  const drawer = useRef<HTMLDialogElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const focusResults = useRef(false);
  const dirtyRef = useRef(false);
  const historyIndex = useRef(0);
  const ignorePop = useRef(false);
  const cancelAction = useRef<null | (() => void)>(null);
  function cancelConfirmation() {
    const action = cancelAction.current;
    cancelAction.current = null;
    setConfirm(null);
    action?.();
  }
  dirtyRef.current = dirty;
  function closeDrawer() {
    drawer.current?.close();
    openButton.current?.focus();
  }
  const load = useCallback(async (next: NormalizedItemSearchQuery, refresh = false) => {
    if (channel.current.closed) return;
    const request = channel.current.begin();
    setQuery(next);
    setLoading(true);
    setError("");
    setRequestId(undefined);
    setStale(false);
    if (!refresh) setData(null);
    try {
      const page = await searchItems(next, request.signal);
      if (!channel.current.current(request.id)) return;
      setData(page);
      setLoading(false);
      if (focusResults.current) {
        focusResults.current = false;
        drawer.current?.close();
        requestAnimationFrame(() => resultsHeading.current?.focus());
      }
    } catch (problem) {
      if (!channel.current.current(request.id)) return;
      setLoading(false);
      setError(searchErrorKey(problem));
      setRequestId(problem instanceof SearchHttpError ? problem.requestId : undefined);
      setStale(refresh);
    }
  }, []);
  const restore = useCallback(() => {
    if (channel.current.closed) return;
    channel.current.cancel();
    setEditorEpoch((value) => value + 1);
    const parsed = parseSearchLocation(window.location.search, window.location.hash);
    setData(null);
    setStale(false);
    setLocalError("");
    setDirty(false);
    setDraft(null);
    setText("");
    if (parsed.kind === "invalid") {
      setError("invalidUrl");
      setLoading(false);
      return;
    }
    const store = tabQueryStore(actor);
    let next = parsed.kind === "token" ? store.get(parsed.token) : initial;
    if (!next) {
      setError("missingToken");
      setLoading(false);
      return;
    }
    if (parsed.kind === "initial") {
      const token = store.put(next);
      writeSearchHistory(window.history, `/${locale}/search`, token, "replace");
      window.dispatchEvent(new Event("sammlerraum:search-history"));
    }
    historyIndex.current = window.history.state?.sammlerraumSearchIndex ?? 0;
    setText(next.text);
    setDraft(toDraft(next.filter));
    setLifecycle(next.lifecycle);
    setLimit(next.limit);
    void load(next);
  }, [actor, locale, load]);
  useEffect(() => {
    restore();
    const clear = () => {
      channel.current.close();
      setEditorEpoch((value) => value + 1);
      focusResults.current = false;
      cancelAction.current = null;
      setConfirm(null);
      drawer.current?.close();
      setQuery(initial);
      setLifecycle(initial.lifecycle);
      setLimit(initial.limit);
      setLocalError("");
      setRequestId(undefined);
      setStale(false);
      cache.clear();
      setData(null);
      setDraft(null);
      setText("");
      setLoading(false);
      setError("session");
      setDirty(false);
    };
    const pop = () => {
      if (ignorePop.current) {
        ignorePop.current = false;
        return;
      }
      if (!dirtyRef.current) {
        restore();
        return;
      }
      const targetIndex = window.history.state?.sammlerraumSearchIndex;
      const delta = typeof targetIndex === "number" ? historyIndex.current - targetIndex : 0;
      drawer.current?.close();
      cancelAction.current = () => {
        if (delta) {
          ignorePop.current = true;
          window.history.go(delta);
        }
      };
      setConfirm(() => () => restore());
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("sammlerraum:search-cleared", clear);
    return () => {
      channel.current.cancel();
      cache.clear();
      window.removeEventListener("popstate", pop);
      window.removeEventListener("sammlerraum:search-cleared", clear);
    };
  }, [restore, cache]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 44rem)");
    const change = () => {
      const wasOpen = drawer.current?.open;
      if (wasOpen) drawer.current?.close();
      setMobile(media.matches);
      if (wasOpen)
        requestAnimationFrame(() => {
          if (media.matches) openButton.current?.focus();
          else document.getElementById("search-filter-heading")?.focus();
        });
    };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const localeChange = (event: Event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      drawer.current?.close();
      const href = (event as CustomEvent<{ href: string }>).detail.href;
      setConfirm(() => () => router.push(href));
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("sammlerraum:search-locale", localeChange);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("sammlerraum:search-locale", localeChange);
      window.removeEventListener("beforeunload", unload);
    };
  }, [router]);
  useEffect(() => {
    if (confirm) confirmDialog.current?.showModal();
    else confirmDialog.current?.close();
  }, [confirm]);
  function navigate(next: NormalizedItemSearchQuery, mode: "push" | "replace" = "push") {
    if (channel.current.closed) return;
    const token = tabQueryStore(actor).put(next);
    writeSearchHistory(window.history, `/${locale}/search`, token, mode);
    historyIndex.current = window.history.state.sammlerraumSearchIndex;
    window.dispatchEvent(new Event("sammlerraum:search-history"));
    void load(next);
  }
  function apply() {
    if (channel.current.closed) return;
    try {
      const filter = fromDraft(draft);
      if (filter && !available(filter.root)) throw Error();
      const next = parseItemSearchQuery({ text, filter, lifecycle, limit });
      setLocalError("");
      setText(next.text);
      setDraft(toDraft(next.filter));
      setEditorEpoch((value) => value + 1);
      focusResults.current = true;
      setDirty(false);
      navigate(next);
    } catch {
      setLocalError("invalidDraft");
      requestAnimationFrame(() => errorSummary.current?.focus());
    }
  }
  function reset() {
    if (channel.current.closed) return;
    const action = () => {
      setEditorEpoch((value) => value + 1);
      setDraft(null);
      setText("");
      setLifecycle("ACTIVE");
      setLimit(20);
      setLocalError("");
      setDirty(false);
      navigate(initial);
    };
    if (dirty) {
      closeDrawer();
      setConfirm(() => action);
    } else action();
  }
  function discard() {
    const action = () => {
      setEditorEpoch((value) => value + 1);
      setDraft(toDraft(query.filter));
      setText(query.text);
      setLifecycle(query.lifecycle);
      setLimit(query.limit);
      setDirty(false);
      setLocalError("");
    };
    if (dirty) {
      closeDrawer();
      setConfirm(() => action);
    } else action();
  }
  let unavailable = false;
  try {
    const filter = fromDraft(draft);
    unavailable = !!filter && !available(filter.root);
  } catch {
    /* Incomplete drafts are validated by Apply. */
  }
  const form = (
    <form
      key={`${actor}:${editorEpoch}`}
      className="form-stack"
      aria-label={t("filters")}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <h2 id="search-filter-heading" tabIndex={-1}>
        {t("filters")}
      </h2>
      {mobile && (
        <button type="button" className="secondary-button" onClick={closeDrawer}>
          {t("closeFilters")}
        </button>
      )}
      <SearchLabel>
        {t("text")}
        <input
          value={text}
          maxLength={400}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
        />
      </SearchLabel>
      <p className="field-help">{t("textHelp")}</p>
      <SearchLabel>
        {t("lifecycle")}
        <select
          value={lifecycle}
          onChange={(e) => {
            setLifecycle(SearchLifecycleSchema.parse(e.target.value));
            setDirty(true);
          }}
        >
          {SearchLifecycleSchema.options.map((value) => (
            <option key={value} value={value}>
              {t(`lifecycles.${value}`)}
            </option>
          ))}
        </select>
      </SearchLabel>
      <SearchLabel>
        {t("pageSize")}
        <select
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            setDirty(true);
          }}
        >
          {[10, 20, 50].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </SearchLabel>
      <div
        id="search-filter-tree"
        tabIndex={-1}
        aria-invalid={!!localError}
        aria-describedby={localError ? "search-draft-error" : undefined}
      >
        <FilterBuilder
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setDirty(true);
          }}
          locale={locale}
          cache={cache}
        />
      </div>
      {unavailable && <p role="alert">{t("unavailableFamily")}</p>}
      {localError && (
        <div id="search-draft-error" role="alert" ref={errorSummary} tabIndex={-1}>
          <p>{t(localError)}</p>
          <a
            href="#search-filter-tree"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("search-filter-tree")?.focus();
            }}
          >
            {t("reviewFilters")}
          </a>
        </div>
      )}
      {dirty && <p role="status">{t("draftPending")}</p>}
      <div className="search-actions">
        <button type="submit" disabled={loading || unavailable || error === "session"}>
          {t("apply")}
        </button>
        <button type="button" className="secondary-button" onClick={reset}>
          {t("reset")}
        </button>
        <button type="button" className="secondary-button" disabled={!dirty} onClick={discard}>
          {t("discard")}
        </button>
      </div>
    </form>
  );
  return (
    <section className="management-shell search-shell">
      <CollectorNavigation locale={locale} />
      <header className="management-heading">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
        <p className="field-help">{t("tokenHelp")}</p>
      </header>
      <div className="search-layout">
        {mobile ? (
          <>
            <button
              ref={openButton}
              type="button"
              onClick={() => {
                drawer.current?.showModal();
                document.getElementById("search-filter-heading")?.focus();
              }}
            >
              {t("openFilters")}
            </button>
            <dialog
              onKeyDown={containDialogTab}
              className="search-drawer"
              ref={drawer}
              aria-labelledby="search-filter-heading"
              onClose={() => openButton.current?.focus()}
              onClick={(e) => {
                if (e.target === e.currentTarget) closeDrawer();
              }}
            >
              {form}
            </dialog>
          </>
        ) : (
          <aside className="management-card search-filter-panel">{form}</aside>
        )}
        <section
          className="search-result-region"
          aria-labelledby="search-results-heading"
          aria-busy={loading}
        >
          <h2 id="search-results-heading" ref={resultsHeading} tabIndex={-1}>
            {t("results")}
          </h2>
          {loading && <p role="status">{t("loading")}</p>}
          {error && (
            <div className="notice" role="alert">
              <p>{t(`errors.${error}`)}</p>
              {requestId && <p>{t("requestId", { id: requestId })}</p>}
              {error === "session" ? (
                <Link href={`/${locale}/login`} prefetch={false}>
                  {t("signIn")}
                </Link>
              ) : error === "invalidUrl" || error === "missingToken" ? (
                <button type="button" onClick={reset}>
                  {t("reset")}
                </button>
              ) : (
                <button type="button" onClick={() => void load(query, true)}>
                  {t("retry")}
                </button>
              )}
            </div>
          )}
          {stale && data && <p role="status">{t("stale")}</p>}
          {data && <SearchResults data={data} locale={locale} cache={cache} />}
          <div className="search-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={loading || !data || error === "session"}
              onClick={() => void load(query, true)}
            >
              {t("refresh")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={loading || !query.cursor || error === "session"}
              onClick={() => {
                const next = { ...query };
                delete next.cursor;
                navigate(next);
              }}
            >
              {t("firstPage")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={loading || !data?.nextCursor || error === "session"}
              onClick={() => {
                if (data?.nextCursor) navigate({ ...query, cursor: data.nextCursor });
              }}
            >
              {t("nextPage")}
            </button>
          </div>
        </section>
      </div>
      <dialog
        ref={confirmDialog}
        className="search-confirm"
        onKeyDown={containDialogTab}
        aria-labelledby="discard-title"
        onCancel={(event) => {
          event.preventDefault();
          cancelConfirmation();
        }}
      >
        <h2 id="discard-title">{t("discardTitle")}</h2>
        <p>{t("discardHelp")}</p>
        <div className="search-actions">
          <button type="button" autoFocus onClick={cancelConfirmation}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              const action = confirm;
              cancelAction.current = null;
              setConfirm(null);
              setDirty(false);
              action?.();
            }}
          >
            {t("discardConfirm")}
          </button>
        </div>
      </dialog>
    </section>
  );
}
