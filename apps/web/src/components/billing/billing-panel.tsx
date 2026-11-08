"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QUOTA_FEATURES, type BillingPolicy } from "@sammlerraum/contracts/billing";
import {
  BillingOverviewSchema,
  type BillingOverview,
  type BillingOffer,
} from "@sammlerraum/contracts/billing-ui";
import { formatDashboardInteger as integer } from "../search/dashboard-format";
import { PricePlans } from "./price-plans";
export function BillingPanel({
  locale,
  initial,
  policy,
  offers,
  paymentsEnabled,
  returned,
}: {
  locale: "de" | "en";
  initial: BillingOverview;
  policy: BillingPolicy | null;
  offers: BillingOffer[] | null;
  paymentsEnabled: boolean;
  returned: boolean;
}) {
  const t = useTranslations("Billing"),
    [own, setOwn] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const keys = useRef(new Map<string, string>()),
    inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/v1/billing/status", {
        cache: "no-store",
        credentials: "same-origin",
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw Error();
      const value = BillingOverviewSchema.parse((await response.json()).overview);
      if (!signal?.aborted && alive.current)
        setOwn((previous) => (value.readAt >= previous.readAt ? value : previous));
    } catch {
      if (!signal?.aborted && alive.current) setMessage("statusUnavailable");
    }
  }, []);
  useEffect(() => {
    if (!returned || own.plan === "PREMIUM") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined,
      remaining = 6;
    const poll = async () => {
      await refresh(controller.signal);
      if (!controller.signal.aborted && --remaining > 0) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 1500);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
    // Only a confirmed local state change terminates return polling.
  }, [returned, own.plan, refresh]);
  async function action(purpose: "checkout" | "portal", cadence?: "MONTHLY" | "YEARLY") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    const key = purpose + ":" + (cadence ?? "");
    let requestKey = keys.current.get(key);
    if (!requestKey) {
      requestKey = crypto.randomUUID();
      keys.current.set(key, requestKey);
    }
    try {
      const response = await fetch(`/api/v1/billing/${purpose}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, requestKey, ...(cadence ? { cadence } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body?.error?.code === "BILLING_CONFLICT" ? "conflict" : "actionUnavailable");
        return;
      }
      const target = new URL(body.url),
        host = purpose === "checkout" ? "checkout.stripe.com" : "billing.stripe.com";
      if (
        target.protocol !== "https:" ||
        target.hostname !== host ||
        target.port ||
        target.username ||
        target.password
      )
        throw Error();
      window.location.assign(target.href);
    } catch {
      if (alive.current) setMessage("actionUnavailable");
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const excess = QUOTA_FEATURES.some(
    (feature) =>
      own.limits[feature] !== null && BigInt(own.usage[feature]) > BigInt(own.limits[feature]!),
  );
  return (
    <>
      <section className="management-card" aria-labelledby="billing-current-heading">
        <h2 id="billing-current-heading">{t("currentPlan")}</h2>
        <p className="billing-plan" data-testid="billing-plan">
          {t(`plans.${own.plan}`)}
        </p>
        <p role="status">{t(`status.${own.plan}`)}</p>
        {returned && own.plan === "FREE" && (
          <p role="status" data-testid="billing-return-pending">
            {t("returnPending")}
          </p>
        )}
        {own.currentPeriodEnd && (
          <p data-testid="billing-period">
            {t(own.cancelAtPeriodEnd ? "cancelScheduled" : "periodEnd", {
              date: date(own.currentPeriodEnd),
            })}{" "}
            UTC
          </p>
        )}
        <p>{t("preservedData")}</p>
        {excess && (
          <p role="status" data-testid="billing-retained-excess">
            {t("excess")}
          </p>
        )}
        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {t("refresh")}
          </button>
          {own.hasCustomer && (
            <button
              type="button"
              disabled={!paymentsEnabled || busy}
              onClick={() => void action("portal")}
            >
              {t("manage")}
            </button>
          )}
        </div>
        {!paymentsEnabled && <p className="field-help">{t("paymentsUnavailable")}</p>}
        {message && <p role="status">{t(message)}</p>}
      </section>
      <section aria-labelledby="billing-usage-heading">
        <h2 id="billing-usage-heading">{t("usage")}</h2>
        <div className="billing-usage-grid">
          {QUOTA_FEATURES.map((feature) => {
            const limit = own.limits[feature],
              used = BigInt(own.usage[feature]),
              percentage =
                limit === null
                  ? 0
                  : limit === 0
                    ? used
                      ? 100
                      : 0
                    : Number(
                        (used * 100n) / BigInt(limit) > 100n ? 100n : (used * 100n) / BigInt(limit),
                      );
            return (
              <article
                className="management-card"
                key={feature}
                data-testid={`billing-usage-${feature}`}
              >
                <h3>{t(`features.${feature}`)}</h3>
                <p>
                  {integer(own.usage[feature], locale)} /{" "}
                  {limit === null ? t("unlimited") : integer(String(limit), locale)}
                </p>
                {limit !== null && (
                  <progress max={100} value={percentage} aria-label={t(`features.${feature}`)} />
                )}
              </article>
            );
          })}
        </div>
        <p className="field-help">{t("resetAt", { date: date(own.nextMonthlyResetAt) })} UTC</p>
        <p className="field-help">{t("mediaUsageHelp")}</p>
      </section>
      {own.plan === "FREE" ? (
        <section aria-labelledby="billing-upgrade-heading">
          <h2 id="billing-upgrade-heading">{t("upgrade")}</h2>
          <PricePlans
            locale={locale}
            policy={policy}
            offers={offers}
            busy={busy || !paymentsEnabled}
            choose={(cadence) => void action("checkout", cadence)}
          />
        </section>
      ) : (
        <p>{t("changeInPortal")}</p>
      )}
    </>
  );
}
