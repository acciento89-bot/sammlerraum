"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { communityRequest, communityError } from "./community-request";
export type ReportTarget = { type: "USER" | "COMMENT"; id: string };
export function ReportDialog({
  target,
  onClose,
  onSaved,
}: {
  target: ReportTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Community"),
    ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await communityRequest("/api/v1/community/reports", {
        method: "POST",
        body: {
          type: target.type,
          ...(target.type === "USER" ? { userId: target.id } : { commentId: target.id }),
          category: String(form.get("category")),
          reason: String(form.get("reason")),
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="community-dialog"
      onCancel={onClose}
      aria-labelledby="community-report-title"
    >
      <form onSubmit={submit}>
        <p className="eyebrow">{t("moderation")}</p>
        <h2 id="community-report-title">{t("reportTitle")}</h2>
        <p>{t("reportIntro")}</p>
        <label>
          {t("category")}
          <select name="category" required>
            {["SPAM", "HARASSMENT", "ILLEGAL_CONTENT", "OTHER"].map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("reason")}
          <textarea name="reason" required maxLength={2000} rows={4} />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button disabled={busy} type="submit">
            {t("submitReport")}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
