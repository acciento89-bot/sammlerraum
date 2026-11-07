"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { createCollaborationManagementService } from "@sammlerraum/domain/collaboration/management-service";
import { managementRequest, managementError } from "./management-request";
type Workspace = Awaited<
  ReturnType<ReturnType<typeof createCollaborationManagementService>["getWorkspace"]>
>;
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
    [nodeId, setNodeId] = useState("");
  if (!["OWNER", "ADMIN"].includes(data.actorRole)) return null;
  const node = data.nodes.find((row) => row.id === nodeId);
  async function save(event: FormEvent<HTMLFormElement>, kind: "collection" | "node") {
    event.preventDefault();
    const element = event.currentTarget,
      form = new FormData(element),
      expected = {
        expectedUpdatedAt: data.collection.updatedAt,
        expectedLatestSequence: data.collection.latestSequence,
      },
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
        <form
          className="form-stack"
          onSubmit={(event) => void save(event, "collection")}
          key={`${data.collection.name}-${data.collection.visibility}`}
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
        </form>
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
          <form
            className="form-stack"
            key={nodeId || "new"}
            onSubmit={(event) => void save(event, "node")}
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
          </form>
          {data.moreNodes && <p>{t("moreTargets")}</p>}
        </section>
      </div>
    </details>
  );
}
