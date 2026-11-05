"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { containDialogTab } from "./dialog-keyboard";

export function useSavedConfirmation(dirty: boolean) {
  const t = useTranslations("SavedSearches"),
    router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null),
    action = useRef<(() => void) | null>(null),
    opener = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false),
    allow = useRef(false),
    dirtyRef = useRef(dirty),
    guard = useRef<string | null>(null),
    restoring = useRef(false);
  dirtyRef.current = dirty;
  function confirm(next: () => void) {
    opener.current = document.activeElement as HTMLElement;
    action.current = next;
    setPending(true);
  }
  useEffect(() => {
    if (pending) dialog.current?.showModal();
    else dialog.current?.close();
  }, [pending]);
  useEffect(() => {
    if (dirty && !guard.current && !allow.current) {
      const token = crypto.randomUUID();
      guard.current = token;
      // Keep the immediately previous history entry on the same mounted editor.
      // Next may consume a traversal before a component-level pop listener runs.
      // This extra entry prevents it from replacing a meaningful draft first.
      window.history.pushState(
        { ...window.history.state, sammlerraumSavedGuard: token },
        "",
        window.location.href,
      );
    } else if (
      !dirty &&
      guard.current &&
      window.history.state?.sammlerraumSavedGuard === guard.current
    ) {
      guard.current = null;
      restoring.current = true;
      window.history.back();
    }
  }, [dirty]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (
        !dirtyRef.current ||
        allow.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.download) return;
      const next = new URL(link.href, window.location.href);
      if (
        next.origin !== window.location.origin ||
        (next.pathname === window.location.pathname && next.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      confirm(() => {
        allow.current = true;
        router.push(next.pathname + next.search + next.hash);
      });
    };
    const pop = () => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      if (
        !dirtyRef.current ||
        allow.current ||
        !guard.current ||
        window.history.state?.sammlerraumSavedGuard === guard.current
      )
        return;
      restoring.current = true;
      window.history.forward();
      confirm(() => {
        allow.current = true;
        guard.current = null;
        window.history.go(-2);
      });
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && !allow.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const clear = () => {
      action.current = null;
      setPending(false);
      allow.current = false;
    };
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("sammlerraum:search-cleared", clear);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("sammlerraum:search-cleared", clear);
    };
  }, [router]);
  const node = (
    <dialog
      ref={dialog}
      className="search-confirm"
      aria-labelledby="saved-discard-title"
      onKeyDown={containDialogTab}
      onCancel={() => {
        action.current = null;
        setPending(false);
      }}
      onClose={() => opener.current?.focus()}
    >
      <h2 id="saved-discard-title">{t("discardTitle")}</h2>
      <p>{t("discardHelp")}</p>
      <div className="search-actions">
        <button
          autoFocus
          className="secondary-button"
          onClick={() => {
            action.current = null;
            setPending(false);
          }}
        >
          {t("cancel")}
        </button>
        <button
          onClick={() => {
            const next = action.current;
            action.current = null;
            setPending(false);
            next?.();
          }}
        >
          {t("discard")}
        </button>
      </div>
    </dialog>
  );
  function allowNavigation() {
    allow.current = true;
    guard.current = null;
    restoring.current = false;
  }
  return { confirm, node, allowNavigation };
}
