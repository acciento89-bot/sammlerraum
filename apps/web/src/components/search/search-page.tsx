"use client";
import { Icon } from "../visual/icon";
import { SelectionExportAction } from "../exports/selection-export-action";
import { useMoneyConsumers } from "./money-consumer-context";
import { PersonalMilestones } from "../dashboard/personal-milestones";
import type { DashboardData } from "@sammlerraum/contracts/dashboard";
import { DashboardResults } from "./dashboard-results";
import { loadDashboard } from "./dashboard-client";
import { useCollectorConfirmation } from "./use-saved-confirmation";
import { SavedSearchDialog } from "./saved-search-dialog";
import { containDialogTab } from "./dialog-keyboard";
import { SearchLabel } from "./search-label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
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
const initial: NormalizedItemSearchQuery = {
  text: "",
  filter: null,
  lifecycle: "ACTIVE",
  limit: 20,
};
export function SearchPage({
  locale,
  actor,
  view = "search",
}: {
  locale: "de" | "en";
  actor: string;
  view?: "search" | "dashboard";
}) {
  const canonicalMoneyEnabled = useMoneyConsumers();
  const t = useTranslations("Search");
  const visual = useTranslations("Visual");
  const dt = useTranslations("Dashboard");
  const savedT = useTranslations("SavedSearches");
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveProtected, setSaveProtected] = useState(false);
  const [saveEpoch, setSaveEpoch] = useState(0);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<DraftNode | null>(null);
  const [lifecycle, setLifecycle] = useState(initial.lifecycle);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<SearchPageData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [stale, setStale] = useState(false);
  const [localError, setLocalError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const cache = useRef(new MetadataCache()).current;
  const channel = useRef(new RequestChannel());
  const drawer = useRef<HTMLDialogElement>(null);
  const saveDialog = useRef<HTMLDialogElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const focusResults = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  function markClean() {
    dirtyRef.current = false;
    setDirty(false);
  }
  const confirmation = useCollectorConfirmation(
    dirty || saveProtected,
    () => {
      if (saveOpen) {
        if (saveDialog.current?.getAttribute("aria-busy") === "true") return false;
        saveDialog.current?.close();
        setSaveOpen(false);
        return () => setSaveOpen(true);
      }
      drawer.current?.close();
    },
    {
      copy: {
        title: t("discardTitle"),
        body: saveProtected ? savedT("discardHelp") : t("discardHelp"),
        cancel: t("cancel"),
        discard: t("discardConfirm"),
      },
      isRecoveryNavigation: (destination) =>
        saveProtected &&
        !dirtyRef.current &&
        destination.pathname === `/${locale}/smart-collections` &&
        !destination.search,
      onDiscard: () => {
        markClean();
        if (saveProtected) {
          setSaveOpen(false);
          setSaveProtected(false);
          setSaveEpoch((v) => v + 1);
        }
      },
    },
  );
  function closeDrawer() {
    drawer.current?.close();
    openButton.current?.focus();
  }
  const load = useCallback(
    async (next: NormalizedItemSearchQuery, refresh = false) => {
      if (channel.current.closed) return;
      const request = channel.current.begin();
      setQuery(next);
      setLoading(true);
      setError("");
      setRequestId(undefined);
      setStale(false);
      if (!refresh) {
        setData(null);
        setDashboard(null);
      }
      try {
        if (view === "dashboard") {
          const page = await loadDashboard(next, request.signal);
          if (!channel.current.current(request.id)) return;
          setDashboard(page);
          setData(null);
        } else {
          const page = await searchItems(next, request.signal);
          if (!channel.current.current(request.id)) return;
          setData(page);
          setDashboard(null);
        }
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
    },
    [view],
  );
  const restore = useCallback(() => {
    if (channel.current.closed) return;
    channel.current.cancel();
    setEditorEpoch((value) => value + 1);
    const parsed = parseSearchLocation(window.location.search, window.location.hash);
    setData(null);
    setDashboard(null);
    setStale(false);
    setLocalError("");
    markClean();
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
      writeSearchHistory(window.history, `/${locale}/${view}`, token, "replace");
      window.dispatchEvent(new Event("sammlerraum:search-history"));
    }
    setText(next.text);
    setDraft(toDraft(next.filter));
    setLifecycle(next.lifecycle);
    setLimit(next.limit);
    void load(next);
  }, [actor, locale, view, load]);
  useEffect(() => {
    restore();
    const clear = () => {
      channel.current.close();
      setEditorEpoch((value) => value + 1);
      focusResults.current = false;
      setSaveOpen(false);
      setSaveProtected(false);
      setSaveEpoch((v) => v + 1);
      drawer.current?.close();
      setQuery(initial);
      setLifecycle(initial.lifecycle);
      setLimit(initial.limit);
      setLocalError("");
      setRequestId(undefined);
      setStale(false);
      cache.clear();
      setData(null);
      setDashboard(null);
      setDraft(null);
      setText("");
      setLoading(false);
      setError("session");
      markClean();
    };
    const pop = (event: PopStateEvent) => {
      if (confirmation.internalHistoryEvent(event) || dirtyRef.current) return;
      restore();
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
  function navigate(next: NormalizedItemSearchQuery, mode: "push" | "replace" = "push") {
    if (channel.current.closed) return;
    confirmation.changeLocation(() => {
      const token = tabQueryStore(actor).put(next);
      writeSearchHistory(window.history, `/${locale}/${view}`, token, mode);
      window.dispatchEvent(new Event("sammlerraum:search-history"));
      void load(next);
    }, dirtyRef.current || saveProtected);
  }
  function openOtherView() {
    if (dirty || saveProtected || loading || error) return;
    const next = { ...query };
    delete next.cursor;
    const token = tabQueryStore(actor).put(next);
    confirmation.navigateAfterGuard(() =>
      router.push(`/${locale}/${view === "search" ? "dashboard" : "search"}?q=${token}`),
    );
  }

  function apply() {
    if (channel.current.closed) return;
    try {
      const filter = fromDraft(draft);
      if (filter && !available(filter.root, canonicalMoneyEnabled)) throw Error();
      const next = parseItemSearchQuery({ text, filter, lifecycle, limit });
      setLocalError("");
      setText(next.text);
      setDraft(toDraft(next.filter));
      setEditorEpoch((value) => value + 1);
      focusResults.current = true;
      markClean();
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
      markClean();
      navigate(initial);
    };
    if (dirty) {
      closeDrawer();
      confirmation.confirm(action);
    } else action();
  }
  function discard() {
    const action = () => {
      setEditorEpoch((value) => value + 1);
      setDraft(toDraft(query.filter));
      setText(query.text);
      setLifecycle(query.lifecycle);
      setLimit(query.limit);
      markClean();
      setLocalError("");
    };
    if (dirty) {
      closeDrawer();
      confirmation.confirm(action);
    } else action();
  }
  let unavailable = false;
  try {
    const filter = fromDraft(draft);
    unavailable = !!filter && !available(filter.root, canonicalMoneyEnabled);
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
      {view === "search" && (
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
      )}
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
        <button
          type="submit"
          disabled={loading || saveProtected || unavailable || error === "session"}
        >
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
    <section
      className={`management-shell search-shell ${view === "dashboard" ? "dashboard-view" : ""}`}
    >
      <CollectorNavigation locale={locale} current={view} />
      {error !== "session" && (
        <SavedSearchDialog
          key={`${actor}:${saveEpoch}`}
          modalRef={saveDialog}
          onProtectionChange={setSaveProtected}
          onCreated={(detail) => {
            saveDialog.current?.close();
            setSaveOpen(false);
            confirmation.navigateAfterGuard(() =>
              router.push(`/${locale}/smart-collections/${detail.id}`),
            );
          }}
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          locale={locale}
          query={query}
          actor={actor}
        />
      )}
      <header className="management-heading">
        <p className="eyebrow">{view === "dashboard" ? dt("eyebrow") : t("eyebrow")}</p>
        <h1>{view === "dashboard" ? dt("title") : t("title")}</h1>
        <p>{view === "dashboard" ? dt("intro") : t("intro")}</p>
        <p className="field-help">{t("tokenHelp")}</p>
        <SelectionExportAction
          locale={locale}
          scope={{ kind: "SEARCH" }}
          query={query}
          disabled={loading || !(data || dashboard) || !!error || dirty || stale || saveProtected}
          label={`${locale === "de" ? "Angewendete Suche" : "Applied search"}: ${query.text || (locale === "de" ? "ohne Suchtext" : "no search text")}${query.filter ? (locale === "de" ? " · mit Filterbedingungen" : " · with filters") : ""} · ${query.lifecycle === "ACTIVE" ? (locale === "de" ? "Aktive Objekte" : "Active items") : query.lifecycle === "ARCHIVED" ? (locale === "de" ? "Archivierte Objekte" : "Archived items") : query.lifecycle === "DISPOSED" ? (locale === "de" ? "Abgegebene Objekte" : "Disposed items") : locale === "de" ? "Alle Objektstatus" : "All item states"}`}
        />
        <button
          type="button"
          disabled={loading || !(data || dashboard) || !!error || dirty}
          onClick={() => setSaveOpen(true)}
        >
          {t("saveSearch")}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={loading || !(data || dashboard) || !!error || dirty || saveProtected}
          onClick={openOtherView}
        >
          {view === "dashboard" ? dt("openSearch") : t("openDashboard")}
        </button>
        {dirty && <p className="field-help">{t("saveApplied")}</p>}
      </header>
      {view === "dashboard" && error !== "session" && (
        <div className="dashboard-quick-start">
          <p className="quick-actions-heading">{visual("quickActions")}</p>
          <div className="workspace-quick-actions">
            <Link href={`/${locale}/items/new`}>
              <span>
                <Icon name="plus" />
              </span>
              {visual("quickCapture")}
              <Icon name="arrow" />
            </Link>
            <Link href={`/${locale}/collections`}>
              <span>
                <Icon name="grid" />
              </span>
              {visual("quickCollection")}
              <Icon name="arrow" />
            </Link>
            <Link href={`/${locale}/imports`}>
              <span>
                <Icon name="upload" />
              </span>
              {visual("quickImport")}
              <Icon name="arrow" />
            </Link>
          </div>
        </div>
      )}
      {view === "dashboard" && error !== "session" && (
        <PersonalMilestones key={`${actor}:milestones-preview`} actor={actor} locale={locale} />
      )}
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
            {view === "dashboard" ? dt("metrics") : t("results")}
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
          {stale && (data || dashboard) && <p role="status">{t("stale")}</p>}
          {data && <SearchResults data={data} locale={locale} cache={cache} />}
          {dashboard && <DashboardResults data={dashboard} locale={locale} cache={cache} />}
          <div className="search-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={loading || !(data || dashboard) || error === "session"}
              onClick={() => void load(query, true)}
            >
              {t("refresh")}
            </button>
            {view === "search" && (
              <>
                {" "}
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
              </>
            )}
          </div>
        </section>
      </div>
      {confirmation.node}
    </section>
  );
}
