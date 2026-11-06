import { describe, expect, it } from "vitest";
import { MoneyViewSchema, type ClassifyMoneyInput } from "@sammlerraum/contracts/legacy-money";
import { MoneyCapabilitiesSchema } from "@sammlerraum/contracts/money-capabilities";
import {
  acceptsClassification,
  classifyPersonalMoney,
  readPersonalMoneyHistory,
  revokePersonalMoney,
} from "./money-review-client";
const itemId = "00000000-0000-4000-8000-000000000001",
  assertionId = "00000000-0000-4000-8000-000000000002";
const before = MoneyViewSchema.parse({
  schemaVersion: 1,
  subject: { family: "PURCHASE", itemId },
  raw: { amountMinor: "100", currency: "AFN" },
  factToken: "before",
  interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
});
const input: ClassifyMoneyInput = {
  expectedFactToken: "before",
  exponent: 0,
  unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
  evidence: { category: "OWNER_ATTESTATION", reason: "Synthetic private record" },
};
const next = MoneyViewSchema.parse({
  ...before,
  factToken: "after",
  interpretation: {
    kind: "INTERPRETED",
    exponent: 0,
    unitKey: "iso4217-2026-09-17:AFN",
    basisId: "OWNER_ATTESTATION:v1",
    assertionId,
    eventId: assertionId,
    evidenceCategory: "OWNER_ATTESTATION",
    eligibility: "ELIGIBLE",
    decimal: "100",
  },
});
const capabilities = MoneyCapabilitiesSchema.parse({
  schemaVersion: 1,
  actorId: "owner",
  readVersion: 1,
  classificationVersion: 1,
  authoringProfiles: [
    {
      profileId: "legacy-money-iso-2026-09-17-v1",
      authorityHash: "33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff",
    },
  ],
  canonicalConsumers: false,
});
describe("private one-fact review browser receipts", () => {
  it("accepts only the exact subject, unchanged raw pair, evidenced scale/unit/category and a new fact token", () => {
    expect(acceptsClassification(next, before, input)).toBe(true);
    expect(
      acceptsClassification(
        { ...next, subject: { family: "PURCHASE", itemId: assertionId } },
        before,
        input,
      ),
    ).toBe(false);
    expect(acceptsClassification({ ...next, factToken: "before" }, before, input)).toBe(false);
    expect(acceptsClassification(next, before, { ...input, exponent: 2 })).toBe(false);
    expect(
      acceptsClassification(next, before, {
        ...input,
        evidence: {
          category: "OPERATOR_VERIFIED_RECORD",
          reason: "Different",
          reference: "Receipt",
        },
      }),
    ).toBe(false);
    expect(
      acceptsClassification(
        { ...next, raw: { amountMinor: "101", currency: "AFN" } },
        before,
        input,
      ),
    ).toBe(false);
  });
  it("treats a schema-valid wrong classification acknowledgment as uncertain instead of adopting it", async () => {
    await expect(
      classifyPersonalMoney(before, input, capabilities, async () =>
        Response.json({
          schemaVersion: 1,
          money: { ...next, subject: { family: "PURCHASE", itemId: assertionId } },
        }),
      ),
    ).rejects.toMatchObject({ code: "ACKNOWLEDGED_UNREADABLE" });
    expect(
      await classifyPersonalMoney(before, input, capabilities, async () =>
        Response.json({ schemaVersion: 1, money: next }),
      ),
    ).toEqual(next);
  });
  it("binds bounded private history and revocation receipts to the exact requested scope and assertion", async () => {
    await expect(
      readPersonalMoneyHistory(before, undefined, async () =>
        Response.json({
          schemaVersion: 1,
          subject: { family: "PURCHASE", itemId: assertionId },
          events: [],
          nextCursor: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "READ_FAILED" });
    const revoke = {
      assertionId,
      expectedAssertionToken: "assertion_token",
      reason: "Synthetic revocation",
    };
    await expect(
      revokePersonalMoney(before, revoke, capabilities, async () =>
        Response.json({
          schemaVersion: 1,
          subject: before.subject,
          assertionId: itemId,
          revoked: true,
        }),
      ),
    ).rejects.toMatchObject({ code: "ACKNOWLEDGED_UNREADABLE" });
    await expect(
      revokePersonalMoney(before, revoke, capabilities, async () =>
        Response.json({ schemaVersion: 1, subject: before.subject, assertionId, revoked: true }),
      ),
    ).resolves.toBeUndefined();
  });
});
