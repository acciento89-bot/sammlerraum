"use client";
import { CollectionSettings } from "./collection-settings";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { createCollaborationManagementService } from "@sammlerraum/domain/collaboration/management-service";
import { CollaborationNavigation } from "./collaboration-navigation";
import { managementRequest, managementError } from "./management-request";
type Workspace = Awaited<
  ReturnType<ReturnType<typeof createCollaborationManagementService>["getWorkspace"]>
>;
type Item = Workspace["items"][number];
export function CollaborativeWorkspace({
  locale,
  collectionId,
}: {
  locale: string;
  collectionId: string;
}) {
  const t = useTranslations("Collaboration"),
    [data, setData] = useState<Workspace | null>(null),
    [editing, setEditing] = useState<Item | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    formRef = useRef<HTMLFormElement>(null);
  const load = useCallback(
    async (after?: string) => {
      try {
        const value = await managementRequest<Workspace>(
          `/api/v1/collections/${collectionId}/workspace${after ? `?afterItemId=${after}` : ""}`,
        );
        setData((previous) =>
          after && previous ? { ...value, items: [...previous.items, ...value.items] } : value,
        );
        setError("");
      } catch (problem) {
        setData(null);
        setError(managementError(problem, t));
      }
    },
    [collectionId, t],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ block: "start" });
  }, [editing]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget,
      form = new FormData(element),
      changes = {
        title: String(form.get("title")),
        publicDescription: String(form.get("description")) || null,
        quantity: Number(form.get("quantity")),
        nodeId: String(form.get("nodeId")) || null,
        visibility: String(form.get("visibility")),
        tradeStatus: String(form.get("tradeStatus")),
        acquisitionType: String(form.get("acquisitionType")),
        acquisitionDate: String(form.get("acquisitionDate")) || null,
      };
    setBusy(true);
    setError("");
    try {
      await managementRequest(
        `/api/v1/collections/${collectionId}/workspace/items${editing ? `/${editing.id}` : ""}`,
        editing
          ? {
              changes,
              expectedUpdatedAt: editing.updatedAt,
              expectedLatestSequence: editing.latestSequence,
            }
          : changes,
      );
      setEditing(null);
      element.reset();
      await load();
      setStatus(t("itemSaved"));
    } catch (problem) {
      setError(managementError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-shell">
      <CollaborationNavigation
        locale={locale}
        collectionId={collectionId}
        current="workspace"
        ownerView={data?.actorRole === "OWNER"}
      />
      <header className="management-heading">
        <p className="eyebrow">{data ? t(`role${data.actorRole}`) : t("sharedWorkspace")}</p>
        <h1>{data?.collection.name ?? t("sharedWorkspace")}</h1>
        <p>{t("workspaceIntro")}</p>
        {data?.actorRole === "OWNER" && (
          <Link href={`/${locale}/collections/${collectionId}`}>{t("ownerFullView")}</Link>
        )}
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {data && (
        <div className="management-grid">
          <CollectionSettings data={data} onSaved={() => load()} />
          {data.actorRole !== "VIEWER" && (
            <section className="management-card">
              <h2>{editing ? t("editItem") : t("newItem")}</h2>
              <form className="form-stack" onSubmit={save} ref={formRef} key={editing?.id ?? "new"}>
                <fieldset disabled={busy} className="collaboration-permissions form-stack">
                  <legend>{t("itemDetails")}</legend>
                  <label>
                    {t("fieldtitle")}
                    <input
                      name="title"
                      maxLength={2000}
                      defaultValue={editing?.title ?? ""}
                      required
                    />
                  </label>
                  <label>
                    {t("description")}
                    <textarea
                      name="description"
                      maxLength={100000}
                      defaultValue={editing?.publicDescription ?? ""}
                    />
                  </label>
                  <label>
                    {t("fieldquantity")}
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      max="2147483647"
                      step="1"
                      defaultValue={editing?.quantity ?? 1}
                      required
                    />
                  </label>
                  <label>
                    {t("fieldnodeId")}
                    <input
                      name="nodeId"
                      list="workspace-nodes"
                      defaultValue={editing?.nodeId ?? ""}
                    />
                    <datalist id="workspace-nodes">
                      {data.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.name}
                        </option>
                      ))}
                    </datalist>
                    {data.moreNodes && <span>{t("moreTargets")}</span>}
                  </label>
                  <label>
                    {t("fieldvisibility")}
                    <select name="visibility" defaultValue={editing?.visibility ?? "PRIVATE"}>
                      {["PRIVATE", "UNLISTED", "PUBLIC"].map((value) => (
                        <option value={value} key={value}>
                          {t(`visibility${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("fieldtradeStatus")}
                    <select
                      name="tradeStatus"
                      defaultValue={editing?.tradeStatus ?? "NOT_FOR_TRADE"}
                    >
                      {["NOT_FOR_TRADE", "OPEN_TO_TRADE", "FOR_SALE", "RESERVED"].map((value) => (
                        <option key={value} value={value}>
                          {t(`trade${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("fieldacquisitionType")}
                    <select
                      name="acquisitionType"
                      defaultValue={editing?.acquisitionType ?? "OTHER"}
                    >
                      {["PURCHASE", "GIFT", "TRADE", "INHERITANCE", "FOUND", "OTHER"].map(
                        (value) => (
                          <option value={value} key={value}>
                            {t(`acquisition${value}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    {t("fieldacquisitionDate")}
                    <input
                      type="date"
                      name="acquisitionDate"
                      defaultValue={editing?.acquisitionDate ?? ""}
                    />
                  </label>
                  <button type="submit">{t("saveItem")}</button>
                  {editing && (
                    <button type="button" onClick={() => setEditing(null)}>
                      {t("cancel")}
                    </button>
                  )}
                </fieldset>
              </form>
            </section>
          )}
          <section className={`management-card${data.actorRole === "VIEWER" ? " wide" : ""}`}>
            <h2>{t("collectionItems")}</h2>
            {data.actorRole === "VIEWER" && <p>{t("viewOnlyRole")}</p>}
            <ul className="plain-list">
              {data.items.map((item) => (
                <li key={item.id} className="collaboration-share-row">
                  <h3>{item.title}</h3>
                  <p>
                    {t("fieldquantity")}: {item.quantity} · {t(`visibility${item.visibility}`)}
                  </p>
                  {item.publicDescription && <p>{item.publicDescription}</p>}
                  {item.archivedAt || item.disposedAt ? (
                    <p>{t("inactiveItem")}</p>
                  ) : (
                    data.actorRole !== "VIEWER" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(item);
                          setError("");
                          setStatus("");
                        }}
                      >
                        {t("editItem")}
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
            {!data.items.length && <p>{t("noItems")}</p>}
            {data.next && (
              <button disabled={busy} type="button" onClick={() => void load(data.next!)}>
                {t("loadMore")}
              </button>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
