"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MoneyView } from "@sammlerraum/contracts/legacy-money";
import type { PersonalMoneyHistoryResultSchema } from "@sammlerraum/contracts/personal-money";
import { loadMoneyCapabilities, MoneyClientError } from "./legacy-money-client";
import {
  classifyPersonalMoney,
  readCurrentPersonalMoney,
  readPersonalMoneyHistory,
  revokePersonalMoney,
} from "./money-review-client";
import {
  initialReviewDraft,
  recallMoneyReview,
  rememberMoneyReview,
  reviewDraftInput,
  reviewDraftPreview,
  type MoneyReviewDraft,
} from "./money-review-draft";
import { valuationCurrencyCodes } from "@sammlerraum/domain/money/currencies";
import { MoneyReadout } from "./legacy-money-editor";
type History = ReturnType<typeof PersonalMoneyHistoryResultSchema.parse>;
export function LegacyMoneyReview({
  view,
  actor,
  locale,
  disabled,
  onChanged,
  onBusy,
  onExpired,
  onClose,
}: {
  view: MoneyView;
  actor: string;
  locale: "de" | "en";
  disabled?: boolean;
  onChanged(view: MoneyView): void;
  onBusy(busy: boolean): void;
  onExpired(): void;
  onClose(): void;
}) {
  const t = useTranslations("LegacyMoney");
  const [draft, setDraft] = useState(
    () => recallMoneyReview(actor, view.subject) ?? initialReviewDraft(view),
  );
  const [history, setHistory] = useState<History | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null),
    [revokeReason, setRevokeReason] = useState(""),
    [revokeAck, setRevokeAck] = useState(false);
  const revoked = useRef(new Set<string>()),
    generation = useRef(0),
    alive = useRef(true),
    expired = useRef(false);
  const key = JSON.stringify(view.subject);
  function change(next: MoneyReviewDraft) {
    setDraft(next);
    rememberMoneyReview(actor, view.subject, next);
  }
  function issue(error: unknown) {
    return t(
      error instanceof MoneyClientError
        ? error.code === "CONFLICT"
          ? "conflict"
          : error.code === "OUTCOME_UNKNOWN"
            ? "unknownOutcome"
            : error.code === "ACKNOWLEDGED_UNREADABLE"
              ? "ackUnreadable"
              : error.code === "READ_FAILED"
                ? "readFailed"
                : "refused"
        : "reviewInvalid",
    );
  }
  async function authenticated() {
    const caps = await loadMoneyCapabilities();
    if (caps.actorId !== actor) {
      expired.current = true;
      onExpired();
      throw new MoneyClientError("REFUSED", 401);
    }
    return caps;
  }
  async function historyPage(cursor?: string, acknowledged = false) {
    const sequence = ++generation.current;
    try {
      await authenticated();
      const result = await readPersonalMoneyHistory(view, cursor);
      if (alive.current && sequence === generation.current) setHistory(result);
    } catch (error) {
      if (alive.current && sequence === generation.current)
        setMessage(`${acknowledged ? `${t("savedSeparately")} ` : ""}${issue(error)}`);
    }
  }
  useEffect(() => {
    alive.current = true;
    void historyPage();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [key, actor]);
  function setPending(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  async function confirmMeaning() {
    let input: ReturnType<typeof reviewDraftInput>;
    try {
      input = reviewDraftInput(view, draft);
    } catch (error) {
      setMessage(issue(error));
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const caps = await authenticated();
      // Persist uncertainty before dispatch; a lost view must never automatically replay this action.
      change({ ...draft, outcome: "UNKNOWN" });
      const next = await classifyPersonalMoney(view, input, caps);
      if (!alive.current || expired.current) return;
      onChanged(next);
      change(initialReviewDraft(next));
      setMessage(t("savedSeparately"));
      await historyPage(undefined, true);
    } catch (error) {
      if (!alive.current || expired.current) return;
      change({
        ...draft,
        outcome:
          error instanceof MoneyClientError && error.code === "CONFLICT"
            ? "CONFLICT"
            : error instanceof MoneyClientError && error.code === "ACKNOWLEDGED_UNREADABLE"
              ? "ACKNOWLEDGED_UNREADABLE"
              : error instanceof MoneyClientError && error.code === "OUTCOME_UNKNOWN"
                ? "UNKNOWN"
                : "READY",
      });
      setMessage(issue(error));
    } finally {
      if (alive.current) setPending(false);
    }
  }
  async function inspect() {
    setPending(true);
    setMessage("");
    try {
      await authenticated();
      const next = await readCurrentPersonalMoney(view);
      if (!alive.current || expired.current) return;
      onChanged(next);
      setInspected(next);
      await historyPage();
    } catch (error) {
      if (alive.current) setMessage(issue(error));
    } finally {
      if (alive.current) setPending(false);
    }
  }
  const [inspected, setInspected] = useState<MoneyView | null>(null);
  async function revoke() {
    const event = history?.events.find((event) => event.id === revokeId);
    if (
      !event?.expectedAssertionToken ||
      event.revocationId ||
      event.operation === "COPY" ||
      revoked.current.has(event.id) ||
      !revokeAck ||
      !revokeReason.trim()
    )
      return;
    setPending(true);
    setMessage("");
    try {
      const caps = await authenticated();
      change({ ...draft, outcome: "UNKNOWN" });
      await revokePersonalMoney(
        view,
        {
          assertionId: event.id,
          expectedAssertionToken: event.expectedAssertionToken,
          reason: revokeReason,
        },
        caps,
      );
      if (!alive.current || expired.current) return;
      // The receipt is durable even if the subsequent display refresh fails.
      revoked.current.add(event.id);
      setRevokeId(null);
      setRevokeReason("");
      setRevokeAck(false);
      change({ ...draft, outcome: "ACKNOWLEDGED_UNREADABLE" });
      const next = await readCurrentPersonalMoney(view);
      if (!alive.current || expired.current) return;
      onChanged(next);
      change(initialReviewDraft(next));
      setMessage(t("savedSeparately"));
      await historyPage();
    } catch (error) {
      if (!alive.current || expired.current) return;
      if (!(revokeId && revoked.current.has(revokeId)))
        change({
          ...draft,
          outcome:
            error instanceof MoneyClientError && error.code === "CONFLICT"
              ? "CONFLICT"
              : error instanceof MoneyClientError && error.code === "OUTCOME_UNKNOWN"
                ? "UNKNOWN"
                : error instanceof MoneyClientError && error.code === "ACKNOWLEDGED_UNREADABLE"
                  ? "ACKNOWLEDGED_UNREADABLE"
                  : "READY",
        });
      setMessage(issue(error));
    } finally {
      if (alive.current) setPending(false);
    }
  }
  const preview = reviewDraftPreview(view, draft);
  let valid = false;
  try {
    reviewDraftInput(view, draft);
    valid = true;
  } catch {
    /* No inferred defaults. */
  }
  const blocked = busy || disabled || draft.outcome !== "READY";
  return (
    <section className="management-card money-review" aria-label={t("review")}>
      <h3>{t("review")}</h3>
      <p>{t("reviewIntro")}</p>
      <MoneyReadout view={view} locale={locale} label={t("storedValue")} />
      {draft.raw && (
        <p>{t("reviewedRaw", { amount: draft.raw.amountMinor, currency: draft.raw.currency })}</p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {draft.expectedFactToken !== view.factToken && draft.outcome === "READY" && (
        <p className="notice">{t("staleDraft")}</p>
      )}
      <fieldset disabled={blocked}>
        <label>
          {t("scale")}
          <input
            inputMode="numeric"
            maxLength={2}
            value={draft.exponent}
            onChange={(e) => change({ ...draft, exponent: e.target.value, acknowledged: false })}
          />
        </label>
        <label>
          {t("unitMeaning")}
          <select
            value={draft.unitKind}
            onChange={(e) =>
              change({
                ...draft,
                unitKind: e.target.value as MoneyReviewDraft["unitKind"],
                acknowledged: false,
              })
            }
          >
            <option value="">{t("choose")}</option>
            <option
              value="SUPPORTED"
              disabled={!draft.raw || !valuationCurrencyCodes.includes(draft.raw.currency)}
            >
              {t("supportedUnit", { currency: draft.raw?.currency ?? "" })}
            </option>
            <option value="UNSUPPORTED">{t("otherUnit")}</option>
          </select>
        </label>
        {draft.unitKind === "UNSUPPORTED" && (
          <label>
            {t("unitLabel")}
            <input
              maxLength={120}
              value={draft.unitLabel}
              onChange={(e) => change({ ...draft, unitLabel: e.target.value, acknowledged: false })}
            />
          </label>
        )}
        <label>
          {t("evidenceCategory")}
          <select
            value={draft.category}
            onChange={(e) =>
              change({
                ...draft,
                category: e.target.value as MoneyReviewDraft["category"],
                acknowledged: false,
              })
            }
          >
            <option value="">{t("choose")}</option>
            <option value="OWNER_ATTESTATION">{t("ownerEvidence")}</option>
            <option value="OPERATOR_VERIFIED_RECORD">{t("operatorEvidence")}</option>
          </select>
        </label>
        <label>
          {t("evidenceReason")}
          <textarea
            maxLength={4000}
            value={draft.reason}
            onChange={(e) => change({ ...draft, reason: e.target.value, acknowledged: false })}
          />
        </label>
        <label>
          {t("evidenceReference")}
          <input
            maxLength={800}
            value={draft.reference}
            onChange={(e) => change({ ...draft, reference: e.target.value, acknowledged: false })}
          />
        </label>
        {preview !== null && (
          <p role="status">
            {t("reviewPreview", {
              amount: preview.replace(".", locale === "de" ? "," : "."),
              currency:
                draft.unitKind === "UNSUPPORTED" ? draft.unitLabel : (draft.raw?.currency ?? ""),
            })}
          </p>
        )}
        {draft.exponent && preview === null && <p className="error">{t("reviewInvalid")}</p>}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.acknowledged}
            onChange={(e) => change({ ...draft, acknowledged: e.target.checked })}
          />
          {t("reviewAck")}
        </label>
        <button type="button" disabled={!valid || blocked} onClick={confirmMeaning}>
          {t("confirmMeaning")}
        </button>
      </fieldset>
      {draft.outcome !== "READY" && (
        <div className="money-recovery">
          <button type="button" disabled={busy} onClick={inspect}>
            {t("checkCurrent")}
          </button>
          {inspected && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                change(initialReviewDraft(inspected));
                setInspected(null);
                setMessage("");
              }}
            >
              {t("adoptCurrent")}
            </button>
          )}
        </div>
      )}
      <details>
        <summary>{t("history")}</summary>
        {!history && (
          <button type="button" disabled={busy} onClick={() => historyPage()}>
            {t("checkCurrent")}
          </button>
        )}
        {history?.events.map((event) => (
          <article key={event.id} className="money-history-event">
            <h4>{t(`events.${event.operation}`)}</h4>
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString(locale)}
            </time>
            {event.reason && <p>{event.reason}</p>}
            {event.evidenceReference && (
              <p>
                {t("evidenceReference")}: {event.evidenceReference}
              </p>
            )}
            {event.evidenceErasedAt && <p>{t("evidenceRemoved")}</p>}
            {event.originSubject && event.originSubject.family !== "CATALOG" && (
              <Link href={`/${locale}/items/${event.originSubject.itemId}`}>{t("openOrigin")}</Link>
            )}
            {event.operation === "COPY" && <p>{t("copiedEvidence")}</p>}
            {event.expectedAssertionToken &&
              !event.revocationId &&
              !event.evidenceErasedAt &&
              !revoked.current.has(event.id) && (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setRevokeId(event.id);
                    setRevokeReason("");
                    setRevokeAck(false);
                  }}
                >
                  {t("revoke")}
                </button>
              )}
          </article>
        ))}
        {history?.nextCursor && (
          <button type="button" disabled={busy} onClick={() => historyPage(history.nextCursor!)}>
            {t("olderHistory")}
          </button>
        )}
      </details>
      {revokeId && (
        <fieldset disabled={blocked}>
          <legend>{t("revoke")}</legend>
          <label>
            {t("revokeReason")}
            <textarea
              maxLength={4000}
              value={revokeReason}
              onChange={(e) => {
                setRevokeReason(e.target.value);
                setRevokeAck(false);
              }}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={revokeAck}
              onChange={(e) => setRevokeAck(e.target.checked)}
            />
            {t("revokeAck")}
          </label>
          <button type="button" disabled={!revokeAck || !revokeReason.trim()} onClick={revoke}>
            {t("confirmRevoke")}
          </button>
        </fieldset>
      )}
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
        {t("closeReview")}
      </button>
    </section>
  );
}
