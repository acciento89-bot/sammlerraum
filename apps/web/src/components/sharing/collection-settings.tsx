"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { createCollaborationManagementService } from "@sammlerraum/domain/collaboration/management-service";
import { managementRequest, managementError } from "./management-request";
type Workspace = Awaited<
  ReturnType<ReturnType<typeof createCollaborationManagementService>["getWorkspace"]>
>;
type Confirmation = { expectedUpdatedAt: string; expectedLatestSequence: string | null };
/** A background workspace refresh must never renew an unsaved draft's confirmation. */
function DraftForm({
  version,
  onSubmit,
  children,
}: {
  version: Workspace["collection"];
  onSubmit: (event: FormEvent<HTMLFormElement>, expected: Confirmation) => void;
  children: ReactNode;
}) {
  const [expected] = useState<Confirmation>(() => ({
    expectedUpdatedAt: version.updatedAt,
    expectedLatestSequence: version.latestSequence,
  }));
  return (
    <form className="form-stack" onSubmit={(event) => onSubmit(event, expected)}>
      {children}
    </form>
  );
}
export function CollectionSettings({
  data,
  onSaved,
}: {
  data: Workspace;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("Collaboration"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [nodeId, setNodeId] = useState(""),
    [savedRevision, setSavedRevision] = useState(0);
  if (!["OWNER", "ADMIN"].includes(data.actorRole)) return null;
  const node = data.nodes.find((row) => row.id === nodeId);
  async function save(
    event: FormEvent<HTMLFormElement>,
    kind: "collection" | "node",
    expected: Confirmation,
  ) {
    event.preventDefault();
    const element = event.currentTarget,
      form = new FormData(element),
      changes = { name: String(form.get("name")), visibility: String(form.get("visibility")) };
    setBusy(true);
    setError("");
    try {
      await managementRequest(
        `/api/v1/collections/${data.collection.id}/workspace/${kind === "collection" ? "settings" : `nodes${nodeId ? `/${nodeId}` : ""}`}`,
        kind === "collection"
          ? { changes, ...expected }
          : nodeId
            ? {
                changes: { ...changes, parentId: String(form.get("parentId")) || null },
                ...expected,
              }
            : { node: { ...changes, parentId: String(form.get("parentId")) || null }, ...expected },
      );
      setNodeId("");
      if (kind === "node") element.reset();
      await onSaved();
      setSavedRevision((value) => value + 1);
      setStatus(t("collectionSettingsSaved"));
    } catch (problem) {
      setError(managementError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="management-card wide">
      <summary>{t("collectionSettings")}</summary>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <div className="management-grid">
        <DraftForm
          version={data.collection}
          onSubmit={(event, expected) => void save(event, "collection", expected)}
          key={`collection-${data.collection.id}-${savedRevision}`}
        >
          <h2>{t("collectionDetails")}</h2>
          <label>
            {t("collectionName")}
            <input name="name" required maxLength={120} defaultValue={data.collection.name} />
          </label>
          <label>
            {t("collectionVisibility")}
            <select name="visibility" defaultValue={data.collection.visibility}>
              {["PRIVATE", "UNLISTED", "PUBLIC"].map((value) => (
                <option value={value} key={value}>
                  {t(`visibility${value}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>
            {t("saveCollection")}
          </button>
        </DraftForm>
        <section>
          <h2>{t("manageNodes")}</h2>
          <label>
            {t("chooseNode")}
            <select value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
              <option value="">{t("newNode")}</option>
              {data.nodes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <DraftForm
            version={data.collection}
            key={`node-${nodeId || "new"}-${savedRevision}`}
            onSubmit={(event, expected) => void save(event, "node", expected)}
          >
            <label>
              {t("nodeName")}
              <input name="name" maxLength={120} required defaultValue={node?.name ?? ""} />
            </label>
            <label>
              {t("nodeParent")}
              <input
                name="parentId"
                list="admin-parent-nodes"
                defaultValue={node?.parentId ?? ""}
              />
              <datalist id="admin-parent-nodes">
                {data.nodes
                  .filter((row) => row.id !== nodeId)
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name}
                    </option>
                  ))}
              </datalist>
            </label>
            <label>
              {t("nodeVisibility")}
              <select name="visibility" defaultValue={node?.visibility ?? "PRIVATE"}>
                {["PRIVATE", "UNLISTED", "PUBLIC"].map((value) => (
                  <option key={value} value={value}>
                    {t(`visibility${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>
              {t("saveNode")}
            </button>
          </DraftForm>
          {data.moreNodes && <p>{t("moreTargets")}</p>}
        </section>
      </div>
    </details>
  );
}
