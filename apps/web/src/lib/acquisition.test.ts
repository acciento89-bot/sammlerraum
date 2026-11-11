import { describe, it, expect } from "vitest";
import { acquisitionEligibility, parseAcquisitionStart } from "./acquisition";
const now = new Date("2026-11-12T12:00:00Z");
const start = new Date("2026-11-12T11:00:00Z");
const user = {
  id: "private-account-id",
  email: "collector@example.org",
  emailVerified: true,
  createdAt: new Date("2026-11-12T11:02:00Z"),
  applicationRoleGrant: null,
};
const options = {
  start,
  now,
  secret: "test-secret-only-not-production",
  firstItemAt: null as Date | null,
};
describe("verified acquisition eligibility", () => {
  it("reports confirmed signup with stable opaque dedup ID and no personal data", () => {
    const a = acquisitionEligibility(user, options);
    expect(a.events.map((e) => e.kind)).toEqual(["registration"]);
    expect(a).toEqual(
      acquisitionEligibility(user, { ...options, now: new Date(now.getTime() + 1000) }),
    );
    expect(JSON.stringify(a)).not.toMatch(/collector|example.org|private-account-id/);
    expect(a.events[0]?.transactionId).toMatch(/^sr_[a-f0-9]{40}$/);
  });
  it("never counts unverified, old, internal, privileged or missing accounts", () => {
    for (const entry of [
      null,
      { ...user, emailVerified: false },
      { ...user, createdAt: new Date("2026-11-08") },
      { ...user, email: "contact@kamilunavo.com" },
      { ...user, email: "contact+test@kamilunavo.com" },
      { ...user, email: "fixture@example.test" },
      { ...user, applicationRoleGrant: { role: "MODERATOR" } },
    ])
      expect(acquisitionEligibility(entry, options).events).toEqual([]);
  });
  it("adds activation only for a real first item created after account registration", () => {
    expect(
      acquisitionEligibility(user, {
        ...options,
        firstItemAt: new Date("2026-11-12T11:03:00Z"),
      }).events.map((e) => e.kind),
    ).toEqual(["registration", "first_item"]);
    expect(
      acquisitionEligibility(user, { ...options, firstItemAt: new Date("2026-11-11") }).events,
    ).toHaveLength(1);
  });
  it("rejects missing, future, expired or malformed attribution", () => {
    for (const raw of [
      null,
      "",
      "NaN",
      "1",
      "9999999999999",
      String(now.getTime() + 1),
      String(now.getTime() - 31 * 86400000),
    ])
      expect(() => parseAcquisitionStart(raw, now)).toThrow();
    expect(parseAcquisitionStart(String(start.getTime()), now)).toEqual(start);
  });
});
