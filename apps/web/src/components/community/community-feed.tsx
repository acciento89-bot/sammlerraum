"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { createFeedService } from "@sammlerraum/domain/community/feed-service";
import { CommunityNavigation, CommunityHero } from "./community-navigation";
import { communityRequest, communityError } from "./community-request";
import { CommentThread } from "./comment-thread";
import { ReportDialog, type ReportTarget } from "./report-dialog";
type Feed = Awaited<ReturnType<ReturnType<typeof createFeedService>["getFeed"]>>;
type Item = Feed["items"][number];
export function CommunityFeed({
  locale,
  viewerId,
  moderator,
}: {
  locale: string;
  viewerId: string;
  moderator: boolean;
}) {
  const t = useTranslations("Community"),
    [data, setData] = useState<Feed | null>(null),
    [scope, setScope] = useState<"ALL" | "FOLLOWING" | "FAVORITES">("ALL"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [report, setReport] = useState<ReportTarget | null>(null),
    [openThreads, setOpenThreads] = useState<string[]>([]),
    [panel, setPanel] = useState<"blocks" | "reports" | null>(null),
    [blocks, setBlocks] = useState<{ userId: string; displayName: string | null }[]>([]),
    [reports, setReports] = useState<{ id: string; category: string; status: string }[]>([]);
  const [blocksNext, setBlocksNext] = useState<string | null>(null),
    [reportsNext, setReportsNext] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const load = useCallback(
    async (after?: string) => {
      const version = ++loadVersion.current;
      try {
        const value = await communityRequest<Feed>(
          `/api/v1/community/feed?scope=${scope}${after ? `&afterId=${after}` : ""}`,
        );
        if (version !== loadVersion.current) return;
        setData((previous) =>
          after && previous
            ? {
                ...value,
                items: [
                  ...previous.items,
                  ...value.items.filter((i) => !previous.items.some((old) => old.id === i.id)),
                ],
              }
            : value,
        );
        setError("");
      } catch (e) {
        if (version !== loadVersion.current) return;
        setData(null);
        setError(communityError(e, t));
      }
    },
    [scope, t],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function mutate(item: Item, kind: "follow" | "favorite" | "block") {
    setBusy(true);
    setError("");
    try {
      if (kind === "block") {
        await communityRequest("/api/v1/community/blocks", {
          method: "POST",
          body: { userId: item.ownerId },
        });
        setData((previous) =>
          previous
            ? { ...previous, items: previous.items.filter((i) => i.ownerId !== item.ownerId) }
            : null,
        );
        setStatus(t("blocked"));
      } else {
        const active = kind === "follow" ? item.following : item.favorite;
        await communityRequest(`/api/v1/community/${kind === "follow" ? "follows" : "favorites"}`, {
          method: active ? "DELETE" : "POST",
          body: kind === "follow" ? { userId: item.ownerId } : { type: "ITEM", id: item.id },
        });
        setData((previous) =>
          previous
            ? {
                ...previous,
                items: previous.items.map((i) =>
                  kind === "follow" && i.ownerId === item.ownerId
                    ? { ...i, following: !active }
                    : kind === "favorite" && i.id === item.id
                      ? { ...i, favorite: !active }
                      : i,
                ),
              }
            : null,
        );
      }
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function openPanel(kind: "blocks" | "reports", after?: string) {
    setBusy(true);
    setError("");
    try {
      if (kind === "blocks") {
        const value = await communityRequest<{
          blocks: { userId: string; displayName: string | null }[];
          next: string | null;
        }>(`/api/v1/community/blocks${after ? `?afterId=${after}` : ""}`);
        setBlocks((previous) =>
          after
            ? [
                ...previous,
                ...value.blocks.filter((b) => !previous.some((old) => old.userId === b.userId)),
              ]
            : value.blocks,
        );
        setBlocksNext(value.next);
      } else {
        const value = await communityRequest<{
          reports: { id: string; category: string; status: string }[];
          next: string | null;
        }>(`/api/v1/community/reports${after ? `?afterId=${after}` : ""}`);
        setReports((previous) =>
          after
            ? [
                ...previous,
                ...value.reports.filter((r) => !previous.some((old) => old.id === r.id)),
              ]
            : value.reports,
        );
        setReportsNext(value.next);
      }
      setPanel((previous) => (after ? kind : previous === kind ? null : kind));
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function unblock(userId: string) {
    setBusy(true);
    try {
      await communityRequest("/api/v1/community/blocks", { method: "DELETE", body: { userId } });
      setBlocks((previous) => previous.filter((b) => b.userId !== userId));
      await load();
      setStatus(t("unblocked"));
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-shell community-shell">
      <CommunityNavigation locale={locale} current="community" moderator={moderator} />
      <CommunityHero eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <button type="button" className="text-button" onClick={() => void load()}>
            {t("reload")}
          </button>
        </p>
      )}
      {status && (
        <p role="status" className="community-status">
          {status}
        </p>
      )}
      <div className="community-layout">
        <div>
          <div className="community-filter" aria-label={t("filter")}>
            {(["ALL", "FOLLOWING", "FAVORITES"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
              >
                {t(
                  value === "ALL"
                    ? "all"
                    : value === "FOLLOWING"
                      ? "followingFilter"
                      : "favoritesFilter",
                )}
              </button>
            ))}
          </div>
          {!data && !error && <p role="status">{t("loading")}</p>}
          {data && data.items.length === 0 && (
            <div className="community-empty">
              <span aria-hidden="true">✧</span>
              <h2>{t("emptyFeed")}</h2>
              <p>{t("emptyFeedText")}</p>
              <Link className="primary-link" href={`/${locale}/collections`}>
                {t("shareCollection")}
              </Link>
            </div>
          )}
          <div className="community-feed-grid">
            {data?.items.map((item) => (
              <article
                key={item.id}
                className="community-item-card"
                data-testid={`feed-${item.id}`}
              >
                <div className="community-card-person">
                  <span className="community-avatar" aria-hidden="true">
                    {(Array.from(item.displayName)[0] ?? "").toUpperCase()}
                  </span>
                  <div>
                    <strong>{item.displayName}</strong>
                    <small>{item.collectionName}</small>
                  </div>
                  {!item.isOwner && (
                    <button
                      type="button"
                      className="community-follow"
                      aria-pressed={item.following}
                      disabled={busy}
                      onClick={() => void mutate(item, "follow")}
                    >
                      {t(item.following ? "following" : "follow")}
                    </button>
                  )}
                </div>
                <Link
                  className="community-item-cover"
                  href={`/${locale}/@${item.handle}/collection-${item.collectionId}/items/${item.id}`}
                  prefetch={false}
                  aria-label={`${t("openItem")}: ${item.title}`}
                >
                  {item.imageAssetId ? (
                    <img
                      src={`/api/v1/media/${item.imageAssetId}/medium`}
                      alt={item.title}
                      loading="lazy"
                    />
                  ) : (
                    <span className="community-cover-letter" aria-hidden="true">
                      {Array.from(item.title)[0]}
                    </span>
                  )}
                  <span className="community-trade-badge">{t(`trade_${item.tradeStatus}`)}</span>
                </Link>
                <div className="community-card-content">
                  <h2>
                    <Link
                      href={`/${locale}/@${item.handle}/collection-${item.collectionId}/items/${item.id}`}
                      prefetch={false}
                    >
                      {item.title}
                    </Link>
                  </h2>
                  {item.publicDescription && <p>{item.publicDescription}</p>}
                  <div className="community-card-actions">
                    <button
                      type="button"
                      className={item.favorite ? "community-saved" : "secondary"}
                      aria-pressed={item.favorite}
                      disabled={busy}
                      onClick={() => void mutate(item, "favorite")}
                    >
                      {t(item.favorite ? "favored" : "favorite")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      aria-expanded={openThreads.includes(item.id)}
                      onClick={() =>
                        setOpenThreads((previous) =>
                          previous.includes(item.id)
                            ? previous.filter((id) => id !== item.id)
                            : [...previous, item.id],
                        )
                      }
                    >
                      {t("comments")}
                    </button>
                  </div>
                  {openThreads.includes(item.id) && (
                    <>
                      <CommentThread
                        item={item}
                        viewerId={viewerId}
                        locale={locale}
                        onReport={setReport}
                      />
                      {!item.isOwner && (
                        <div className="community-small-actions community-safety-actions">
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            onClick={() => setReport({ type: "USER", id: item.ownerId })}
                          >
                            {t("reportUser")}
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            onClick={() => void mutate(item, "block")}
                          >
                            {t("block")}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          {data?.next && (
            <button
              type="button"
              className="secondary community-load-more"
              disabled={busy}
              onClick={() => void load(data.next!)}
            >
              {t("more")}
            </button>
          )}
        </div>
        <aside className="community-aside">
          <section className="community-aside-card">
            <span className="community-kicker" aria-hidden="true">
              ◈
            </span>
            <h2>{t("privacyTitle")}</h2>
            <p>{t("privacyText")}</p>
            <Link href={`/${locale}/collections`} className="community-inline-link">
              {t("shareCollection")} →
            </Link>
          </section>
          <section className="community-aside-card">
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void openPanel("blocks")}
            >
              {t("blocks")}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void openPanel("reports")}
            >
              {t("reports")}
            </button>
            {panel === "blocks" && (
              <ul className="community-plain-list">
                {blocks.length === 0 && <li>{t("emptyBlocks")}</li>}
                {blocks.map((b) => (
                  <li key={b.userId} data-testid={`blocked-${b.userId}`}>
                    <span>{b.displayName ?? t("unknownCollector")}</span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void unblock(b.userId)}
                    >
                      {t("unblock")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {panel === "blocks" && blocksNext && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void openPanel("blocks", blocksNext)}
              >
                {t("more")}
              </button>
            )}
            {panel === "reports" && (
              <ul className="community-plain-list">
                {reports.length === 0 && <li>{t("emptyReports")}</li>}
                {reports.map((r) => (
                  <li key={r.id}>
                    <span>{t(r.category)}</span>
                    <span className="community-pill">{t(r.status)}</span>
                  </li>
                ))}
              </ul>
            )}
            {panel === "reports" && reportsNext && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void openPanel("reports", reportsNext)}
              >
                {t("more")}
              </button>
            )}
          </section>
          <p className="community-muted community-trade-note">{t("tradeHint")}</p>
        </aside>
      </div>
      {report && (
        <ReportDialog
          target={report}
          onClose={() => setReport(null)}
          onSaved={() => setStatus(t("reportSent"))}
        />
      )}
    </section>
  );
}
