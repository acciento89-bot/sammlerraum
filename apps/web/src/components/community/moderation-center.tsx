"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { createModerationService } from "@sammlerraum/domain/moderation/moderation-service";
import { CommunityNavigation, CommunityHero } from "./community-navigation";
import { communityRequest, communityError } from "./community-request";
type Service = ReturnType<typeof createModerationService>;
type Reports = Awaited<ReturnType<Service["listReports"]>>;
type Report = Reports["reports"][number];
type Review = Awaited<ReturnType<Service["getCommentForReview"]>>;
export function ModerationCenter({ locale }: { locale: string }) {
  const t = useTranslations("Community"),
    [data, setData] = useState<Reports | null>(null),
    [filter, setFilter] = useState<"OPEN" | "RESOLVED" | "DISMISSED">("OPEN"),
    [selected, setSelected] = useState<Report | null>(null),
    [review, setReview] = useState<Review | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const load = useCallback(
    async (after?: string) => {
      try {
        const value = await communityRequest<Reports>(
          `/api/v1/moderation/reports?status=${filter}${after ? `&afterId=${after}` : ""}`,
        );
        setData((previous) =>
          after && previous
            ? { ...value, reports: [...previous.reports, ...value.reports] }
            : value,
        );
        setError("");
      } catch (e) {
        setData(null);
        setSelected(null);
        setReview(null);
        setError(communityError(e, t));
      }
    },
    [filter, t],
  );
  useEffect(() => {
    setSelected(null);
    setReview(null);
    void load();
  }, [load]);
  async function select(report: Report) {
    setSelected(report);
    setReason("");
    setReview(null);
    setBusy(true);
    setError("");
    try {
      if (report.commentId)
        setReview(
          await communityRequest<Review>(`/api/v1/moderation/comments/${report.commentId}`),
        );
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function decide(action: "HIDE" | "RESTORE" | "RESOLVED" | "DISMISSED") {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (action === "HIDE" || action === "RESTORE") {
        if (!selected.commentId) return;
        await communityRequest(`/api/v1/moderation/comments/${selected.commentId}`, {
          method: "POST",
          body: { action, reason },
        });
        setReview(
          await communityRequest<Review>(`/api/v1/moderation/comments/${selected.commentId}`),
        );
      } else {
        await communityRequest(`/api/v1/moderation/reports/${selected.id}`, {
          method: "POST",
          body: { outcome: action, reason },
        });
        setSelected(null);
        setReview(null);
        setReason("");
        await load();
      }
      setStatus(t("moderationSaved"));
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-shell community-shell">
      <CommunityNavigation locale={locale} current="moderation" moderator />
      <CommunityHero
        eyebrow={t("moderationEyebrow")}
        title={t("moderationTitle")}
        intro={t("moderationIntro")}
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="community-status">
          {status}
        </p>
      )}
      <div className="community-layout community-moderation-layout">
        <div>
          <label className="community-report-filter">
            {t("filter")}
            <select
              value={filter}
              disabled={busy}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
            >
              {(["OPEN", "RESOLVED", "DISMISSED"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </label>
          {data?.reports.length === 0 && <p className="community-empty">{t("moderationEmpty")}</p>}
          <div className="community-report-list">
            {data?.reports.map((report) => (
              <article
                key={report.id}
                className="community-report-card"
                data-testid="moderation-report"
              >
                <div className="community-section-heading">
                  <strong>{t(report.category)}</strong>
                  <span className="community-pill">{t(report.status)}</span>
                </div>
                <p className="community-private-note">{report.reason}</p>
                <small>{t(`reportType_${report.targetType}`)}</small>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void select(report)}
                >
                  {t("reviewComment")}
                </button>
              </article>
            ))}
          </div>
          {data?.next && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void load(data.next!)}
            >
              {t("more")}
            </button>
          )}
        </div>
        <aside className="community-aside">
          <section
            className="community-aside-card community-review"
            data-testid="moderation-review"
          >
            <h2>{t("reviewTitle")}</h2>
            {!selected ? (
              <p>{t("reviewSelect")}</p>
            ) : (
              <>
                {review && (
                  <>
                    <div className="community-review-flags">
                      {review.ownerHidden && (
                        <span className="community-pill">{t("ownerHidden")}</span>
                      )}
                      {review.moderationHidden && (
                        <span className="community-pill">{t("platformHidden")}</span>
                      )}
                      {review.deleted && (
                        <span className="community-pill">{t("authorDeleted")}</span>
                      )}
                    </div>
                    <blockquote>{review.body || t("noRetainedText")}</blockquote>
                  </>
                )}
                <label>
                  {t("reason")}
                  <textarea
                    required
                    maxLength={2000}
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {selected.commentId && review && (
                  <div className="community-decision-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !reason.trim()}
                      onClick={() => void decide(review.moderationHidden ? "RESTORE" : "HIDE")}
                    >
                      {t(review.moderationHidden ? "platformRestore" : "platformHide")}
                    </button>
                  </div>
                )}
                {selected.status === "OPEN" && (
                  <div className="community-decision-actions">
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => void decide("RESOLVED")}
                    >
                      {t("resolveReport")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !reason.trim()}
                      onClick={() => void decide("DISMISSED")}
                    >
                      {t("dismissReport")}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
