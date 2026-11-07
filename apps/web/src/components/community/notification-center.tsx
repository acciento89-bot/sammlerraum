"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { createNotificationService } from "@sammlerraum/domain/notifications/notification-service";
import { CommunityNavigation, CommunityHero } from "./community-navigation";
import { communityRequest, communityError } from "./community-request";
type Service = ReturnType<typeof createNotificationService>;
type Notices = Awaited<ReturnType<Service["listNotifications"]>>;
type Preferences = Awaited<ReturnType<Service["getPreferences"]>>;
export function NotificationCenter({ locale, moderator }: { locale: string; moderator: boolean }) {
  const t = useTranslations("Community"),
    [data, setData] = useState<Notices | null>(null),
    [prefs, setPrefs] = useState<Preferences | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const load = useCallback(
    async (after?: string) => {
      try {
        const value = await communityRequest<Notices>(
          `/api/v1/notifications${after ? `?afterId=${after}` : ""}`,
        );
        setData((previous) =>
          after && previous
            ? { ...value, notifications: [...previous.notifications, ...value.notifications] }
            : value,
        );
        setError("");
      } catch (e) {
        setData(null);
        setError(communityError(e, t));
      }
    },
    [t],
  );
  useEffect(() => {
    void load();
    void communityRequest<Preferences>("/api/v1/notifications/preferences")
      .then(setPrefs)
      .catch((e) => setError(communityError(e, t)));
  }, [load, t]);
  async function read(id?: string) {
    setBusy(true);
    setError("");
    try {
      if (id) {
        const result = await communityRequest<{ readAt: string }>(
          `/api/v1/notifications/${id}/read`,
          { method: "POST", body: {} },
        );
        setData((previous) =>
          previous
            ? {
                ...previous,
                notifications: previous.notifications.map((n) =>
                  n.id === id ? { ...n, readAt: result.readAt } : n,
                ),
                unreadCount: Math.max(0, previous.unreadCount - 1),
              }
            : null,
        );
      } else {
        await communityRequest("/api/v1/notifications/read-all", { method: "POST", body: {} });
        await load();
      }
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!prefs) return;
    setBusy(true);
    setError("");
    try {
      setPrefs(
        await communityRequest<Preferences>("/api/v1/notifications/preferences", {
          method: "PATCH",
          body: prefs,
        }),
      );
      setStatus(t("preferencesSaved"));
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  function targetLink(notice: Notices["notifications"][number]) {
    const target = notice.safeTarget;
    if (!target) return null;
    return target.type === "ITEM"
      ? `/${locale}/items/${target.id}`
      : target.type === "ACCOUNT" && notice.type === "SECURITY_ALERT"
        ? `/${locale}/account/security`
        : `/${locale}/community`;
  }
  return (
    <section className="management-shell community-shell">
      <CommunityNavigation locale={locale} current="notifications" moderator={moderator} />
      <CommunityHero
        eyebrow={t("notificationEyebrow")}
        title={t("notificationTitle")}
        intro={t("notificationIntro")}
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
      <div className="community-layout">
        <div>
          <div className="community-section-heading">
            <span className="community-pill">
              {t("unread")} · {data?.unreadCount ?? 0}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={busy || !data?.unreadCount}
              onClick={() => void read()}
            >
              {t("readAll")}
            </button>
          </div>
          {!data && !error && <p role="status">{t("loading")}</p>}
          {data?.notifications.length === 0 && (
            <div className="community-empty">
              <span aria-hidden="true">✧</span>
              <h2>{t("notificationEmpty")}</h2>
              <p>{t("notificationEmptyText")}</p>
            </div>
          )}
          <ul className="community-notices">
            {data?.notifications.map((notice) => (
              <li key={notice.id} className={notice.readAt ? "is-read" : "is-unread"}>
                <span className="community-notice-mark" aria-hidden="true">
                  {notice.readAt ? "○" : "●"}
                </span>
                <div>
                  <p className="eyebrow">{t(notice.category)}</p>
                  <h2>{t(`notice_${notice.type}`)}</h2>
                  <time dateTime={notice.createdAt}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(notice.createdAt))}
                  </time>
                  {notice.safeTargetLabel && <p>{notice.safeTargetLabel}</p>}
                  {!notice.safeTarget && notice.category === "COMMUNITY" && (
                    <p className="community-muted">{t("targetUnavailable")}</p>
                  )}
                  <div className="community-small-actions">
                    {targetLink(notice) && (
                      <Link
                        className="community-inline-link"
                        href={targetLink(notice)!}
                        prefetch={false}
                      >
                        {t("viewActivity")}
                      </Link>
                    )}
                    {!notice.readAt && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => void read(notice.id)}
                      >
                        {t("markRead")}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
          <form className="community-aside-card community-preferences" onSubmit={save}>
            <h2>{t("preferencesTitle")}</h2>
            <p>{t("preferencesIntro")}</p>
            {prefs && (
              <>
                <label>
                  {t("emailLanguage")}
                  <select
                    value={prefs.locale}
                    onChange={(e) => setPrefs({ ...prefs, locale: e.target.value as "de" | "en" })}
                  >
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </label>
                {(["COMMUNITY", "INVENTORY", "ACCOUNT", "SECURITY"] as const).map((category) => (
                  <fieldset key={category}>
                    <legend>{t(category)}</legend>
                    {(["IN_APP", "EMAIL"] as const).map((channel) => {
                      const pref = prefs.preferences.find(
                          (p) => p.category === category && p.channel === channel,
                        )!,
                        required = category === "SECURITY" && channel === "EMAIL";
                      return (
                        <label key={channel}>
                          <input
                            type="checkbox"
                            checked={pref.enabled}
                            disabled={busy || required}
                            onChange={(e) =>
                              setPrefs({
                                ...prefs,
                                preferences: prefs.preferences.map((p) =>
                                  p.category === category && p.channel === channel
                                    ? { ...p, enabled: e.target.checked }
                                    : p,
                                ),
                              })
                            }
                          />
                          {t(channel === "EMAIL" ? "email" : "inApp")}
                          {required && <small>{t("required")}</small>}
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
              </>
            )}
            <button disabled={busy || !prefs}>{t("savePreferences")}</button>
          </form>
        </aside>
      </div>
    </section>
  );
}
