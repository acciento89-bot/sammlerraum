import { afterEach, describe, expect, it } from "vitest";
import { MoneyViewSchema } from "@sammlerraum/contracts/legacy-money";
import {
  initialReviewDraft,
  reviewDraftInput,
  reviewDraftPreview,
  rememberMoneyReview,
  recallMoneyReview,
  activeMoneyReview,
  setActiveMoneyReview,
  clearMoneyReviewDrafts,
} from "./money-review-draft";
const view = MoneyViewSchema.parse({
  schemaVersion: 1,
  subject: { family: "PURCHASE", itemId: "00000000-0000-4000-8000-000000000001" },
  raw: { amountMinor: "100", currency: "AFN" },
  factToken: "original_token",
  interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
});
afterEach(clearMoneyReviewDrafts);
describe("explicit evidenced historical-money review draft", () => {
  it("requires explicit scale, unit, evidence and acknowledgment without clamping or changing raw", () => {
    const empty = initialReviewDraft(view);
    expect(() => reviewDraftInput(view, empty)).toThrow();
    expect(reviewDraftPreview(view, empty)).toBeNull();
    const draft = {
      ...empty,
      exponent: "0",
      unitKind: "SUPPORTED" as const,
      category: "OWNER_ATTESTATION" as const,
      reason: "Original whole units",
      acknowledged: true,
    };
    expect(reviewDraftInput(view, draft)).toMatchObject({
      expectedFactToken: view.factToken,
      exponent: 0,
      unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
    });
    expect(reviewDraftPreview(view, draft)).toBe("100");
    expect(reviewDraftPreview(view, { ...draft, exponent: "2" })).toBe("1.00");
    for (const exponent of ["", "-1", "10", "1.5", " 2", "02"])
      expect(() => reviewDraftInput(view, { ...draft, exponent })).toThrow();
    expect(() =>
      reviewDraftInput(view, { ...draft, category: "OPERATOR_VERIFIED_RECORD", reference: "" }),
    ).toThrow();
    expect(() => reviewDraftInput(view, { ...draft, outcome: "UNKNOWN" })).toThrow();
  });
  it("keeps private evidence and original precondition through locale remount, scoped by actual account", () => {
    const draft = {
      ...initialReviewDraft(view),
      exponent: "0",
      reason: "Private record",
      reference: "Drawer A",
    };
    rememberMoneyReview("owner-a", view.subject, draft);
    setActiveMoneyReview("owner-a", "item-scope", view.subject);
    expect(recallMoneyReview("owner-a", view.subject)).toEqual(draft);
    expect(activeMoneyReview("owner-a", "item-scope")).toEqual(view.subject);
    expect(activeMoneyReview("owner-a", "other-item")).toBeNull();
    const recalled = recallMoneyReview("owner-a", view.subject)!;
    recalled.reason = "Changed";
    expect(recallMoneyReview("owner-a", view.subject)?.reason).toBe("Private record");
    expect(recallMoneyReview("owner-b", view.subject)).toBeUndefined();
    expect(activeMoneyReview("owner-a", "item-scope")).toBeNull();
  });
  it("previews the exact raw fact captured when review began, never a newer raw pair after remount", () => {
    const draft = { ...initialReviewDraft(view), exponent: "0", unitKind: "SUPPORTED" as const };
    const newer = {
      ...view,
      factToken: "newer_token",
      raw: { amountMinor: "999", currency: "EUR" },
    };
    expect(reviewDraftPreview(newer, draft)).toBe("100");
    expect(reviewDraftPreview(view, { ...draft, unitKind: "" })).toBeNull();
  });
});
