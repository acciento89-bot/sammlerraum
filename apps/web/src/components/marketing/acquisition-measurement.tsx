"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CAMPAIGN,
  CONSENT_KEY,
  VISIT_KEY,
  SENT_KEY,
  safeAdsPage,
  measurementChoice,
  campaignVisit,
  pendingConversions,
  type Choice,
  type Visit,
} from "./acquisition-state";
import { ADS_TAG, ADS_DESTINATIONS } from "./ads-config";
import styles from "./acquisition.module.css";

type Event = { kind: "registration" | "first_item"; transactionId: string };
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}
let loading: Promise<void> | undefined;
function loadTag(): Promise<void> {
  if (loading) return loading;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function (..._args: unknown[]) {
      window.dataLayer!.push(arguments);
    };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("consent", "update", {
    ad_storage: "granted",
    analytics_storage: "denied",
    ad_user_data: "granted",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", ADS_TAG, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 2592000,
    page_location: safeAdsPage(new URL(window.location.href)),
    page_referrer: window.location.origin,
  });
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "sammlerraum-ads-tag";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_TAG}`;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      loading = undefined;
      reject(new Error("Measurement unavailable"));
    };
    document.head.append(script);
  });
  return loading;
}
function clearMeasurement() {
  localStorage.removeItem(VISIT_KEY);
  localStorage.removeItem(SENT_KEY);
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name?.startsWith("_gcl"))
      for (const domain of ["", `; domain=${location.hostname}`, `; domain=.${location.hostname}`])
        document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`;
  }
}

export function AcquisitionMeasurement({ locale }: { locale: string }) {
  const de = locale === "de",
    path = usePathname();
  const processed = useRef(new Set<string>());
  const [choice, setChoice] = useState<Choice>("unset"),
    [ready, setReady] = useState(false),
    [campaignEntry, setCampaignEntry] = useState(false),
    [open, setOpen] = useState(false),
    [visit, setVisit] = useState<Visit | null>(null);
  useEffect(() => {
    try {
      const now = Date.now(),
        current = measurementChoice(localStorage.getItem(CONSENT_KEY), now);
      const url = new URL(location.href);
      setCampaignEntry(
        ["/de/sammlung-verwalten", "/en/collection-manager"].includes(url.pathname) &&
          url.searchParams.get("utm_campaign") === CAMPAIGN,
      );
      setChoice(current);
      setReady(true);
      const attribution = campaignVisit(
        new URL(location.href),
        current,
        localStorage.getItem(VISIT_KEY),
        now,
      );
      setVisit(attribution);
      if (attribution) localStorage.setItem(VISIT_KEY, JSON.stringify(attribution));
      else localStorage.removeItem(VISIT_KEY);
    } catch {
      setChoice("declined");
      setReady(true);
      setVisit(null);
    }
  }, [path]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) location.reload();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function select(next: "accepted" | "declined") {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: next, at: Date.now() }));
      if (next === "declined") {
        clearMeasurement();
        setVisit(null);
      } else {
        const v = campaignVisit(
          new URL(location.href),
          next,
          localStorage.getItem(VISIT_KEY),
          Date.now(),
        );
        if (v) localStorage.setItem(VISIT_KEY, JSON.stringify(v));
        setVisit(v);
      }
      setChoice(next);
      setOpen(false);
      if (next === "declined" && choice === "accepted") location.reload();
    } catch {
      setChoice("declined");
      setVisit(null);
      setOpen(false);
    }
  }
  useEffect(() => {
    if (choice !== "accepted" || !visit || path.includes("/admin")) return;
    let stopped = false,
      busy = false;
    const inflight = new Set<string>();
    const activeConsent = () => {
      try {
        return measurementChoice(localStorage.getItem(CONSENT_KEY), Date.now()) === "accepted";
      } catch {
        return false;
      }
    };
    const run = async () => {
      if (stopped || busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        if (!activeConsent()) {
          clearMeasurement();
          location.reload();
          return;
        }
        await loadTag();
        if (stopped || !activeConsent()) return;
        const response = await fetch(`/api/v1/acquisition/status?started=${visit.started}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok || stopped || !activeConsent()) return;
        const body = (await response.json()) as { events: Event[] };
        for (const event of pendingConversions(body.events, [...processed.current])) {
          if (stopped || !activeConsent()) return;
          if (inflight.has(event.transactionId) || !ADS_DESTINATIONS[event.kind]) continue;
          inflight.add(event.transactionId);
          // The transaction ID is an opaque HMAC; no email, name, raw account ID or item data.
          window.gtag?.("event", "conversion", {
            send_to: ADS_DESTINATIONS[event.kind],
            transaction_id: event.transactionId,
            value: 0,
            currency: "EUR",
            page_location: location.origin + "/de/sammlung-verwalten",
            page_referrer: location.origin,
            event_timeout: 3000,
            event_callback: () => {
              inflight.delete(event.transactionId);
              // A gtag callback acknowledges local processing, not Google's receipt.
              // Dedup only this document; a new visit or reconnect retries the same ID.
              if (!stopped && activeConsent()) processed.current.add(event.transactionId);
            },
          });
        }
      } catch {
        /* An unavailable measurement provider never interrupts collection management. */
      } finally {
        busy = false;
      }
    };
    void run();
    const interval = setInterval(() => void run(), 15000);
    const changed = () => void run();
    const reconnected = () => {
      processed.current.clear();
      void run();
    };
    window.addEventListener("online", reconnected);
    window.addEventListener("focus", changed);
    document.addEventListener("visibilitychange", changed);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", changed);
      window.removeEventListener("online", reconnected);
      document.removeEventListener("visibilitychange", changed);
    };
  }, [choice, visit, path]);
  return (
    <>
      <button type="button" className={styles.preferences} onClick={() => setOpen(true)}>
        {de ? "Werbemessung verwalten" : "Advertising measurement"}
      </button>
      {ready && (open || (choice === "unset" && campaignEntry)) && (
        <section
          className={styles.consent}
          aria-label={de ? "Optionale Werbemessung" : "Optional advertising measurement"}
        >
          <div>
            <strong>
              {de
                ? "Hilfst du uns, Werbung sinnvoll einzusetzen?"
                : "Help us measure useful advertising?"}
            </strong>
            <p>
              {de
                ? "Mit deiner Erlaubnis misst Google Ads, ob aus unserer Werbung ein bestätigtes neues Konto und ein erstes Sammlerstück entstehen. Dabei werden Werbe-Kennungen und technische Verbindungsdaten verarbeitet, auch in den USA. Keine Namen, E-Mail-Adressen oder Sammlungsinhalte. Ohne Zustimmung funktioniert alles genauso. Auswahl gilt 30 Tage; jederzeit hier widerrufbar."
                : "With your permission, Google Ads measures confirmed new accounts and first items following our advertising. Advertising identifiers and technical connection data may be processed in the USA. No names, emails or collection contents. Everything works without consent. Your choice lasts 30 days and can be withdrawn here."}
            </p>
            <a href={`/legal/${de ? "de" : "en"}/privacy#advertising`}>
              {de ? "Datenschutzhinweise" : "Privacy details"}
            </a>
          </div>
          <div className={styles.choices}>
            <button type="button" onClick={() => select("declined")}>
              {de ? "Ohne Werbemessung" : "Without measurement"}
            </button>
            <button type="button" onClick={() => select("accepted")}>
              {de ? "Werbemessung erlauben" : "Allow measurement"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
