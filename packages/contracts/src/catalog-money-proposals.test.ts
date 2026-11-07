import { describe, it, expect } from "vitest";
import {
  SubmitCatalogMoneyProposalInputSchema,
  StoredProposalMoneyEnvelopeSchema,
} from "./catalog-proposals";
const id = "b42572c3-dbf8-4c64-9203-593c5f181a41";
const authoring = {
  kind: "DECIMAL",
  profileId: "legacy-money-iso-2026-09-17-v1",
  currency: "AFN",
  decimal: "1",
};
const proposal = {
  targetEntryId: null,
  baseRevision: null,
  patch: {
    kind: "CREATE_ENTRY",
    input: {
      categoryTemplateId: id,
      text: { language: "en", title: "Reference specimen" },
      attributes: [{ definitionId: id, value: { amountMinor: 100, currency: "AFN" } }],
    },
  },
  summary: "Explain the reference correction",
};
const path = { target: "ENTRY", definitionId: id, intent: { op: "NEW", authoring } };
const input = { proposal, money: { schemaVersion: 1, intents: [path] } };
const receipt = {
  schemaVersion: 1,
  profileId: "legacy-money-iso-2026-09-17-v1",
  authorityHash: "33139b438657d1cee116ba737807ea71d19d6de4b90fcc6a1b0ff",
  raw: { amountMinor: "100", currency: "AFN" },
  exponent: 2,
  unitKey: "iso4217-2026-09-17:AFN",
  normalizedDecimal: "1.00",
};
describe("catalog money proposal structural boundary (no producer authority)", () => {
  it("accepts explicit authoring without taking a client receipt or generated variant UUID", () => {
    expect(SubmitCatalogMoneyProposalInputSchema.safeParse(input).success).toBe(true);
    expect(
      SubmitCatalogMoneyProposalInputSchema.safeParse({
        ...input,
        money: { schemaVersion: 1, intents: [{ ...path, intent: { op: "NEW", receipt } }] },
      }).success,
    ).toBe(false);
    expect(
      SubmitCatalogMoneyProposalInputSchema.safeParse({
        ...input,
        money: { schemaVersion: 1, intents: [{ ...path, target: id }] },
      }).success,
    ).toBe(false);
  });
  it("bounds and deduplicates exact target/definition paths", () => {
    expect(
      SubmitCatalogMoneyProposalInputSchema.safeParse({
        ...input,
        money: { schemaVersion: 1, intents: [path, path] },
      }).success,
    ).toBe(false);
    expect(
      SubmitCatalogMoneyProposalInputSchema.safeParse({
        ...input,
        money: { schemaVersion: 1, intents: Array.from({ length: 101 }, () => path) },
      }).success,
    ).toBe(false);
  });
  it("accepts empty money intents for nonmoney proposals and enforces the total byte cap", () => {
    const empty = {
      proposal: {
        ...proposal,
        patch: { ...proposal.patch, input: { ...proposal.patch.input, attributes: [] } },
      },
      money: { schemaVersion: 1, intents: [] },
    };
    expect(SubmitCatalogMoneyProposalInputSchema.safeParse(empty).success).toBe(true);
    expect(
      SubmitCatalogMoneyProposalInputSchema.safeParse({
        ...input,
        proposal: {
          ...proposal,
          patch: {
            ...proposal.patch,
            input: {
              ...proposal.patch.input,
              attributes: [{ definitionId: id, value: "x".repeat(65537) }],
            },
          },
        },
      }).success,
    ).toBe(false);
  });
  it("rejects CLEAR for a still-present submitted path and per-path human notes instead of dropping them", () => {
    for (const intent of [
      { op: "CLEAR", expectedFactToken: "a" },
      {
        op: "REPLACE",
        expectedFactToken: "a",
        authoring,
        correctionReason: "Use the required proposal summary instead",
      },
    ])
      expect(
        SubmitCatalogMoneyProposalInputSchema.safeParse({
          ...input,
          money: { schemaVersion: 1, intents: [{ ...path, intent }] },
        }).success,
      ).toBe(false);
  });
  it("retains bounded server receipts only in a separate strict stored envelope", () => {
    const good = {
      ...receipt,
      authorityHash: "33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff",
    };
    const stored = {
      schemaVersion: 1,
      baseRevision: null,
      patchDigest: "a".repeat(64),
      paths: [{ target: "ENTRY", definitionId: id, kind: "AUTHORED", receipt: good }],
    };
    expect(StoredProposalMoneyEnvelopeSchema.safeParse(stored).success).toBe(true);
    expect(
      StoredProposalMoneyEnvelopeSchema.safeParse({ ...stored, patchDigest: "A".repeat(64) })
        .success,
    ).toBe(false);
    expect(
      StoredProposalMoneyEnvelopeSchema.safeParse({ ...stored, actorId: "spoof" }).success,
    ).toBe(false);
  });
  it("accepts retained/replaced existing entry paths but requires NEW for a newly created subject", () => {
    const existing = {
      ...proposal,
      targetEntryId: id,
      baseRevision: 1,
      patch: {
        kind: "UPDATE_ENTRY",
        input: { attributes: [{ definitionId: id, value: { amountMinor: 100, currency: "AFN" } }] },
      },
    };
    for (const intent of [
      { op: "RETAIN", expectedFactToken: "a" },
      { op: "REPLACE", expectedFactToken: "a", authoring },
    ]) {
      expect(
        SubmitCatalogMoneyProposalInputSchema.safeParse({
          proposal: existing,
          money: { schemaVersion: 1, intents: [{ ...path, intent }] },
        }).success,
      ).toBe(true);
      expect(
        SubmitCatalogMoneyProposalInputSchema.safeParse({
          ...input,
          money: { schemaVersion: 1, intents: [{ ...path, intent }] },
        }).success,
      ).toBe(false);
    }
    const paths = Array.from({ length: 100 }, (_, n) => ({
      ...path,
      definitionId: `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
    }));
    expect(
      SubmitCatalogMoneyProposalInputSchema.safeParse({
        ...input,
        proposal: {
          ...proposal,
          patch: {
            ...proposal.patch,
            input: {
              ...proposal.patch.input,
              attributes: paths.map((p) => ({
                definitionId: p.definitionId,
                value: { amountMinor: 100, currency: "AFN" },
              })),
            },
          },
        },
        money: { schemaVersion: 1, intents: paths },
      }).success,
    ).toBe(true);
  });
});
