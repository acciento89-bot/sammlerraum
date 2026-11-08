"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import type { ResolveShareSchema } from "@sammlerraum/contracts/sharing";
import {
  ScopedSearchCapabilitiesSchema,
  ScopedSearchPageSchema,
  parseScopedSearchQuery,
  type ScopedSearchCapabilities,
  type ScopedSearchPage,
} from "@sammlerraum/contracts/scoped-search";
import {
  ScopedDashboardSchema,
  type ScopedDashboard,
} from "@sammlerraum/contracts/scoped-dashboard";
import {
  ScopedSmartCollectionDetailSchema,
  ScopedSmartCollectionListSchema,
  type ScopedSmartCollectionDetail,
} from "@sammlerraum/contracts/smart-collections";
import {
  type SearchLifecycle,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
import { FilterBuilder } from "./filter-builder";
import { fromDraft, toDraft, type DraftNode } from "./filter-draft";
import { scopedFilterAvailable } from "./scoped-capabilities";
import { MetadataCache, RequestChannel } from "./search-state";
import { scopedRequest, ScopedSearchHttpError } from "./scoped-search-client";
import { MoneyConsumerProvider } from "./money-consumer-context";
import { formatDashboardInteger, formatDashboardMoney } from "./dashboard-format";
import { PurchaseCosts } from "./purchase-costs";
export type ScopedPanelTarget =
  | { kind: "MEMBER_COLLECTION"; collectionId: string }
  | { kind: "SHARE"; access: z.infer<typeof ResolveShareSchema> };
export function ScopedSearchPanel({
  locale,
  target,
  initialOpen = false,
  initialSavedId,
}: {
  locale: "de" | "en";
  target: ScopedPanelTarget;
  initialOpen?: boolean;
  initialSavedId?: string | undefined;
}) {
  const t = useTranslations("ScopedSearch"),
    st = useTranslations("Search");
  const [open, setOpen] = useState(initialOpen),
    [caps, setCaps] = useState<ScopedSearchCapabilities | null>(null);
  const [text, setText] = useState(""),
    [draft, setDraft] = useState<DraftNode | null>(null),
    [lifecycle, setLifecycle] = useState<SearchLifecycle>("ALL");
  const [data, setData] = useState<ScopedSearchPage | null>(null),
    [overview, setOverview] = useState<ScopedDashboard | null>(null);
  const [mode, setMode] = useState<"search" | "dashboard">("search"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false),
    [accessError, setAccessError] = useState(false);
  const [dirty, setDirty] = useState(false),
    [name, setName] = useState(""),
    [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<ScopedSmartCollectionDetail[]>([]),
    [savedCursor, setSavedCursor] = useState<string | null>(null);
  const savedRequests = useRef(new RequestChannel());
  const channel = useRef(new RequestChannel()),
    cache = useRef(new MetadataCache()).current;
  const [editingSaved, setEditingSaved] = useState<ScopedSmartCollectionDetail | null>(null);
  const applied = useRef<NormalizedItemSearchQuery | null>(null),
    activeSaved = useRef<{ id: string; revision: number } | null>(null);
  const targetKey = JSON.stringify(target); // dependency identity only; never rendered or persisted.
  const access = target.kind === "SHARE" ? target.access : undefined;
  const integer = (value: string | number) => formatDashboardInteger(String(value), locale);
  function failed(problem: unknown) {
    const code = problem instanceof ScopedSearchHttpError ? problem.code : "SEARCH_UNAVAILABLE";
    setData(null);
    setOverview(null);
    setLoginRequired(code === "UNAUTHORIZED");
    setAccessError(code.startsWith("SHARE_") || code === "SMART_COLLECTION_UNRESOLVABLE");
    setError(
      t(
        code === "UNAUTHORIZED"
          ? "loginRequired"
          : code === "FILTER_UNAVAILABLE"
            ? "unavailable"
            : [
                  "SHARE_PIN_REQUIRED",
                  "SHARE_PIN_INVALID",
                  "SHARE_NOT_FOUND",
                  "SMART_COLLECTION_UNRESOLVABLE",
                ].includes(code)
              ? "openOriginal"
              : ["SHARE_REVOKED", "SHARE_EXPIRED", "MEMBERSHIP_NOT_FOUND"].includes(code)
                ? "gone"
                : "error",
      ),
    );
  }
  function query() {
    return parseScopedSearchQuery({ text, filter: fromDraft(draft), lifecycle });
  }
  async function listSaved(cursor?: string) {
    const request = savedRequests.current.begin();
    try {
      const page = await scopedRequest(
        `/api/v1/scoped-smart-collections${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        undefined,
        ScopedSmartCollectionListSchema,
        request.signal,
      );
      if (!savedRequests.current.current(request.id)) return;
      setSaved((previous) => (cursor ? [...previous, ...page.items] : page.items));
      setSavedCursor(page.nextCursor);
    } catch (problem) {
      if (
        savedRequests.current.current(request.id) &&
        !(problem instanceof ScopedSearchHttpError && problem.code === "UNAUTHORIZED")
      )
        setNotice(t("savedUnavailable"));
    }
  }
  async function run(
    next: NormalizedItemSearchQuery,
    nextMode = mode,
    append = false,
    savedId: { id: string; revision: number } | null = null,
  ) {
    const request = channel.current.begin();
    setBusy(true);
    setError("");
    setNotice("");
    if (!append) {
      setData(null);
      setOverview(null);
    }
    try {
      if (caps && !scopedFilterAvailable(next.filter, caps)) {
        setError(t("unavailable"));
        setData(null);
        setOverview(null);
        return;
      }
      if (nextMode === "dashboard") {
        const result = await scopedRequest(
          "/api/v1/dashboard/scoped",
          {
            target,
            query: {
              text: next.text,
              f: next.filter ? JSON.stringify(next.filter) : null,
              lifecycle: next.lifecycle,
            },
          },
          ScopedDashboardSchema,
          request.signal,
        );
        if (channel.current.current(request.id)) {
          setOverview(result);
          setData(null);
        }
      } else {
        const result = savedId
          ? await scopedRequest(
              `/api/v1/scoped-smart-collections/${savedId.id}/items`,
              {
                page: {
                  expectedRevision: savedId.revision,
                  limit: next.limit,
                  ...(next.cursor ? { cursor: next.cursor } : {}),
                },
                ...(access ? { access } : {}),
              },
              ScopedSearchPageSchema,
              request.signal,
            )
          : await scopedRequest(
              "/api/v1/search/scoped",
              {
                target,
                query: {
                  text: next.text,
                  f: next.filter ? JSON.stringify(next.filter) : null,
                  lifecycle: next.lifecycle,
                  limit: next.limit,
                  ...(next.cursor ? { cursor: next.cursor } : {}),
                },
              },
              ScopedSearchPageSchema,
              request.signal,
            );
        if (channel.current.current(request.id))
          setData((previous) =>
            append && previous
              ? { ...result, items: [...previous.items, ...result.items] }
              : result,
          );
      }
      if (channel.current.current(request.id)) {
        applied.current = next;
        activeSaved.current = savedId;
        setDirty(false);
      }
    } catch (problem) {
      if (channel.current.current(request.id)) failed(problem);
    } finally {
      if (channel.current.current(request.id)) setBusy(false);
    }
  }
  async function loadSaved(id: string) {
    const request = channel.current.begin();
    setBusy(true);
    setError("");
    try {
      const entry = await scopedRequest(
        `/api/v1/scoped-smart-collections/${id}`,
        undefined,
        ScopedSmartCollectionDetailSchema,
        request.signal,
      );
      if (!channel.current.current(request.id)) return;
      if (caps && JSON.stringify(entry.definition.scope) !== JSON.stringify(caps.reference))
        throw new ScopedSearchHttpError("SMART_COLLECTION_UNRESOLVABLE");
      const next = parseScopedSearchQuery({
        text: entry.definition.text,
        filter: entry.definition.filter,
        lifecycle: entry.definition.lifecycle,
      });
      setText(next.text);
      setDraft(toDraft(next.filter));
      setLifecycle(next.lifecycle);
      setName(entry.name);
      setEditingSaved(entry);
      setMode("search");
      await run(next, "search", false, { id, revision: entry.revision });
    } catch (problem) {
      if (channel.current.current(request.id)) {
        failed(problem);
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    channel.current.cancel();
    savedRequests.current.cancel();
    setCaps(null);
    setData(null);
    setOverview(null);
    setError("");
    setSaved([]);
    setSavedCursor(null);
    if (!open) return;
    const request = channel.current.begin();
    setBusy(true);
    void scopedRequest(
      "/api/v1/search/scoped/capabilities",
      { target },
      ScopedSearchCapabilitiesSchema,
      request.signal,
    )
      .then(async (current) => {
        if (!channel.current.current(request.id)) return;
        setCaps(current);
        void listSaved();
        if (initialSavedId) await loadSaved(initialSavedId);
        else
          await run(
            parseScopedSearchQuery({ text, filter: fromDraft(draft), lifecycle }),
            "search",
          );
      })
      .catch((problem) => {
        if (channel.current.current(request.id)) failed(problem);
      })
      .finally(() => {
        if (channel.current.current(request.id)) setBusy(false);
      });
    return () => {
      channel.current.cancel();
      savedRequests.current.cancel();
    };
    // Only explicit opening/target changes reauthorize; draft edits do not execute requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetKey, initialSavedId]);
  async function apply(event: FormEvent) {
    event.preventDefault();
    try {
      activeSaved.current = null;
      await run(query());
    } catch (problem) {
      failed(problem);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!caps) return;
    const request = channel.current.begin();
    try {
      const next = query();
      if (!scopedFilterAvailable(next.filter, caps)) {
        setError(t("unavailable"));
        return;
      }
      setBusy(true);
      setError("");
      const stored = await scopedRequest(
        editingSaved
          ? `/api/v1/scoped-smart-collections/${editingSaved.id}`
          : "/api/v1/scoped-smart-collections",
        {
          mutation: {
            name,
            ...(editingSaved ? { expectedRevision: editingSaved.revision } : {}),
            definition: {
              version: 2,
              scope: caps.reference,
              text: next.text,
              filter: next.filter,
              lifecycle: next.lifecycle,
            },
          },
          ...(access ? { access } : {}),
        },
        ScopedSmartCollectionDetailSchema,
        request.signal,
        editingSaved ? "PATCH" : "POST",
      );
      if (!channel.current.current(request.id)) return;
      setEditingSaved(stored);
      setNotice(t("saved"));
      await listSaved();
    } catch (problem) {
      if (channel.current.current(request.id)) failed(problem);
    } finally {
      if (channel.current.current(request.id)) setBusy(false);
    }
  }
  const selectedSaved = saved.filter(
    (entry) => caps && JSON.stringify(entry.definition.scope) === JSON.stringify(caps.reference),
  );
  return (
    <section
      className="management-card scoped-search-panel"
      data-testid="scoped-search-panel"
      aria-busy={busy}
    >
      <div className="scoped-search-heading">
        <h2>{t("title")}</h2>
        <button
          type="button"
          className="secondary-button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t("close") : t("open")}
        </button>
      </div>
      {open && (
        <>
          <p>{t("intro")}</p>
          {error && (
            <p role="alert">
              {error} {loginRequired && <a href={`/${locale}/login`}>{t("login")}</a>}
              {accessError &&
                target.kind === "SHARE" &&
                ("shareId" in target.access ? (
                  <a href={`/share/${target.access.shareId}`}>{t("openShare")}</a>
                ) : (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => window.location.reload()}
                  >
                    {t("reopen")}
                  </button>
                ))}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {caps && (
            <MoneyConsumerProvider enabled={caps.canonicalMoneyEnabled}>
              <p className="shared-badge">{t(`scopes.${caps.scope}`)}</p>
              <form className="form-stack" onSubmit={apply}>
                <label>
                  {t("text")}
                  <input
                    type="search"
                    value={text}
                    maxLength={200}
                    onChange={(event) => {
                      setText(event.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                {caps.scope !== "SHARE" && (
                  <label>
                    {st("lifecycle")}
                    <select
                      value={lifecycle}
                      onChange={(event) => {
                        setLifecycle(event.target.value as SearchLifecycle);
                        setDirty(true);
                      }}
                    >
                      {["ALL", "ACTIVE", "ARCHIVED", "DISPOSED"].map((value) => (
                        <option key={value} value={value}>
                          {st(`lifecycles.${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <FilterBuilder
                  value={draft}
                  onChange={(next) => {
                    setDraft(next);
                    setDirty(true);
                  }}
                  locale={locale}
                  cache={cache}
                  capabilities={caps}
                  helpText={t("filterHelp")}
                />
                <div className="search-actions">
                  <button type="submit" className="primary-button" disabled={busy}>
                    {t("apply")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      const nextMode = mode === "search" ? "dashboard" : "search";
                      setMode(nextMode);
                      try {
                        void run(query(), nextMode);
                      } catch (problem) {
                        failed(problem);
                      }
                    }}
                  >
                    {mode === "search" ? t("overview") : t("results")}
                  </button>
                </div>
              </form>
              {dirty && <p role="status">{t("draftChanged")}</p>}
              {data && (
                <section aria-label={t("results")}>
                  <p role="status">
                    {t("count", { count: integer(data.total), itemCount: data.total })}
                  </p>
                  <ul className="scoped-result-list">
                    {data.items.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        <span>{t("quantity", { count: integer(item.quantity) })}</span>
                      </li>
                    ))}
                  </ul>
                  {!data.items.length && <p>{t("empty")}</p>}
                  {data.nextCursor && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy || dirty}
                      onClick={() =>
                        applied.current &&
                        void run(
                          { ...applied.current, cursor: data.nextCursor! },
                          "search",
                          true,
                          activeSaved.current,
                        )
                      }
                    >
                      {t("more")}
                    </button>
                  )}
                </section>
              )}
              {overview && (
                <section aria-label={t("overview")}>
                  <h3>{t("overview")}</h3>
                  <p>
                    {t("summary", {
                      items: integer(overview.selection.itemCount),
                      itemCount: overview.selection.itemCount,
                      units: integer(overview.selection.unitCount),
                    })}
                  </p>
                  {overview.values.state === "UNAVAILABLE" ? (
                    <p>{t("valuesUnavailable")}</p>
                  ) : (
                    <>
                      <h4>{t("manual")}</h4>
                      <p>{t(`manualStates.${overview.values.manual.state}`)}</p>
                      <ul>
                        {overview.values.manual.groups.map((group) => (
                          <li key={`${group.currency}:${group.minorUnitExponent}`}>
                            {formatDashboardMoney(
                              group.totalMinor,
                              group.minorUnitExponent,
                              locale,
                            )}{" "}
                            {group.currency}
                          </li>
                        ))}
                      </ul>
                      {"coverage" in overview.values.purchase ? (
                        <PurchaseCosts data={overview.values.purchase} locale={locale} />
                      ) : (
                        <p>{t("purchaseUnavailable")}</p>
                      )}
                    </>
                  )}
                </section>
              )}
              <form className="scoped-save-form" onSubmit={save}>
                <label>
                  {t("saveName")}
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <button type="submit" className="secondary-button" disabled={busy}>
                  {t("save")}
                </button>
              </form>
              {!!selectedSaved.length && (
                <section>
                  <h3>{t("savedTitle")}</h3>
                  <ul className="scoped-saved-list">
                    {selectedSaved.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => void loadSaved(entry.id)}
                        >
                          {entry.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {savedCursor && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void listSaved(savedCursor)}
                >
                  {t("moreSaved")}
                </button>
              )}
            </MoneyConsumerProvider>
          )}
          {busy && <p role="status">{t("loading")}</p>}
        </>
      )}
    </section>
  );
}
