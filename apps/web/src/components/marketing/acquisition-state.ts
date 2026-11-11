export const CAMPAIGN = "sammlerraum-search-30-20261112";
export const CONSENT_KEY = "sr-measurement-choice-v1";
export const VISIT_KEY = "sr-measurement-visit-v1";
export const SENT_KEY = "sr-measurement-sent-v1";
export type Choice = "accepted" | "declined" | "unset";
export type Visit = { campaign: typeof CAMPAIGN; started: number };
const MAX_AGE = 30 * 86400000;
export function measurementChoice(raw: string | null, now: number): Choice {
  try {
    const value = JSON.parse(raw ?? "null");
    return value &&
      ["accepted", "declined"].includes(value.choice) &&
      Number.isFinite(value.at) &&
      value.at <= now &&
      now - value.at < MAX_AGE
      ? value.choice
      : "unset";
  } catch {
    return "unset";
  }
}
export function campaignVisit(
  url: URL,
  choice: Choice,
  raw: string | null,
  now: number,
): Visit | null {
  if (choice !== "accepted") return null;
  try {
    const v = JSON.parse(raw ?? "null");
    if (
      v?.campaign === CAMPAIGN &&
      Number.isFinite(v.started) &&
      v.started <= now &&
      now - v.started < MAX_AGE
    )
      return { campaign: CAMPAIGN, started: v.started };
  } catch {}
  return url.searchParams.get("utm_campaign") === CAMPAIGN
    ? { campaign: CAMPAIGN, started: now }
    : null;
}
export function pendingConversions<T extends { transactionId: string }>(
  events: T[],
  sent: string[],
): T[] {
  return events.filter((e) => !sent.includes(e.transactionId));
}

/** Keep the click identifiers Google needs, never auth tokens, emails, search terms or private paths. */
export function safeAdsPage(url: URL): string {
  const safe = new URL("/de/sammlung-verwalten", url.origin);
  for (const key of ["gclid", "gbraid", "wbraid"]) {
    const value = url.searchParams.get(key);
    if (value && /^[A-Za-z0-9_-]{1,256}$/.test(value)) safe.searchParams.set(key, value);
  }
  return safe.href;
}
