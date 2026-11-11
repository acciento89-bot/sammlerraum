import { it, expect } from "vitest";
import {
  measurementChoice,
  campaignVisit,
  pendingConversions,
  CAMPAIGN,
} from "./acquisition-state";
it("fails closed for missing, malformed or expired consent", () => {
  for (const raw of [null, "{}", "broken", JSON.stringify({ choice: "accepted", at: 1 })])
    expect(measurementChoice(raw, 100 * 86400000)).toBe("unset");
  expect(measurementChoice(JSON.stringify({ choice: "declined", at: 100 }), 1000)).toBe("declined");
});
it("captures only the fixed campaign after opt-in and preserves original acquisition across OAuth", () => {
  const url = new URL(
    "https://sammlerraum.de/de/sammlung-verwalten?utm_campaign=" +
      CAMPAIGN +
      "&gclid=private-click",
  );
  expect(campaignVisit(url, "declined", null, 1000)).toBeNull();
  expect(campaignVisit(url, "accepted", null, 1000)).toEqual({ campaign: CAMPAIGN, started: 1000 });
  expect(
    campaignVisit(
      new URL("https://sammlerraum.de/de/account/profile"),
      "accepted",
      JSON.stringify({ campaign: CAMPAIGN, started: 1000 }),
      2000,
    ),
  ).toEqual({ campaign: CAMPAIGN, started: 1000 });
  expect(
    campaignVisit(new URL("https://sammlerraum.de/?utm_campaign=other"), "accepted", null, 1000),
  ).toBeNull();
});
it("deduplicates processed document events while preserving retry IDs", () => {
  const events = [
    { kind: "registration" as const, transactionId: "sr_one" },
    { kind: "first_item" as const, transactionId: "sr_two" },
  ];
  expect(pendingConversions(events, ["sr_one"])).toEqual([events[1]]);
  expect(pendingConversions(events, [])).toEqual(events);
});

it("keeps advertising click attribution but strips arbitrary and sensitive URL parameters", async () => {
  const { safeAdsPage } = await import("./acquisition-state");
  expect(
    safeAdsPage(
      new URL(
        "https://sammlerraum.de/de/login?token=secret&email=private%40example.org&gclid=valid_Click-123",
      ),
    ),
  ).toBe("https://sammlerraum.de/de/sammlung-verwalten?gclid=valid_Click-123");
  expect(
    safeAdsPage(new URL("https://sammlerraum.de/de/admin?q=private&gclid=bad%3Cscript%3E")),
  ).toBe("https://sammlerraum.de/de/sammlung-verwalten");
});
