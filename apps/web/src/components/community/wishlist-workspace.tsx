"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { createWishlistService } from "@sammlerraum/domain/wishlist/wishlist-service";
import { CommunityNavigation, CommunityHero } from "./community-navigation";
import { communityRequest, communityError } from "./community-request";
import { RequestChannel } from "../search/search-state";
import { parseWishPrice, formatWishPrice } from "./wish-price";
type Wishes = Awaited<ReturnType<ReturnType<typeof createWishlistService>["listWishlistEntries"]>>;
type Duplicates = Awaited<
  ReturnType<ReturnType<typeof createWishlistService>["listDuplicateCandidates"]>
>;
export function WishlistWorkspace({
  locale,
  moderator,
  itemId,
}: {
  locale: string;
  moderator: boolean;
  itemId?: string;
}) {
  const t = useTranslations("Community"),
    [searchText, setSearchText] = useState(""),
    [appliedSearch, setAppliedSearch] = useState(""),
    [data, setData] = useState<Wishes | null>(null),
    [duplicates, setDuplicates] = useState<Duplicates | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [removing, setRemoving] = useState<string | null>(null);
  const listChannel = useRef(new RequestChannel());
  const load = useCallback(
    async (after?: string) => {
      const request = listChannel.current.begin();
      try {
        const params = new URLSearchParams({
          text: appliedSearch,
          ...(after ? { afterId: after } : {}),
        });
        const value = await communityRequest<Wishes>(`/api/v1/wishlist?${params}`, {
          signal: request.signal,
        });
        if (!listChannel.current.current(request.id)) return;
        setData((previous) =>
          after && previous
            ? {
                ...value,
                entries: [
                  ...previous.entries,
                  ...value.entries.filter((v) => !previous.entries.some((p) => p.id === v.id)),
                ],
              }
            : value,
        );
        setError("");
      } catch (e) {
        if (!listChannel.current.current(request.id)) return;
        setData(null);
        setError(communityError(e, t));
      }
    },
    [t, appliedSearch],
  );
  const loadDuplicates = useCallback(
    async (after?: string) => {
      if (!itemId) return;
      try {
        const value = await communityRequest<Duplicates>(
          `/api/v1/wishlist/duplicates?itemId=${itemId}${after ? `&afterId=${after}` : ""}`,
        );
        setDuplicates((previous) =>
          after && previous
            ? { ...value, candidates: [...previous.candidates, ...value.candidates] }
            : value,
        );
      } catch (e) {
        setDuplicates(null);
        setError(communityError(e, t));
      }
    },
    [itemId, t],
  );
  useEffect(() => {
    void load();
    void loadDuplicates();
    return () => listChannel.current.cancel();
  }, [load, loadDuplicates]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget,
      form = new FormData(element);
    setBusy(true);
    setError("");
    try {
      const targetPrice = parseWishPrice(
        String(form.get("targetPrice")),
        String(form.get("currency")),
      );
      const created = await communityRequest<Wishes["entries"][number]>("/api/v1/wishlist", {
        method: "POST",
        body: {
          title: String(form.get("title")),
          desiredCondition: String(form.get("condition")) || null,
          targetPrice,
          priority: Number(form.get("priority")),
          notes: String(form.get("notes")) || null,
        },
      });
      await load();
      element.reset();
      setStatus(t("wishSaved"));
    } catch (e) {
      setError(
        (e instanceof Error && e.message.startsWith("Invalid prospective")) ||
          (e instanceof Error && e.message === "Prospective price too large")
          ? t("invalid")
          : communityError(e, t),
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(id: string, remove = false) {
    setBusy(true);
    setError("");
    try {
      if (remove) {
        await communityRequest(`/api/v1/wishlist/${id}`, { method: "DELETE" });
        setData((previous) =>
          previous ? { ...previous, entries: previous.entries.filter((w) => w.id !== id) } : null,
        );
        setRemoving(null);
      } else {
        const value = await communityRequest<Wishes["entries"][number]>(
          `/api/v1/wishlist/${id}/fulfill`,
          { method: "POST", body: {} },
        );
        setData((previous) =>
          previous
            ? { ...previous, entries: previous.entries.map((w) => (w.id === id ? value : w)) }
            : null,
        );
      }
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function mark(candidate: Duplicates["candidates"][number]) {
    if (!itemId) return;
    setBusy(true);
    setError("");
    try {
      await communityRequest("/api/v1/wishlist/duplicates", {
        method: candidate.marked ? "DELETE" : "POST",
        body: { itemAId: itemId, itemBId: candidate.id },
      });
      setDuplicates((previous) =>
        previous
          ? {
              ...previous,
              candidates: previous.candidates.map((c) =>
                c.id === candidate.id ? { ...c, marked: !c.marked } : c,
              ),
            }
          : null,
      );
      setStatus(t("duplicateSaved"));
    } catch (e) {
      setError(communityError(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-shell community-shell">
      <CommunityNavigation locale={locale} current="wishlist" moderator={moderator} />
      <CommunityHero
        eyebrow={t("wishlistEyebrow")}
        title={t("wishlistTitle")}
        intro={t("wishlistIntro")}
      />
      <form
        className="management-card search-actions"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setData(null);
          setAppliedSearch(searchText.normalize("NFKC").trim());
          if (searchText.normalize("NFKC").trim() === appliedSearch) void load();
        }}
      >
        <label>
          {t("searchWishes")}
          <input
            type="search"
            value={searchText}
            maxLength={200}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
        <button type="submit" className="secondary-button">
          {t("searchWishesAction")}
        </button>
      </form>
      <p className="community-privacy-line">◈ {t("privateWishlist")}</p>
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
      <div className="community-layout community-wish-layout">
        <aside className="community-aside">
          <form className="community-aside-card community-wish-form" onSubmit={create}>
            <label>
              {t("wishName")}
              <input name="title" required maxLength={200} />
            </label>
            <div className="community-field-pair">
              <label>
                {t("targetPrice")}
                <input name="targetPrice" inputMode="decimal" maxLength={22} placeholder="0.00" />
              </label>
              <label>
                {t("currency")}
                <select name="currency" defaultValue="EUR">
                  <option>EUR</option>
                  <option>USD</option>
                  <option>GBP</option>
                </select>
              </label>
            </div>
            <p className="community-field-hint">{t("priceHint")}</p>
            <label>
              {t("desiredCondition")}
              <input name="condition" maxLength={200} />
            </label>
            <label>
              {t("priority")}
              <select name="priority" defaultValue="3">
                {[1, 2, 3, 4, 5].map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("notes")}
              <textarea name="notes" rows={3} maxLength={10000} />
            </label>
            <button disabled={busy || !data}>{t("createWish")}</button>
          </form>
        </aside>
        <div className="community-wish-list">
          {!data && !error && <p role="status">{t("loading")}</p>}
          {data?.entries.length === 0 && (
            <div className="community-empty">
              <span aria-hidden="true">✧</span>
              <h2>{t("wishEmpty")}</h2>
              <p>{t("wishEmptyText")}</p>
            </div>
          )}
          {data?.entries.map((wish) => (
            <article
              key={wish.id}
              className={`community-wish-card ${wish.fulfilledAt ? "is-fulfilled" : ""}`}
              data-testid="wishlist-entry"
            >
              <div className="community-wish-heading">
                <span className="community-priority" title={`${t("priority")} ${wish.priority}`}>
                  {Array.from({ length: wish.priority }, () => "·").join("")}
                </span>
                <span className="community-pill">
                  {t(wish.fulfilledAt ? "fulfilled" : "wishOpen")}
                </span>
              </div>
              <h2>{wish.title}</h2>
              {wish.targetPrice && (
                <p className="community-wish-price">{formatWishPrice(wish.targetPrice, locale)}</p>
              )}
              {wish.desiredCondition && <p>{wish.desiredCondition}</p>}
              {wish.notes && (
                <details>
                  <summary>{t("notes")}</summary>
                  <p className="community-private-note">{wish.notes}</p>
                </details>
              )}
              <div className="community-card-actions">
                {!wish.fulfilledAt && (
                  <button disabled={busy} type="button" onClick={() => void act(wish.id)}>
                    {t("wishFulfill")}
                  </button>
                )}
                {removing === wish.id ? (
                  <>
                    <button
                      className="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void act(wish.id, true)}
                    >
                      {t("confirmRemove")}
                    </button>
                    <button className="text-button" type="button" onClick={() => setRemoving(null)}>
                      {t("cancel")}
                    </button>
                  </>
                ) : (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(wish.id)}
                  >
                    {t("wishRemove")}
                  </button>
                )}
              </div>
            </article>
          ))}
          {data?.next && (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => void load(data.next!)}
            >
              {t("more")}
            </button>
          )}
          <section className="community-aside-card community-duplicate-section">
            <p className="eyebrow">{t("duplicates")}</p>
            <h2>{t("duplicatesTitle")}</h2>
            <p>{t("duplicatesIntro")}</p>
            {!itemId ? (
              <p>{t("duplicateStart")}</p>
            ) : (
              <>
                <Link className="community-inline-link" href={`/${locale}/items/${itemId}`}>
                  {t("openItem")} →
                </Link>
                {duplicates?.candidates.length === 0 && <p>{t("duplicateEmpty")}</p>}
                <ul className="community-plain-list">
                  {duplicates?.candidates.map((candidate) => (
                    <li key={candidate.id} data-testid={`duplicate-${candidate.id}`}>
                      <div>
                        <strong>{candidate.title}</strong>
                        <small>{t("quantity", { count: candidate.quantity })}</small>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        className={candidate.marked ? "secondary" : ""}
                        onClick={() => void mark(candidate)}
                      >
                        {t(candidate.marked ? "unmarkDuplicate" : "markDuplicate")}
                      </button>
                    </li>
                  ))}
                </ul>
                {duplicates?.next && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void loadDuplicates(duplicates.next!)}
                  >
                    {t("more")}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
