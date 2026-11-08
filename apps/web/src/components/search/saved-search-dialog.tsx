"use client";
import { rememberSavedAcknowledgement, clearSavedAcknowledgements } from "./saved-acknowledgements";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ItemFilterNode } from "@sammlerraum/contracts/search";
import type { NormalizedItemSearchQuery } from "@sammlerraum/contracts/item-search";
import {
  SavedMutationUnknownError,
  createSavedSearch,
  type SavedDetail,
} from "./smart-collections-client";
import { SearchHttpError } from "./search-client";
import { RequestChannel } from "./search-state";
import { SearchLabel } from "./search-label";
import { containDialogTab } from "./dialog-keyboard";

function clauses(node: ItemFilterNode): number {
  return node.kind === "and" || node.kind === "or"
    ? node.children.reduce((sum, child) => sum + clauses(child), 0)
    : node.kind === "not"
      ? clauses(node.child)
      : 1;
}

export function SavedSearchDialog({
  open,
  onClose,
  locale,
  query,
  actor,
  initialName = "",
  modalRef,
  onCreated,
  onProtectionChange,
}: {
  open: boolean;
  onClose: () => void;
  locale: "de" | "en";
  query: NormalizedItemSearchQuery;
  actor: string;
  initialName?: string;
  modalRef?: RefObject<HTMLDialogElement | null>;
  onCreated?: (detail: SavedDetail) => void;
  onProtectionChange?: (needed: boolean) => void;
}) {
  const search = useTranslations("Search");
  const t = useTranslations("SavedSearches"),
    router = useRouter();
  const nameInput = useRef<HTMLInputElement>(null);
  const internalDialog = useRef<HTMLDialogElement>(null);
  const dialog = modalRef ?? internalDialog;
  const channel = useRef(new RequestChannel());
  const [submittedQuery, setSubmittedQuery] = useState<NormalizedItemSearchQuery | null>(null);
  const shownQuery = submittedQuery ?? query;
  const [name, setName] = useState(initialName),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [unknown, setUnknown] = useState(false),
    [ack, setAck] = useState<SavedDetail | null>(null);
  useLayoutEffect(() => {
    onProtectionChange?.(busy || unknown);
  }, [busy, unknown, onProtectionChange]);
  useEffect(() => () => onProtectionChange?.(false), [onProtectionChange]);
  useEffect(() => {
    const close = () => {
      channel.current.close();
      clearSavedAcknowledgements();
      setName("");
      setSubmittedQuery(null);
      setAck(null);
      setUnknown(false);
      setBusy(false);
      setError("session");
      dialog.current?.close();
      onClose();
    };
    window.addEventListener("sammlerraum:search-cleared", close);
    return () => {
      channel.current.cancel();
      window.removeEventListener("sammlerraum:search-cleared", close);
    };
  }, [actor]);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      nameInput.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  async function submit() {
    if (busy || unknown || ack || channel.current.closed) return;
    const request = channel.current.begin();
    setBusy(true);
    setError("");
    try {
      const submitted = structuredClone(query);
      setSubmittedQuery(submitted);
      const detail = await createSavedSearch(name, submitted, request.signal);
      if (!channel.current.current(request.id)) return;
      // Keep the acknowledged identity/revision even if the following navigation fails.
      rememberSavedAcknowledgement(actor, detail);
      setAck(detail);
      setBusy(false);
      if (onCreated) onCreated(detail);
      else router.push(`/${locale}/smart-collections/${detail.id}`);
    } catch (problem) {
      if (!channel.current.current(request.id)) return;
      setBusy(false);
      if (problem instanceof SavedMutationUnknownError) setUnknown(true);
      else {
        setSubmittedQuery(null);
        setError(
          problem instanceof SearchHttpError && problem.status === 401 ? "session" : "invalid",
        );
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-busy={busy}
      onKeyDown={containDialogTab}
      aria-labelledby="save-search-title"
      className="search-confirm"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClose={() => {
        if (open && !busy) onClose();
      }}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="save-search-title">{t("create")}</h2>
        <p>{t("liveHelp")}</p>
        <dl>
          <div>
            <dt>{search("text")}</dt>
            <dd>{shownQuery.text || t("allText")}</dd>
          </div>
          <div>
            <dt>{search("lifecycle")}</dt>
            <dd>{search(`lifecycles.${shownQuery.lifecycle}`)}</dd>
          </div>
          <div>
            <dt>{t("conditions")}</dt>
            <dd>{shownQuery.filter ? clauses(shownQuery.filter.root) : 0}</dd>
          </div>
        </dl>
        <SearchLabel>
          {t("name")}
          <input
            ref={nameInput}
            value={name}
            required
            maxLength={100}
            disabled={busy || !!ack || unknown}
            onChange={(e) => setName(e.target.value)}
          />
        </SearchLabel>
        {error && <p role="alert">{t(error)}</p>}
        {unknown && (
          <div role="alert">
            <p>{t("unknownCreate")}</p>
            <Link href={`/${locale}/smart-collections`} prefetch={false}>
              {t("inspectList")}
            </Link>
          </div>
        )}
        {ack && (
          <div role="status">
            <p>{t("ack", { revision: ack.revision })}</p>
            <Link href={`/${locale}/smart-collections/${ack.id}`} prefetch={false}>
              {t("open")}
            </Link>
          </div>
        )}
        <div className="search-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy || unknown || !!ack || !name.trim()}>
            {busy ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
