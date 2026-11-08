import { describe, expect, it } from "vitest";
import {
  MoneyViewSchema,
  type MoneyView,
  type ExistingMoneyIntent,
} from "@sammlerraum/contracts/legacy-money";
import { acceptsMoneyAcknowledgement } from "./legacy-money-acknowledgement";
const subject = { family: "PURCHASE" as const, itemId: "00000000-0000-4000-8000-000000000001" };
const authored = (): MoneyView =>
  MoneyViewSchema.parse({
    schemaVersion: 1,
    subject,
    raw: { amountMinor: "100", currency: "AFN" },
    factToken: "new_fact",
    interpretation: {
      kind: "INTERPRETED",
      exponent: 2,
      unitKey: "iso4217-2026-09-17:AFN",
      basisId: "legacy-money-iso-2026-09-17-v1",
      assertionId: "00000000-0000-4000-8000-000000000002",
      eventId: "00000000-0000-4000-8000-000000000002",
      evidenceCategory: null,
      eligibility: "ELIGIBLE",
      decimal: "1.00",
    },
  });
const intent: ExistingMoneyIntent = {
  op: "REPLACE",
  expectedFactToken: "old_fact",
  authoring: {
    kind: "DECIMAL",
    profileId: "legacy-money-iso-2026-09-17-v1",
    currency: "AFN",
    decimal: "1",
  },
};
describe("money acknowledgment identity and meaning", () => {
  it("accepts the exact newly authored raw pair, pinned scale and new token", () => {
    expect(acceptsMoneyAcknowledgement(authored(), subject, intent)).toBe(true);
  });
  it("rejects a valid response for another subject and a stale successful same-pair response", () => {
    expect(
      acceptsMoneyAcknowledgement(
        {
          ...authored(),
          subject: {
            family: "CUSTOM",
            itemId: subject.itemId,
            fieldDefinitionId: "00000000-0000-4000-8000-000000000003",
          },
        },
        subject,
        intent,
      ),
    ).toBe(false);
    expect(
      acceptsMoneyAcknowledgement({ ...authored(), factToken: "old_fact" }, subject, intent),
    ).toBe(false);
  });
  it("rejects valid historical meaning or a different new amount as an acknowledgment of replacement", () => {
    const v = authored();
    if (v.interpretation.kind !== "INTERPRETED") throw Error();
    const historical = MoneyViewSchema.parse({
      ...v,
      interpretation: {
        ...v.interpretation,
        exponent: 0,
        decimal: "100",
        evidenceCategory: "OWNER_ATTESTATION",
        basisId: "OWNER_ATTESTATION:v1",
      },
    });
    expect(acceptsMoneyAcknowledgement(historical, subject, intent)).toBe(false);
    expect(
      acceptsMoneyAcknowledgement(v, subject, {
        ...intent,
        authoring: {
          kind: "DECIMAL",
          profileId: "legacy-money-iso-2026-09-17-v1",
          currency: "AFN",
          decimal: "2",
        },
      }),
    ).toBe(false);
  });
  it("requires exact absence and a changed token for clear, and exact token for explicit retention", () => {
    const missing = MoneyViewSchema.parse({
      schemaVersion: 1,
      subject,
      raw: null,
      factToken: "cleared_fact",
      interpretation: { kind: "MISSING" },
    });
    expect(
      acceptsMoneyAcknowledgement(missing, subject, { op: "CLEAR", expectedFactToken: "old_fact" }),
    ).toBe(true);
    expect(
      acceptsMoneyAcknowledgement(authored(), subject, {
        op: "CLEAR",
        expectedFactToken: "old_fact",
      }),
    ).toBe(false);
    expect(
      acceptsMoneyAcknowledgement(authored(), subject, {
        op: "RETAIN",
        expectedFactToken: "new_fact",
      }),
    ).toBe(true);
    expect(
      acceptsMoneyAcknowledgement(authored(), subject, {
        op: "RETAIN",
        expectedFactToken: "old_fact",
      }),
    ).toBe(false);
  });
});
