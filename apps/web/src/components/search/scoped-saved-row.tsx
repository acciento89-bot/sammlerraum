"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import type { ScopedSmartCollectionDetail } from "@sammlerraum/contracts/smart-collections";
import { scopedRequest } from "./scoped-search-client";
const Removed = z.object({ id: z.uuid(), revision: z.number().int().positive() }).strict();
/** Only the caller's symbolic saved record is deleted; current scope access is unnecessary. */
export function ScopedSavedRow({
  entry,
  onOpen,
  onRemoved,
  disabled = false,
  scopeLabel,
}: {
  entry: ScopedSmartCollectionDetail;
  onOpen: () => void;
  onRemoved: () => void;
  disabled?: boolean;
  scopeLabel?: string | undefined;
}) {
  const t = useTranslations("ScopedSearch");
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const ref = entry.definition.scope;
  const discriminator = (ref.kind === "SHARE" ? ref.shareId : ref.collectionId).slice(0, 8);
  async function remove() {
    setBusy(true);
    setError(false);
    try {
      await scopedRequest(
        `/api/v1/smart-collections/${entry.id}`,
        { expectedRevision: entry.revision },
        Removed,
        undefined,
        "DELETE",
      );
      onRemoved();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li>
      <button
        type="button"
        className="secondary-button"
        disabled={busy || disabled}
        onClick={onOpen}
      >
        {entry.name}
      </button>
      <span>
        {scopeLabel ?? t(ref.kind === "SHARE" ? "savedShareScope" : "savedMemberScope")} ·{" "}
        {discriminator}
      </span>
      <button
        type="button"
        className="danger-button"
        disabled={busy || disabled}
        onClick={() => setConfirm(true)}
      >
        {t("deleteView")}
      </button>
      {confirm && (
        <div role="group" aria-label={t("deleteView")}>
          <p>{t("deleteViewPrompt", { name: entry.name })}</p>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={() => void remove()}
          >
            {t("confirmDeleteView")}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            {t("cancelDeleteView")}
          </button>
        </div>
      )}
      {error && <p role="alert">{t("deleteViewFailed")}</p>}
    </li>
  );
}
