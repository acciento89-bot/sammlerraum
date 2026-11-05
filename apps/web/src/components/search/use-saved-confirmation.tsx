"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { containDialogTab } from "./dialog-keyboard";

export function useSavedConfirmation(dirty: boolean, suspend?: () => false | void | (() => void)) {
  const t = useTranslations("SavedSearches"),
    router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null),
    action = useRef<(() => void) | null>(null),
    opener = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false),
    allow = useRef(false),
    dirtyRef = useRef(dirty),
    guard = useRef<string | null>(null),
    restoring = useRef(false),
    active = useRef(true),
    expired = useRef(false),
    pendingExit = useRef<(() => void) | null>(null),
    suspendCurrent = useRef(suspend),
    resume = useRef<(() => void) | null>(null);
  suspendCurrent.current = suspend;
  dirtyRef.current = dirty;
  function navigate(next: () => void) {
    allow.current = true;
    const remove = guard.current && window.history.state?.sammlerraumSavedGuard === guard.current;
    guard.current = null;
    if (!remove) {
      next();
      return;
    }
    // Traverse to the real editor entry, then let the new navigation truncate
    // the synthetic forward entry. Merely unmounting leaves a phantom Back step.
    restoring.current = true;
    const finish = () => {
      pendingExit.current = null;
      queueMicrotask(() => {
        if (active.current && !expired.current) next();
      });
    };
    pendingExit.current = finish;
    window.addEventListener("popstate", finish, { once: true });
    window.history.back();
  }
  function confirm(next: () => void) {
    if (expired.current) return;
    const restore = suspendCurrent.current?.();
    // A pending write cannot be safely abandoned through a second modal.
    if (restore === false) return;
    resume.current = typeof restore === "function" ? restore : null;
    opener.current = document.activeElement as HTMLElement;
    action.current = next;
    setPending(true);
  }
  function cancel() {
    const restore = resume.current;
    resume.current = null;
    action.current = null;
    dialog.current?.close();
    setPending(false);
    restore?.();
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
    active.current = true;
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
      confirm(() => navigate(() => router.push(next.pathname + next.search + next.hash)));
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
      expired.current = true;
      resume.current = null;
      if (pendingExit.current) window.removeEventListener("popstate", pendingExit.current);
      pendingExit.current = null;
      action.current = null;
      setPending(false);
      allow.current = false;
    };
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("sammlerraum:search-cleared", clear);
    return () => {
      active.current = false;
      resume.current = null;
      if (pendingExit.current) window.removeEventListener("popstate", pendingExit.current);
      pendingExit.current = null;
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
      onCancel={cancel}
      onClose={() => opener.current?.focus()}
    >
      <h2 id="saved-discard-title">{t("discardTitle")}</h2>
      <p>{t("discardHelp")}</p>
      <div className="search-actions">
        <button autoFocus className="secondary-button" onClick={cancel}>
          {t("cancel")}
        </button>
        <button
          onClick={() => {
            const next = action.current;
            action.current = null;
            resume.current = null;
            dialog.current?.close();
            setPending(false);
            next?.();
          }}
        >
          {t("discard")}
        </button>
      </div>
    </dialog>
  );
  return { confirm, node, navigateAfterGuard: navigate };
}
