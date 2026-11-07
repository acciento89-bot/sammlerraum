import { describe, expect, it } from "vitest";
import { MoneyFactTokenV1Schema, LegacyMoneyError } from "@sammlerraum/contracts/legacy-money";
import {
  encodeMoneyFactToken,
  decodeMoneyFactToken,
  encodeMoneyAssertionToken,
  decodeMoneyAssertionToken,
} from "./legacy-money-tokens";
const id = "b42572c3-dbf8-4c64-9203-593c5f181a41";
const fact = {
  v: 1,
  subject: { family: "PURCHASE", itemId: id },
  generation: "00000000-0000-0000-0000-000000000000",
  sequence: "1",
  raw: { amountMinor: "1", currency: "AFN" },
  effectiveEventId: id,
  originId: id,
  originEvidenceErasedAt: null,
  revocationId: null,
};
describe("canonical money equality tokens", () => {
  it("binds the actual origin evidence-erasure state in the fact shape", () => {
    expect(MoneyFactTokenV1Schema.safeParse(fact).success).toBe(true);
    const { originEvidenceErasedAt: _, ...old } = fact;
    expect(MoneyFactTokenV1Schema.safeParse(old).success).toBe(false);
  });
  it("canonicalizes key order and roundtrips bounded fact contents including erasure", () => {
    const encoded = encodeMoneyFactToken(fact);
    expect(decodeMoneyFactToken(encoded)).toEqual(fact);
    expect(encodeMoneyFactToken(Object.fromEntries(Object.entries(fact).reverse()))).toBe(encoded);
    const erased = { ...fact, originEvidenceErasedAt: "2026-11-06T00:00:00.001Z" };
    expect(encodeMoneyFactToken(erased)).not.toBe(encoded);
    expect(decodeMoneyFactToken(encodeMoneyFactToken(erased))).toEqual(erased);
    expect(encoded.length).toBeLessThanOrEqual(2048);
  });
  it("rejects padding, noncanonical JSON/encoding, duplicate fields and damage", () => {
    const normal = JSON.stringify(fact);
    for (const token of [
      "a",
      "a".repeat(2049),
      "e30=",
      Buffer.from(` ${normal}`).toString("base64url"),
      Buffer.from(normal.replace('"v":1', '"v":1,"v":1')).toString("base64url"),
      Buffer.from([0xff]).toString("base64url"),
      Buffer.from(JSON.stringify({ ...fact, actorId: id })).toString("base64url"),
    ])
      expect(() => decodeMoneyFactToken(token)).toThrow(LegacyMoneyError);
  });
  it("keeps assertion preconditions separate and rejects cross-kind replay", () => {
    const assertion = {
      v: 1,
      subject: fact.subject,
      assertionId: id,
      evidenceErasedAt: null,
      revocationId: null,
    };
    const token = encodeMoneyAssertionToken(assertion);
    expect(decodeMoneyAssertionToken(token)).toEqual(assertion);
    expect(() => decodeMoneyFactToken(token)).toThrow(LegacyMoneyError);
    expect(() => decodeMoneyAssertionToken(encodeMoneyFactToken(fact))).toThrow(LegacyMoneyError);
  });
});
