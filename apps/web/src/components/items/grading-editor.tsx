"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { Grading } from "@sammlerraum/contracts/grading";
import { catalogRequest, catalogError } from "../catalog/catalog-client";
export function GradingEditor({
  itemId,
  gradings,
  quantity,
  readOnly,
  onChange,
}: {
  itemId: string;
  gradings: Grading[];
  quantity: number;
  readOnly: boolean;
  onChange: () => Promise<void>;
}) {
  const t = useTranslations("Catalog");
  const [editing, setEditing] = useState<Grading | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || readOnly) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim() || null;
    setBusy(true);
    setError("");
    setStatus("");
    let acknowledged = false;
    try {
      const saved = await catalogRequest<{ grading: Grading }>(
        `/api/v1/items/${itemId}/gradings${editing ? `/${editing.id}` : ""}`,
        editing ? "PUT" : "POST",
        {
          provider: value("provider"),
          grade: value("grade"),
          certificateNo: value("certificateNo"),
          gradedAt: value("gradedAt"),
          verificationUrl: value("verificationUrl"),
          source: value("source"),
          comparableValue: value("comparableValue"),
          comparableScale: value("comparableScale"),
        },
      );
      // Keep the acknowledged identity even if refreshing sibling facts fails.
      setEditing(saved.grading);
      acknowledged = true;
      await onChange();
      setEditing(null);
      setFormKey((value) => value + 1);
      setStatus(t("gradingSaved"));
    } catch (problem) {
      setError(acknowledged ? t("gradingSavedRefreshFailed") : catalogError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  async function remove(grading: Grading) {
    if (busy || !window.confirm(t("removeGradingConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      await catalogRequest(`/api/v1/items/${itemId}/gradings/${grading.id}`, "DELETE");
      if (editing?.id === grading.id) setEditing(null);
      await onChange();
      setStatus(t("gradingRemoved"));
    } catch (problem) {
      setError(catalogError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-card" aria-label={t("gradingSection")}>
      <h2>{t("gradingSection")}</h2>
      <p className="field-help">{t("gradingHelp")}</p>
      {readOnly && <p>{t("readOnly")}</p>}
      {!gradings.length && <p className="empty-state">{t("noGradings")}</p>}
      <ul className="plain-list grading-list">
        {gradings.map((grading) => (
          <li key={grading.id}>
            <div>
              <strong>
                {grading.provider} {grading.grade}
              </strong>
              <dl>
                {grading.certificateNo && (
                  <>
                    <dt>{t("certificate")}</dt>
                    <dd>{grading.certificateNo}</dd>
                  </>
                )}
                {grading.gradedAt && (
                  <>
                    <dt>{t("gradedAt")}</dt>
                    <dd>{grading.gradedAt}</dd>
                  </>
                )}
                {grading.comparableValue && (
                  <>
                    <dt>{t("numericValue")}</dt>
                    <dd>
                      {grading.comparableValue} · {grading.comparableScale}
                    </dd>
                  </>
                )}
                {grading.source && (
                  <>
                    <dt>{t("gradingSource")}</dt>
                    <dd>{grading.source}</dd>
                  </>
                )}
                {grading.verificationUrl && (
                  <>
                    <dt>{t("verificationUrl")}</dt>
                    <dd>
                      <a href={grading.verificationUrl} target="_blank" rel="noopener noreferrer">
                        {t("openReference")}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </div>
            {!readOnly && (
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(grading);
                    setError("");
                    setStatus("");
                  }}
                  aria-label={`${t("editGrading")}: ${grading.provider} ${grading.grade}`}
                >
                  {t("edit")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void remove(grading)}
                  aria-label={`${t("removeGrading")}: ${grading.provider} ${grading.grade}`}
                >
                  {t("remove")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly &&
        (quantity !== 1 ? (
          <p className="notice">{t("splitFirst")}</p>
        ) : (
          <form
            key={editing?.id ?? formKey}
            className="compact-form"
            onSubmit={(event) => void save(event)}
          >
            <h3>{t(editing ? "editGrading" : "addGrading")}</h3>
            <fieldset disabled={busy}>
              <div className="form-row">
                <label>
                  {t("provider")}
                  <input
                    name="provider"
                    maxLength={120}
                    defaultValue={editing?.provider ?? ""}
                    required
                  />
                </label>
                <label>
                  {t("grade")}
                  <input
                    name="grade"
                    maxLength={120}
                    defaultValue={editing?.grade ?? ""}
                    required
                  />
                </label>
              </div>
              <label>
                {t("certificate")}
                <input
                  name="certificateNo"
                  maxLength={160}
                  defaultValue={editing?.certificateNo ?? ""}
                />
              </label>
              <label>
                {t("gradedAt")}
                <input name="gradedAt" type="date" defaultValue={editing?.gradedAt ?? ""} />
              </label>
              <label>
                {t("verificationUrl")}
                <input
                  name="verificationUrl"
                  type="url"
                  maxLength={2048}
                  defaultValue={editing?.verificationUrl ?? ""}
                />
              </label>
              <label>
                {t("gradingSource")}
                <textarea name="source" maxLength={1000} defaultValue={editing?.source ?? ""} />
              </label>
              <details>
                <summary>{t("numericSection")}</summary>
                <p className="field-help">{t("numericHelp")}</p>
                <label>
                  {t("numericValue")}
                  <input
                    name="comparableValue"
                    inputMode="decimal"
                    pattern="(?:0|[1-9][0-9]{0,7})(?:[.][0-9]{1,4})?"
                    defaultValue={editing?.comparableValue ?? ""}
                  />
                </label>
                <label>
                  {t("numericScale")}
                  <input
                    name="comparableScale"
                    maxLength={120}
                    defaultValue={editing?.comparableScale ?? ""}
                  />
                </label>
              </details>
            </fieldset>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                {t("saveGrading")}
              </button>
              {editing && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          </form>
        ))}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
