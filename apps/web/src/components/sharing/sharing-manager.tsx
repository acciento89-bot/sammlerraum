"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { SharePermissionsSchema } from "@sammlerraum/contracts/sharing";
import type { createCollaborationManagementService } from "@sammlerraum/domain/collaboration/management-service";
import type { createShareService } from "@sammlerraum/domain/sharing/share-service";
import { CollaborationNavigation } from "./collaboration-navigation";
import { SharePermissionsEditor } from "./share-permissions-editor";
import { managementRequest, managementError } from "./management-request";
type Setup = Awaited<
  ReturnType<ReturnType<typeof createCollaborationManagementService>["getSharingSetup"]>
>;
type Created = Awaited<ReturnType<ReturnType<typeof createShareService>["createShare"]>>;
export function SharingManager({ locale, collectionId }: { locale: string; collectionId: string }) {
  const t = useTranslations("Collaboration"),
    [data, setData] = useState<Setup | null>(null),
    [rights, setRights] = useState(() => SharePermissionsSchema.parse({})),
    [kind, setKind] = useState("COLLECTION"),
    [target, setTarget] = useState(collectionId),
    [recipient, setRecipient] = useState("TOKEN"),
    [created, setCreated] = useState<Created | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (after?: string) => {
      try {
        const value = await managementRequest<Setup>(
          `/api/v1/collections/${collectionId}/sharing${after ? `?afterShareId=${after}` : ""}`,
        );
        setData((previous) =>
          after && previous ? { ...value, shares: [...previous.shares, ...value.shares] } : value,
        );
        setError("");
      } catch (problem) {
        setError(managementError(problem, t));
      }
    },
    [collectionId, t],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await managementRequest<Created>("/api/v1/shares", {
        target: { kind, id: target },
        recipient:
          recipient === "TOKEN"
            ? { kind: "TOKEN" }
            : { kind: "USER", userId: String(form.get("recipientId")) },
        expectedRevision: data.collection.revision,
        permissions: rights,
        expiresInSeconds: Number(form.get("days")) * 86400,
        pin: String(form.get("pin") ?? "") || undefined,
      });
      setCreated(result);
      setStatus(t("shareCreated"));
      await load();
    } catch (problem) {
      setError(managementError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(share: Setup["shares"][number]) {
    setBusy(true);
    setError("");
    try {
      await managementRequest(`/api/v1/shares/${share.id}/revoke`, {
        expectedRevision: share.revision,
      });
      if (created?.share.id === share.id) setCreated(null);
      await load();
      setStatus(t("shareRevoked"));
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
        current="sharing"
        ownerView={Boolean(data)}
      />
      <header className="management-heading">
        <p className="eyebrow">{data?.collection.name}</p>
        <h1>{t("sharingTitle")}</h1>
        <p>{t("shareIntro")}</p>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!data && !error && <p>{t("loading")}</p>}
      {data && (
        <div className="management-grid">
          <section className="management-card">
            <h2>{t("newShare")}</h2>
            <form className="form-stack" onSubmit={create}>
              <label>
                {t("targetKind")}
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value);
                    setTarget(event.target.value === "COLLECTION" ? collectionId : "");
                  }}
                >
                  <option value="COLLECTION">{t("wholeCollection")}</option>
                  <option value="NODE">{t("node")}</option>
                  <option value="ITEM">{t("item")}</option>
                </select>
              </label>
              {kind !== "COLLECTION" && (
                <label>
                  {t("targetId")}
                  <input
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    list="sharing-targets"
                    required
                  />
                  <datalist id="sharing-targets">
                    {(kind === "ITEM" ? data.targets.items : data.targets.nodes).map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </datalist>
                  {(kind === "ITEM" ? data.targets.moreItems : data.targets.moreNodes) && (
                    <span>{t("moreTargets")}</span>
                  )}
                </label>
              )}
              <SharePermissionsEditor
                value={rights}
                onChange={setRights}
                documents={data.targets.documents}
                moreDocuments={data.targets.moreDocuments}
              />
              <label>
                {t("recipient")}
                <select value={recipient} onChange={(event) => setRecipient(event.target.value)}>
                  <option value="TOKEN">{t("anyoneWithLink")}</option>
                  <option value="USER">{t("registeredRecipient")}</option>
                </select>
              </label>
              {recipient === "USER" && (
                <label>
                  {t("recipientId")}
                  <input name="recipientId" maxLength={512} required />
                </label>
              )}
              <div className="collaboration-form-row">
                <label>
                  {t("expiry")}
                  <select name="days" defaultValue="7">
                    <option value="1">{t("oneDay")}</option>
                    <option value="7">{t("sevenDays")}</option>
                    <option value="30">{t("thirtyDays")}</option>
                  </select>
                </label>
                <label>
                  {t("optionalPin")}
                  <input
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6,12}"
                    minLength={6}
                    maxLength={12}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <button disabled={busy} type="submit">
                {t("createShare")}
              </button>
            </form>
          </section>
          <section className="management-card">
            <h2>{t("existingShares")}</h2>
            {created && (
              <aside className="collaboration-receipt">
                <h3>{t("linkReady")}</h3>
                <p>{t("linkOnce")}</p>
                <a
                  href={`/share/${created.token ?? created.share.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("openShareLink")}
                </a>
                <label>
                  {t("copyLink")}
                  <input
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/share/${created.token ?? created.share.id}`}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
              </aside>
            )}
            <ul className="plain-list">
              {data.shares.map((share) => (
                <li className="collaboration-share-row" key={share.id}>
                  <strong>
                    {share.target.kind === "COLLECTION"
                      ? t("wholeCollection")
                      : share.target.kind === "NODE"
                        ? t("node")
                        : t("item")}
                  </strong>
                  <p className="collaboration-id">{share.target.id}</p>
                  <p>
                    {share.revoked
                      ? t("revoked")
                      : share.expiresAt && Date.parse(share.expiresAt) <= Date.now()
                        ? t("expired")
                        : t("active")}{" "}
                    ·{" "}
                    {share.recipient.kind === "TOKEN"
                      ? t("anyoneWithLink")
                      : t("registeredRecipient")}
                  </p>
                  {share.expiresAt && (
                    <time dateTime={share.expiresAt}>
                      {new Date(share.expiresAt).toLocaleDateString(locale)}
                    </time>
                  )}
                  {share.pinRequired && <span> · {t("pinProtected")}</span>}
                  {!share.revoked && (
                    <button type="button" disabled={busy} onClick={() => void revoke(share)}>
                      {t("revoke")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!data.shares.length && <p>{t("noShares")}</p>}
            {data.nextAfterShareId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void load(data.nextAfterShareId!)}
              >
                {t("loadMore")}
              </button>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
