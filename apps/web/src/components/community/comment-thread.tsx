"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { createFeedService } from "@sammlerraum/domain/community/feed-service";
import { communityRequest, communityError } from "./community-request";
import type { ReportTarget } from "./report-dialog";
type Item = Awaited<ReturnType<ReturnType<typeof createFeedService>["getFeed"]>>["items"][number];
type Comment = {
  id: string;
  parentId: string | null;
  body: string;
  ownerHidden?: boolean;
  canReply?: boolean;
  createdAt: string;
  author: { userId: string; displayName: string | null; handle: string | null };
};
type Thread = { comments: Comment[]; next: string | null; commentsEnabled: boolean };
type Policy = { global: boolean; collection: boolean; item: boolean; enabled: boolean };
export function CommentThread({
  item,
  viewerId,
  locale,
  onReport,
}: {
  item: Item;
  viewerId: string;
  locale: string;
  onReport: (target: ReportTarget) => void;
}) {
  const t = useTranslations("Community"),
    [data, setData] = useState<Thread | null>(null),
    [policy, setPolicy] = useState<Policy | null>(null),
    [body, setBody] = useState(""),
    [reply, setReply] = useState<Comment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const load = useCallback(
    async (after?: string) => {
      try {
        const next = await communityRequest<Thread>(
          `/api/v1/community/comments?type=ITEM&id=${item.id}${item.isOwner ? "&includeOwnerHidden=true" : ""}${after ? `&afterId=${after}` : ""}`,
        );
        setData((previous) =>
          after && previous
            ? {
                ...next,
                comments: [
                  ...previous.comments,
                  ...next.comments.filter((c) => !previous.comments.some((old) => old.id === c.id)),
                ],
              }
            : next,
        );
        if (item.isOwner)
          setPolicy(
            await communityRequest<Policy>(
              `/api/v1/community/comments/policy?type=ITEM&id=${item.id}`,
            ),
          );
        setError("");
      } catch (e) {
        setData(null);
        setPolicy(null);
        setError(communityError(e, t));
      }
    },
    [item.id, item.isOwner, t],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const comment = await communityRequest<Comment>("/api/v1/community/comments", {
        method: "POST",
        body: { target: { type: "ITEM", id: item.id }, body, parentId: reply?.id ?? null },
      });
      setData((previous) =>
        previous
          ? {
              ...previous,
              comments: [...previous.comments.filter((c) => c.id !== comment.id), comment],
            }
          : null,
      );
      setBody("");
      setReply(null);
      setStatus(t("commentSaved"));
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function remove(comment: Comment, ownerHide = false) {
    setBusy(true);
    setError("");
    try {
      await communityRequest(
        `/api/v1/community/comments/${comment.id}`,
        ownerHide
          ? { method: "PATCH", body: { hidden: !comment.ownerHidden } }
          : { method: "DELETE" },
      );
      setReply(null);
      await load();
      setStatus(
        t(
          ownerHide
            ? comment.ownerHidden
              ? "commentRestored"
              : "commentHidden"
            : "commentRemoved",
        ),
      );
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function changePolicy(scope: "GLOBAL" | "COLLECTION" | "ITEM", enabled: boolean) {
    if (policy) {
      const changed = {
        ...policy,
        [scope === "GLOBAL" ? "global" : scope === "COLLECTION" ? "collection" : "item"]: enabled,
      };
      setPolicy({ ...changed, enabled: changed.global && changed.collection && changed.item });
    }
    setBusy(true);
    setError("");
    try {
      await communityRequest("/api/v1/community/comments/policy", {
        method: "POST",
        body: {
          scope,
          enabled,
          ...(scope === "GLOBAL"
            ? {}
            : { targetId: scope === "COLLECTION" ? item.collectionId : item.id }),
        },
      });
      await load();
      setStatus(t("policySaved"));
    } catch (e) {
      await load();
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="community-thread" aria-label={t("comments")}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="community-status" role="status">
          {status}
        </p>
      )}
      {!data && !error && <p>{t("loading")}</p>}
      {data && (
        <>
          <ol className="community-comments">
            {data.comments.map((comment) => (
              <li
                key={comment.id}
                data-testid={`comment-${comment.id}`}
                className={comment.parentId ? "is-reply" : ""}
              >
                <div className="community-comment-byline">
                  <strong>{comment.author.displayName ?? t("unknownCollector")}</strong>
                  <time dateTime={comment.createdAt}>
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                      new Date(comment.createdAt),
                    )}
                  </time>
                </div>
                {comment.ownerHidden && <p className="community-muted">{t("ownerHiddenNote")}</p>}
                <p className="community-comment-body">{comment.body}</p>
                <div className="community-small-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setReply(comment)}
                    disabled={busy || !data.commentsEnabled || comment.canReply === false}
                  >
                    {t("reply")}
                  </button>
                  {comment.author.userId === viewerId ? (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => void remove(comment)}
                    >
                      {t("deleteComment")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => onReport({ type: "COMMENT", id: comment.id })}
                    >
                      {t("reportComment")}
                    </button>
                  )}
                  {item.isOwner && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => void remove(comment, true)}
                    >
                      {t(comment.ownerHidden ? "restoreComment" : "hideComment")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {data.comments.length === 0 && <p className="community-muted">{t("noComments")}</p>}
          {data.next && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void load(data.next!)}
            >
              {t("more")}
            </button>
          )}
          {!data.commentsEnabled && <p className="community-muted">{t("commentsClosed")}</p>}
          <form onSubmit={send} className="community-comment-form">
            {reply && (
              <div className="community-replying">
                <span>
                  {t("replying", { name: reply.author.displayName ?? t("unknownCollector") })}
                </span>
                <button type="button" className="text-button" onClick={() => setReply(null)}>
                  {t("cancel")}
                </button>
              </div>
            )}
            <label htmlFor={`comment-body-${item.id}`}>{t("commentBody")}</label>
            <textarea
              id={`comment-body-${item.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={2}
              disabled={busy || !data.commentsEnabled}
            />
            <button disabled={busy || !data.commentsEnabled || !body.trim()}>
              {t("sendComment")}
            </button>
          </form>
        </>
      )}
      {item.isOwner && policy && (
        <fieldset className="community-policy">
          <legend>{t("commentSettings")}</legend>
          {(
            [
              { scope: "GLOBAL", key: "global", label: "globalPolicy" },
              { scope: "COLLECTION", key: "collection", label: "collectionPolicy" },
              { scope: "ITEM", key: "item", label: "itemPolicy" },
            ] as const
          ).map((setting) => (
            <label key={setting.scope}>
              <input
                type="checkbox"
                checked={policy[setting.key]}
                disabled={busy}
                onChange={(e) => void changePolicy(setting.scope, e.target.checked)}
              />
              {t(setting.label)}
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}
