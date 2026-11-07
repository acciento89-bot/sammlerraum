"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { createCollaborationManagementService } from "@sammlerraum/domain/collaboration/management-service";
import type { InvitationDto } from "@sammlerraum/contracts/collaboration";
import { CollaborationNavigation } from "./collaboration-navigation";
import { managementRequest, managementError } from "./management-request";
type Directory = Awaited<
  ReturnType<ReturnType<typeof createCollaborationManagementService>["getMemberDirectory"]>
>;
export function MembersManager({
  locale,
  collectionId,
  userId,
}: {
  locale: string;
  collectionId: string;
  userId: string;
}) {
  const t = useTranslations("Collaboration"),
    router = useRouter(),
    [data, setData] = useState<Directory | null>(null),
    [invites, setInvites] = useState<InvitationDto[]>([]),
    [link, setLink] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const current = await managementRequest<Directory>(
        `/api/v1/collections/${collectionId}/members`,
      );
      setData(current);
      if (["OWNER", "ADMIN"].includes(current.actorRole)) {
        const pending = await managementRequest<{ invitations: InvitationDto[] }>(
          `/api/v1/collections/${collectionId}/invitations`,
        );
        setInvites(pending.invitations);
      } else setInvites([]);
      setError("");
    } catch (problem) {
      setData(null);
      setInvites([]);
      setError(managementError(problem, t));
    }
  }, [collectionId, t]);
  useEffect(() => {
    void load();
  }, [load]);
  async function memberAction(body: Record<string, unknown>) {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      await managementRequest(`/api/v1/collections/${collectionId}/members`, {
        ...body,
        expectedRevision: data.revision,
      });
      setStatus(t("membersSaved"));
      if (body.action === "REMOVE" && body.userId === userId) router.push(`/${locale}/collections`);
      else await load();
    } catch (problem) {
      await load();
      setError(managementError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const value = await managementRequest<{ token: string }>(
        `/api/v1/collections/${collectionId}/invitations`,
        {
          expectedRevision: data.revision,
          target: { kind: "EMAIL", email: String(form.get("email")) },
          role: String(form.get("role")),
          expiresInSeconds: 48 * 3600,
        },
      );
      setLink(`/${locale}/invite/${value.token}`);
      setStatus(t("inviteCreated"));
      await load();
    } catch (problem) {
      setError(managementError(problem, t));
    } finally {
      setBusy(false);
    }
  }
  async function revokeInvite(id: string) {
    if (!data) return;
    setBusy(true);
    try {
      await managementRequest(`/api/v1/collections/${collectionId}/invitations/${id}/revoke`, {
        expectedRevision: data.revision,
      });
      setStatus(t("inviteRevoked"));
      await load();
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
        current="members"
        ownerView={data?.actorRole === "OWNER"}
      />
      <header className="management-heading">
        <p className="eyebrow">{data?.name}</p>
        <h1>{t("membersTitle")}</h1>
        <p>{t("membersIntro")}</p>
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!data && !error && <p>{t("loading")}</p>}
      {data && (
        <div className="management-grid">
          <section className="management-card wide">
            <h2>{t("currentMembers")}</h2>
            <p>
              {t("yourRole")}: {t(`role${data.actorRole}`)}
            </p>
            <ul className="plain-list">
              {data.members.map((member) => {
                const manager =
                    data.actorRole === "OWNER" ||
                    (data.actorRole === "ADMIN" &&
                      member.role !== "OWNER" &&
                      member.role !== "ADMIN"),
                  self = member.userId === userId;
                return (
                  <li key={member.userId} className="collaboration-share-row">
                    <strong>
                      {member.name}
                      {self ? ` · ${t("you")}` : ""}
                    </strong>
                    <p>{t(`role${member.role}`)}</p>
                    <p className="collaboration-id">{member.userId}</p>
                    {manager && member.role !== "OWNER" && (
                      <label>
                        {t("changeRole")}
                        <select
                          aria-label={`${t("changeRole")} ${member.name}`}
                          value={member.role}
                          disabled={busy}
                          onChange={(event) =>
                            void memberAction({
                              action: "CHANGE_ROLE",
                              userId: member.userId,
                              role: event.target.value,
                            })
                          }
                        >
                          {(data.actorRole === "OWNER"
                            ? ["ADMIN", "EDITOR", "VIEWER"]
                            : ["EDITOR", "VIEWER"]
                          ).map((role) => (
                            <option key={role} value={role}>
                              {t(`role${role}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {member.role !== "OWNER" && (manager || self) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void memberAction({ action: "REMOVE", userId: member.userId })
                        }
                      >
                        {self ? t("leaveCollection") : t("removeMember")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          {["OWNER", "ADMIN"].includes(data.actorRole) && (
            <>
              <section className="management-card">
                <h2>{t("inviteMember")}</h2>
                <form className="form-stack" onSubmit={invite}>
                  <label>
                    {t("email")}
                    <input type="email" name="email" maxLength={254} required />
                  </label>
                  <label>
                    {t("role")}
                    <select name="role" defaultValue="VIEWER">
                      {(data.actorRole === "OWNER"
                        ? ["ADMIN", "EDITOR", "VIEWER"]
                        : ["EDITOR", "VIEWER"]
                      ).map((role) => (
                        <option value={role} key={role}>
                          {t(`role${role}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>{t("inviteDelivery")}</p>
                  <button type="submit" disabled={busy}>
                    {t("createInvitation")}
                  </button>
                </form>
                {link && (
                  <aside className="collaboration-receipt">
                    <label>
                      {t("copyInviteLink")}
                      <input
                        readOnly
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}${link}`}
                        onFocus={(event) => event.target.select()}
                      />
                    </label>
                    <a href={link}>{t("openInvitation")}</a>
                  </aside>
                )}
              </section>
              <section className="management-card">
                <h2>{t("pendingInvitations")}</h2>
                <ul className="plain-list">
                  {invites.map((invite) => (
                    <li key={invite.id} className="collaboration-share-row">
                      <strong>
                        {invite.target.kind === "EMAIL"
                          ? invite.target.email
                          : invite.target.userId}
                      </strong>
                      <p>
                        {t(`role${invite.role}`)} ·{" "}
                        <time dateTime={invite.expiresAt}>
                          {new Date(invite.expiresAt).toLocaleString(locale)}
                        </time>
                      </p>
                      <button
                        disabled={busy}
                        type="button"
                        onClick={() => void revokeInvite(invite.id)}
                      >
                        {t("revokeInvitation")}
                      </button>
                    </li>
                  ))}
                </ul>
                {!invites.length && <p>{t("noInvitations")}</p>}
              </section>
            </>
          )}
          {data.actorRole === "OWNER" && data.members.length > 1 && (
            <section className="management-card wide">
              <h2>{t("transferOwnership")}</h2>
              <p>{t("transferWarning")}</p>
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void memberAction({
                    action: "TRANSFER",
                    newOwnerId: String(form.get("newOwnerId")),
                    confirmPrivateTransfer: form.get("confirm") === "on",
                  });
                }}
              >
                <label>
                  {t("newOwner")}
                  <select name="newOwnerId" required>
                    {data.members
                      .filter((member) => member.role !== "OWNER")
                      .map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" name="confirm" required />
                  {t("confirmTransfer")}
                </label>
                <button type="submit" disabled={busy}>
                  {t("transferOwnership")}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
