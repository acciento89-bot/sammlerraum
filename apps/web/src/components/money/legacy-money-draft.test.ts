import { afterEach, describe, expect, it } from "vitest";
import { MoneyViewSchema, type MoneyView } from "@sammlerraum/contracts/legacy-money";
import {
  initialMoneyDraft,
  moneyDraftIntent,
  displayStoredMoney,
  rememberMoneyDraft,
  recallMoneyDraft,
  clearMoneyDrafts,
} from "./legacy-money-draft";
const view = (currency = "AFN"): MoneyView =>
  MoneyViewSchema.parse({
    schemaVersion: 1,
    subject: { family: "PURCHASE", itemId: "00000000-0000-4000-8000-000000000001" },
    raw: { amountMinor: "100", currency },
    factToken: "synthetic_token",
    interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
  });
afterEach(clearMoneyDrafts);
describe("deliberate monetary draft semantics", () => {
  it("blocks even a normal save while a previous outcome has not been reconciled", () => {
    const draft = { ...initialMoneyDraft(view()), outcome: "UNKNOWN" as const };
    expect(() => moneyDraftIntent(draft, view(), true)).toThrow("MONEY_OUTCOME_UNCERTAIN");
  });
  it("never parses or authors an untouched historical pair on an ordinary save", () => {
    const historical = view("ZZZ");
    const draft = initialMoneyDraft(historical);
    expect(draft.currency).toBe("ZZZ");
    expect(draft.decimal).toBe("");
    expect(moneyDraftIntent(draft, historical, true)).toBeUndefined();
  });
  it("requires explicit acknowledgment and audit note before replacing old AFN with the pinned new decimal", () => {
    const old = view(),
      draft = {
        ...initialMoneyDraft(old),
        mode: "REPLACE" as const,
        decimal: "1",
        currency: "AFN",
      };
    expect(() => moneyDraftIntent(draft, old, true)).toThrow();
    expect(() => moneyDraftIntent({ ...draft, acknowledged: true }, old, true)).toThrow();
    expect(
      moneyDraftIntent(
        { ...draft, acknowledged: true, correctionReason: "New acquisition record" },
        old,
        true,
      ),
    ).toEqual({
      op: "REPLACE",
      expectedFactToken: old.factToken,
      authoring: {
        kind: "DECIMAL",
        profileId: "legacy-money-iso-2026-09-17-v1",
        currency: "AFN",
        decimal: "1",
      },
      correctionReason: "New acquisition record",
    });
  });
  it("separates explicit clear from blank/invalid replacement and never fabricates a missing token", () => {
    const old = view();
    expect(() =>
      moneyDraftIntent(
        {
          ...initialMoneyDraft(old),
          mode: "REPLACE",
          acknowledged: true,
          correctionReason: "Reason",
        },
        old,
        true,
      ),
    ).toThrow();
    expect(() =>
      moneyDraftIntent({ ...initialMoneyDraft(old), mode: "CLEAR" }, old, true),
    ).toThrow();
    expect(
      moneyDraftIntent({ ...initialMoneyDraft(old), mode: "CLEAR", acknowledged: true }, old, true),
    ).toEqual({ op: "CLEAR", expectedFactToken: old.factToken });
    expect(() =>
      moneyDraftIntent({ ...initialMoneyDraft(null), mode: "REPLACE", decimal: "1" }, null, true),
    ).toThrow();
  });
  it("authors a new decimal only through the pinned explicit profile and rejects unsupported codes/grouping", () => {
    const draft = { ...initialMoneyDraft(null), mode: "REPLACE" as const, decimal: "1,23" };
    expect(moneyDraftIntent(draft, null, false)).toEqual({
      op: "NEW",
      authoring: {
        kind: "DECIMAL",
        profileId: "legacy-money-iso-2026-09-17-v1",
        currency: "EUR",
        decimal: "1,23",
      },
    });
    expect(() => moneyDraftIntent({ ...draft, currency: "ZZZ" }, null, false)).toThrow();
    expect(() => moneyDraftIntent({ ...draft, decimal: "1,234.00" }, null, false)).toThrow();
  });
  it("displays stored scale independently of locale and the current ISO exponent", () => {
    const unknown = view();
    expect(displayStoredMoney(unknown, "de")).toEqual({
      amount: "100",
      currency: "AFN",
      status: "UNKNOWN",
    });
    const known = MoneyViewSchema.parse({
      ...unknown,
      interpretation: {
        kind: "INTERPRETED",
        exponent: 0,
        unitKey: "iso4217-2026-09-17:AFN",
        basisId: "OWNER_ATTESTATION:v1",
        assertionId: "00000000-0000-4000-8000-000000000002",
        eventId: "00000000-0000-4000-8000-000000000002",
        evidenceCategory: "OWNER_ATTESTATION",
        eligibility: "ELIGIBLE",
        decimal: "100",
      },
    });
    expect(displayStoredMoney(known, "en")).toEqual({
      amount: "100",
      currency: "AFN",
      status: "INTERPRETED",
    });
  });
  it("does not silently rebase an edited draft onto a newer fact token after locale navigation", () => {
    const old = view(),
      latest = { ...old, factToken: "newer_token" };
    const draft = {
      ...initialMoneyDraft(old),
      mode: "REPLACE" as const,
      decimal: "2",
      acknowledged: true,
      correctionReason: "Correct the original displayed value",
    };
    expect(moneyDraftIntent(draft, latest, true)).toMatchObject({
      expectedFactToken: old.factToken,
    });
  });
  it("preserves exact typed draft through locale remount but separates accounts and clears on logout", () => {
    const draft = {
      ...initialMoneyDraft(view()),
      mode: "REPLACE" as const,
      decimal: "1,23",
      acknowledged: true,
      correctionReason: "Private note",
    };
    rememberMoneyDraft("owner-a", "purchase:item", draft);
    const recalled = recallMoneyDraft("owner-a", "purchase:item");
    expect(recalled).toEqual(draft);
    recalled!.decimal = "999";
    expect(recallMoneyDraft("owner-a", "purchase:item")!.decimal).toBe("1,23");
    expect(recallMoneyDraft("owner-b", "purchase:item")).toBeUndefined();
    expect(recallMoneyDraft("owner-a", "purchase:item")).toBeUndefined();
    rememberMoneyDraft("owner-a", "purchase:item", draft);
    clearMoneyDrafts();
    expect(recallMoneyDraft("owner-a", "purchase:item")).toBeUndefined();
  });
});
