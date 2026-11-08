"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CollectorNavigation } from "./collector-navigation";
import {
  listSavedSearches,
  deleteSavedSearch,
  SavedMutationUnknownError,
  type SavedPage,
} from "./smart-collections-client";
import { SearchHttpError } from "./search-client";
import { RequestChannel } from "./search-state";
import { containDialogTab } from "./dialog-keyboard";

type Summary = SavedPage["items"][number];
export function SavedSearchList({ locale, actor }: { locale: "de" | "en"; actor: string }) {
  const t = useTranslations("SavedSearches"),
    read = useRef(new RequestChannel()),
    write = useRef(new RequestChannel());
  const [page, setPage] = useState<SavedPage | null>(null),
    [cursor, setCursor] = useState<string>(),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<Summary | null>(null),
    [unknown, setUnknown] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async (next?: string) => {
    if (read.current.closed) return;
    const request = read.current.begin();
    setLoading(true);
    setPage(null);
    setCursor(next);
    setError("");
    try {
      const result = await listSavedSearches(request.signal, next);
      if (read.current.current(request.id)) {
        setPage(result);
        setLoading(false);
      }
    } catch (problem) {
      if (read.current.current(request.id)) {
        setLoading(false);
        setError(
          problem instanceof SearchHttpError && problem.status === 401 ? "session" : "failed",
        );
      }
    }
  }, []);
  useEffect(() => {
    void load();
    const clear = () => {
      read.current.close();
      write.current.close();
      setPage(null);
      setSelected(null);
      setUnknown(false);
      setBusy(false);
      setLoading(false);
      setError("session");
      dialog.current?.close();
    };
    window.addEventListener("sammlerraum:search-cleared", clear);
    return () => {
      read.current.cancel();
      write.current.cancel();
      window.removeEventListener("sammlerraum:search-cleared", clear);
    };
  }, [actor, load]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  async function remove() {
    if (!selected || busy || unknown || write.current.closed) return;
    const request = write.current.begin();
    setBusy(true);
    setError("");
    read.current.cancel();
    setPage(null);
    try {
      await deleteSavedSearch(selected.id, selected.revision, request.signal);
      if (!write.current.current(request.id)) return;
      setSelected(null);
      setBusy(false);
      await load();
    } catch (problem) {
      if (!write.current.current(request.id)) return;
      setBusy(false);
      if (problem instanceof SavedMutationUnknownError) setUnknown(true);
      else
        setError(
          problem instanceof SearchHttpError && problem.status === 409
            ? "conflict"
            : problem instanceof SearchHttpError && problem.status === 404
              ? "notFound"
              : "failed",
        );
    }
  }
  return (
    <section className="management-shell search-shell">
      <CollectorNavigation locale={locale} current="saved" />
      <header className="management-heading">
        <h1>{t("title")}</h1>
        <p>{t("liveHelp")}</p>
        <Link href={`/${locale}/search`} prefetch={false}>
          {t("newSearch")}
        </Link>
      </header>
      {loading && <p role="status">{t("loading")}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {error === "session" ? (
        <Link href={`/${locale}/login`} prefetch={false}>
          {t("signIn")}
        </Link>
      ) : (
        <button
          className="secondary-button"
          disabled={loading || busy}
          onClick={() => void load(cursor)}
        >
          {t("refresh")}
        </button>
      )}
      {page && (
        <>
          <p>{t("total", { count: page.total })}</p>
          {!page.items.length && <p>{t("empty")}</p>}
          <ul className="search-results">
            {page.items.map((row) => (
              <li className="management-card" key={row.id}>
                <h2>
                  <Link href={`/${locale}/smart-collections/${row.id}`} prefetch={false}>
                    {row.name}
                  </Link>
                </h2>
                <p>{t("revision", { revision: row.revision })}</p>
                <button
                  className="secondary-button"
                  onClick={(e) => {
                    opener.current = e.currentTarget;
                    setUnknown(false);
                    setSelected(row);
                  }}
                >
                  {t("delete")}
                </button>
              </li>
            ))}
          </ul>
          <div className="search-actions">
            <button disabled={!cursor || loading} onClick={() => void load()}>
              {t("firstPage")}
            </button>
            <button
              disabled={!page.nextCursor || loading}
              onClick={() => void load(page.nextCursor ?? undefined)}
            >
              {t("nextPage")}
            </button>
          </div>
        </>
      )}
      <dialog
        className="search-confirm"
        ref={dialog}
        aria-labelledby="saved-delete-title"
        onKeyDown={containDialogTab}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setSelected(null);
        }}
        onClose={() => opener.current?.focus()}
      >
        <h2 id="saved-delete-title">{t("deleteTitle")}</h2>
        <p>{t("deletePrompt", { name: selected?.name ?? "" })}</p>
        <p>{t("deleteHelp")}</p>
        {unknown && <p role="alert">{t("unknownDelete")}</p>}
        {error && <p role="alert">{t(error)}</p>}
        <div className="search-actions">
          <button
            autoFocus
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              if (unknown) void load();
            }}
          >
            {t("cancel")}
          </button>
          <button
            disabled={busy || unknown || error === "conflict" || error === "notFound"}
            onClick={() => void remove()}
          >
            {t("delete")}
          </button>
        </div>
      </dialog>
    </section>
  );
}
