"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { RestorableAuditActionFields, type RestoreField } from "@sammlerraum/contracts/restore";
import type { createRestoreService } from "@sammlerraum/domain/audit/restore-service";
import type { createAuditService } from "@sammlerraum/domain/audit/audit-service";
import { CollaborationNavigation } from "./collaboration-navigation";
import { managementRequest, managementError, ManagementProblem } from "./management-request";
type History = Awaited<
  ReturnType<ReturnType<typeof createAuditService>["listAuditEventsForResource"]>
>;
type Preview = Awaited<ReturnType<ReturnType<typeof createRestoreService>["getRestorePreview"]>>;
type Event = History["events"][number] & { resourceName?: string | null };
export function AuditManager({
  locale,
  resourceType = "",
  resourceId = "",
}: {
  locale: string;
  resourceType?: string;
  resourceId?: string;
}) {
  const t = useTranslations("Collaboration"),
    [events, setEvents] = useState<Event[]>([]),
    [next, setNext] = useState<string | null>(null),
    [kind, setKind] = useState(resourceType),
    [id, setId] = useState(resourceId),
    [scope, setScope] = useState({ kind: resourceType, id: resourceId }),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [field, setField] = useState<RestoreField>("visibility");
  const load = useCallback(
    async (cursor?: string) => {
      setBusy(true);
      try {
        const query = new URLSearchParams({
            ...(scope.kind && scope.id ? { resourceType: scope.kind, resourceId: scope.id } : {}),
            ...(cursor ? { beforeSequence: cursor } : {}),
          }),
          value = await managementRequest<History>(`/api/v1/audit?${query}`);
        setEvents((previous) => (cursor ? [...previous, ...value.events] : value.events));
        setNext(value.next);
        setError("");
      } catch (problem) {
        setError(managementError(problem, t));
        setEvents([]);
      } finally {
        setBusy(false);
      }
    },
    [scope, t],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function inspect(event: Event) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const value = await managementRequest<Preview>(`/api/v1/audit/${event.id}/restore`);
      if (!value.supportedFields.length) {
        setStatus(t("unsupportedRestore"));
        setPreview(null);
      } else {
        setPreview(value);
        setField(value.supportedFields[0]!);
      }
    } catch (problem) {
      setError(
        problem instanceof ManagementProblem && problem.code === "RESTORE_UNSUPPORTED"
          ? t("unsupportedRestore")
          : managementError(problem, t),
      );
    } finally {
      setBusy(false);
    }
  }
  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await managementRequest(`/api/v1/audit/${preview.eventId}/restore`, {
        field,
        ...preview.preconditions,
      });
      setPreview(null);
      setStatus(t("restoreSaved"));
      await load();
    } catch (problem) {
      setError(managementError(problem, t));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  function value(raw: unknown) {
    if (raw === null) return t("emptyValue");
    if (typeof raw === "boolean") return raw ? t("yes") : t("no");
    if (typeof raw === "string" && ["PRIVATE", "UNLISTED", "PUBLIC"].includes(raw))
      return t(`visibility${raw}`);
    return typeof raw === "object" ? JSON.stringify(raw) : String(raw);
  }
  return (
    <section className="management-shell">
      <CollaborationNavigation
        locale={locale}
        {...(scope.kind === "COLLECTION" ? { collectionId: scope.id } : {})}
        current="audit"
      />
      <header className="management-heading">
        <h1>{t("auditTitle")}</h1>
        <p>{t("auditIntro")}</p>
      </header>
      <form
        className="management-card form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          setPreview(null);
          setScope({ kind, id });
        }}
      >
        <div className="collaboration-form-row">
          <label>
            {t("resourceKind")}
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                if (!event.target.value) setId("");
              }}
            >
              <option value="">{t("allOwnedHistory")}</option>
              {["COLLECTION", "ITEM", "NODE", "LOCATION", "IMPORT_JOB", "SHARE"].map((type) => (
                <option value={type} key={type}>
                  {t(`resource${type}`)}
                </option>
              ))}
            </select>
          </label>
          {kind && (
            <label>
              {t("resourceId")}
              <input value={id} onChange={(event) => setId(event.target.value)} required />
            </label>
          )}
        </div>
        <button type="submit" disabled={busy}>
          {t("showHistory")}
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {preview && (
        <section className="management-card collaboration-restore" aria-labelledby="restore-title">
          <h2 id="restore-title">{t("restoreTitle")}</h2>
          <p>{t("restoreWarning")}</p>
          <form className="form-stack" onSubmit={restore}>
            <label>
              {t("restoreField")}
              <select
                value={field}
                onChange={(event) => setField(event.target.value as RestoreField)}
              >
                {preview.supportedFields.map((name) => (
                  <option value={name} key={name}>
                    {t(`field${name}`)}
                  </option>
                ))}
              </select>
            </label>
            <dl className="collaboration-comparison">
              <div>
                <dt>{t("currentValue")}</dt>
                <dd>{value(preview.current[field])}</dd>
              </div>
              <div>
                <dt>{t("restoredValue")}</dt>
                <dd>{value(preview.previous[field])}</dd>
              </div>
            </dl>
            <div className="collaboration-form-row">
              <button type="submit" disabled={busy}>
                {t("confirmRestore")}
              </button>
              <button type="button" disabled={busy} onClick={() => setPreview(null)}>
                {t("cancel")}
              </button>
            </div>
          </form>
        </section>
      )}
      <ol className="collaboration-timeline">
        {events.map((event) => (
          <li className="management-card" key={event.id}>
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString(locale)}
            </time>
            <h2>
              {t.has(`action${event.action}`)
                ? t(`action${event.action}`)
                : event.action.toLowerCase().replaceAll("_", " ")}
            </h2>
            {event.resourceName && <p>{event.resourceName}</p>}
            <p>
              {t(`resource${event.resourceType}`)} · {t(`source${event.source}`)}
            </p>
            {Object.hasOwn(RestorableAuditActionFields, event.action) && (
              <button disabled={busy} type="button" onClick={() => void inspect(event)}>
                {t("inspectRestore")}
              </button>
            )}
            <details>
              <summary>{t("changeDetails")}</summary>
              <dl className="collaboration-comparison">
                <div>
                  <dt>{t("before")}</dt>
                  <dd>
                    <pre>{JSON.stringify(event.before, null, 2)}</pre>
                  </dd>
                </div>
                <div>
                  <dt>{t("after")}</dt>
                  <dd>
                    <pre>{JSON.stringify(event.after, null, 2)}</pre>
                  </dd>
                </div>
              </dl>
              <p>
                {t("actor")}:{" "}
                <span className="collaboration-id">{event.actorId ?? t("removedActor")}</span>
              </p>
              <p className="collaboration-id">{event.resourceId}</p>
            </details>
          </li>
        ))}
      </ol>
      {!busy && !events.length && !error && <p>{t("noHistory")}</p>}
      {next && (
        <button disabled={busy} type="button" onClick={() => void load(next)}>
          {t("loadMore")}
        </button>
      )}
    </section>
  );
}
