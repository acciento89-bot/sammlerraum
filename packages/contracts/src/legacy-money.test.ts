import { describe, expect, it } from "vitest";
import {
  HistoricalCurrencySchema,
  HistoricalMoneyValueSchema,
  ClassifyMoneyInputSchema,
  ExistingMoneyIntentSchema,
  MoneyFactTokenV1Schema,
} from "./legacy-money";
import { CreateItemInputSchema, CollectibleItemSchema, PurchaseCurrencySchema } from "./items";
import { CatalogAttributeValueSchema, CatalogSnapshotSchema } from "./catalog";
import {
  CustomFieldMoneyValueSchema,
  HistoricalCustomFieldMoneyValueSchema,
} from "./custom-fields";
const id = "b42572c3-dbf8-4c64-9203-593c5f181a41";
describe("legacy money bounded contracts", () => {
  it("historical_codes_survive_current_list", () => {
    const raw = { amountMinor: 1, currency: "ZZZ" };
    expect(HistoricalCurrencySchema.parse(raw.currency)).toBe("ZZZ");
    expect(HistoricalMoneyValueSchema.parse(raw)).toEqual(raw);
    const created = CreateItemInputSchema.parse({
      collectionId: id,
      title: "Synthetic old raw fact",
      purchaseAmountMinor: 1,
      purchaseCurrency: "EUR",
    });
    expect(
      CollectibleItemSchema.parse({
        ...created,
        id,
        categoryTemplateId: null,
        conditionOptionId: null,
        archivedAt: null,
        disposedAt: null,
        purchaseCurrency: raw.currency,
      }),
    ).toMatchObject({ purchaseCurrency: "ZZZ", purchaseAmountMinor: 1 });
    expect(
      CatalogAttributeValueSchema.parse({
        definitionId: id,
        key: "price",
        type: "MONEY",
        value: raw,
      }),
    ).toMatchObject({ value: raw });
    expect(PurchaseCurrencySchema.safeParse("ZZZ").success).toBe(false);
    expect(
      CreateItemInputSchema.safeParse({
        collectionId: id,
        title: "New raw",
        purchaseAmountMinor: 1,
        purchaseCurrency: "ZZZ",
      }).success,
    ).toBe(false);
  });
  it("strict_envelopes_bound_tokens_and_evidence", () => {
    const input = {
      expectedFactToken: "e30",
      exponent: 2,
      unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:EUR" },
      evidence: { category: "OWNER_ATTESTATION", reason: "Observed private receipt" },
    };
    expect(ClassifyMoneyInputSchema.safeParse(input).success).toBe(true);
    for (const value of [
      { ...input, currency: "USD" },
      { ...input, actorId: id },
      { ...input, exponent: 10 },
      { ...input, expectedFactToken: "a".repeat(2049) },
      { ...input, evidence: { category: "OPERATOR_VERIFIED_RECORD", reason: "Missing reference" } },
      { ...input, evidence: { category: "OWNER_ATTESTATION", reason: "bad\u0000reason" } },
    ])
      expect(ClassifyMoneyInputSchema.safeParse(value).success).toBe(false);
    expect(
      ExistingMoneyIntentSchema.safeParse({ op: "RETAIN", expectedFactToken: "e30", authoring: {} })
        .success,
    ).toBe(false);
    expect(
      MoneyFactTokenV1Schema.safeParse({
        v: 1,
        subject: { family: "PURCHASE", itemId: id },
        generation: null,
        sequence: "00",
        raw: null,
        effectiveEventId: null,
        originId: null,
        originEvidenceErasedAt: null,
        revocationId: null,
      }).success,
    ).toBe(false);
  });
});

import {
  LegacyMoneyAuthoringSchema,
  LegacyMoneySubjectSchema,
  AuthoringReceiptSchema,
  MoneyViewSchema,
  MoneyAssertionTokenV1Schema,
  LegacyUnitDeclarationSchema,
  NewMoneyIntentSchema,
  CorrectMoneyInputSchema,
  RevokeMoneyInputSchema,
  LEGACY_MONEY_PROFILE_ID,
  LEGACY_MONEY_AUTHORITY_HASH,
} from "./legacy-money";
const profileId = LEGACY_MONEY_PROFILE_ID;
const authoring = { kind: "DECIMAL", profileId, currency: "EUR", decimal: "1.23" };
const subject = { family: "PURCHASE", itemId: id };
const receipt = {
  schemaVersion: 1,
  profileId,
  authorityHash: LEGACY_MONEY_AUTHORITY_HASH,
  raw: { amountMinor: "123", currency: "EUR" },
  exponent: 2,
  unitKey: "iso4217-2026-09-17:EUR",
  normalizedDecimal: "1.23",
};
const interpretation = {
  kind: "INTERPRETED",
  exponent: 2,
  unitKey: receipt.unitKey,
  basisId: profileId,
  assertionId: id,
  eventId: id,
  evidenceCategory: null,
  eligibility: "ELIGIBLE",
  decimal: "1.23",
};
const view = { schemaVersion: 1, subject, raw: receipt.raw, factToken: "e30", interpretation };
describe("legacy money structural boundaries", () => {
  it("rejects malformed decimal syntax at the authoring wire boundary", () => {
    expect(LegacyMoneyAuthoringSchema.safeParse(authoring).success).toBe(true);
    for (const decimal of ["-1", "1e2", "1,234.00", ".5", "1.", "1 000", "\ud800"])
      expect(LegacyMoneyAuthoringSchema.safeParse({ ...authoring, decimal }).success).toBe(false);
  });
  it("binds interpreted units and evidence basis to the actual raw currency", () => {
    expect(MoneyViewSchema.safeParse(view).success).toBe(true);
    expect(
      MoneyViewSchema.safeParse({
        ...view,
        interpretation: { ...interpretation, unitKey: "iso4217-2026-09-17:AFN" },
      }).success,
    ).toBe(false);
    expect(
      MoneyViewSchema.safeParse({
        ...view,
        interpretation: {
          ...interpretation,
          unitKey: `unsupported:${id}`,
          eligibility: "UNIT_UNSUPPORTED",
        },
      }).success,
    ).toBe(false);
  });
  it.each([
    { family: "CUSTOM", itemId: id, fieldDefinitionId: id },
    { family: "CATALOG", entryId: id, revision: 1, target: { kind: "ENTRY" }, definitionId: id },
    {
      family: "CATALOG",
      entryId: id,
      revision: 2147483647,
      target: { kind: "VARIANT", variantId: id },
      definitionId: id,
    },
  ])("has fixed typed subject identities without arbitrary paths %j", (value) => {
    expect(LegacyMoneySubjectSchema.safeParse(value).success).toBe(true);
    expect(LegacyMoneySubjectSchema.safeParse({ ...value, path: "attributes[0]" }).success).toBe(
      false,
    );
  });
  it("rejects noncanonical identities and undeclared subjects", () => {
    for (const value of [
      { ...subject, itemId: id.toUpperCase() },
      { ...subject, table: "CollectibleItem" },
      { family: "CATALOG", entryId: id, revision: 0, target: { kind: "ENTRY" }, definitionId: id },
      {
        family: "CATALOG",
        entryId: id,
        revision: 1,
        target: { kind: "VARIANT" },
        definitionId: id,
      },
      { family: "OTHER", itemId: id },
    ])
      expect(LegacyMoneySubjectSchema.safeParse(value).success).toBe(false);
  });
  it("accepts only canonical exact raw integer strings and bounded durable sequences", () => {
    const token = {
      v: 1,
      subject,
      generation: "00000000-0000-0000-0000-000000000000",
      sequence: "0",
      raw: { amountMinor: "9007199254740991", currency: "ZZZ" },
      effectiveEventId: null,
      originId: null,
      originEvidenceErasedAt: null,
      revocationId: null,
    };
    expect(MoneyFactTokenV1Schema.safeParse(token).success).toBe(true);
    expect(
      MoneyFactTokenV1Schema.safeParse({ ...token, sequence: "9223372036854775807" }).success,
    ).toBe(true);
    for (const amountMinor of ["9007199254740992", "01", "-1", "1.0", "1e2", 1])
      expect(
        MoneyFactTokenV1Schema.safeParse({ ...token, raw: { amountMinor, currency: "EUR" } })
          .success,
      ).toBe(false);
    for (const sequence of ["9223372036854775808", "01", "-1", 1])
      expect(MoneyFactTokenV1Schema.safeParse({ ...token, sequence }).success).toBe(false);
    expect(MoneyFactTokenV1Schema.safeParse({ ...token, actorId: id }).success).toBe(false);
  });
  it("requires canonical assertion-erasure timestamps and closed revocation shapes", () => {
    const token = { v: 1, subject, assertionId: id, evidenceErasedAt: null, revocationId: null };
    expect(MoneyAssertionTokenV1Schema.safeParse(token).success).toBe(true);
    expect(
      MoneyAssertionTokenV1Schema.safeParse({
        ...token,
        evidenceErasedAt: "2026-11-06T00:00:00.001Z",
      }).success,
    ).toBe(true);
    for (const evidenceErasedAt of ["2026-11-06", "2026-11-06T01:00:00.001+01:00", "not a time"])
      expect(MoneyAssertionTokenV1Schema.safeParse({ ...token, evidenceErasedAt }).success).toBe(
        false,
      );
    expect(
      RevokeMoneyInputSchema.safeParse({
        assertionId: id,
        expectedAssertionToken: "e30",
        reason: "Actual private review",
      }).success,
    ).toBe(true);
    expect(
      RevokeMoneyInputSchema.safeParse({
        assertionId: id,
        expectedAssertionToken: "e30=",
        reason: "Why",
      }).success,
    ).toBe(false);
  });
  it("keeps missing, unknown and interpreted zero distinct without fabricated scale", () => {
    expect(
      MoneyViewSchema.safeParse({ ...view, raw: null, interpretation: { kind: "MISSING" } })
        .success,
    ).toBe(true);
    expect(
      MoneyViewSchema.safeParse({
        ...view,
        raw: { amountMinor: "0", currency: "EUR" },
        interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
      }).success,
    ).toBe(true);
    expect(
      MoneyViewSchema.safeParse({
        ...view,
        raw: { amountMinor: "0", currency: "EUR" },
        interpretation: { ...interpretation, decimal: "0.00" },
      }).success,
    ).toBe(true);
    for (const value of [
      { ...view, interpretation: { kind: "MISSING" } },
      { ...view, raw: null },
      { ...view, interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE", exponent: 2 } },
      { ...view, interpretation: { ...interpretation, decimal: "1.24" } },
      { ...view, interpretation: { ...interpretation, evidenceCategory: "OWNER_ATTESTATION" } },
    ])
      expect(MoneyViewSchema.safeParse(value).success).toBe(false);
  });
  it("retains independently evidenced scale for supported and ineligible unsupported units", () => {
    expect(
      MoneyViewSchema.safeParse({
        ...view,
        interpretation: {
          ...interpretation,
          exponent: 0,
          decimal: "123",
          basisId: "OWNER_ATTESTATION:v1",
          evidenceCategory: "OWNER_ATTESTATION",
        },
      }).success,
    ).toBe(true);
    expect(
      MoneyViewSchema.safeParse({
        ...view,
        raw: { amountMinor: "123", currency: "ZZZ" },
        interpretation: {
          ...interpretation,
          exponent: 0,
          decimal: "123",
          unitKey: `unsupported:${id}`,
          eligibility: "UNIT_UNSUPPORTED",
          basisId: "OPERATOR_VERIFIED_RECORD:v1",
          evidenceCategory: "OPERATOR_VERIFIED_RECORD",
        },
      }).success,
    ).toBe(true);
  });
  it("validates receipt bindings without treating a parsed receipt as client authority", () => {
    expect(AuthoringReceiptSchema.safeParse(receipt).success).toBe(true);
    for (const extra of [
      { authorityHash: "0".repeat(64) },
      { profileId: "today" },
      { unitKey: "iso4217-2026-09-17:USD" },
      { normalizedDecimal: "1.230" },
      { normalizedDecimal: "1.24" },
      { actorId: id },
    ])
      expect(AuthoringReceiptSchema.safeParse({ ...receipt, ...extra }).success).toBe(false);
    expect(NewMoneyIntentSchema.safeParse({ op: "NEW", authoring }).success).toBe(true);
    expect(NewMoneyIntentSchema.safeParse({ op: "NEW", authoring, receipt }).success).toBe(false);
    expect(
      ExistingMoneyIntentSchema.safeParse({ op: "REPLACE", expectedFactToken: "e30", authoring })
        .success,
    ).toBe(true);
    expect(
      CorrectMoneyInputSchema.safeParse({ op: "REPLACE", expectedFactToken: "e30", authoring })
        .success,
    ).toBe(false);
    expect(
      CorrectMoneyInputSchema.safeParse({
        op: "REPLACE",
        expectedFactToken: "e30",
        authoring,
        correctionReason: "Corrected a transcription",
      }).success,
    ).toBe(true);
  });
  it("normalizes bounded private evidence without accepting controls or surrogate damage", () => {
    const input = {
      expectedFactToken: "e30",
      exponent: 0,
      unit: { kind: "UNSUPPORTED", label: " Cafe\u0301 " },
      evidence: { category: "OWNER_ATTESTATION", reason: " Checked " },
    };
    expect(ClassifyMoneyInputSchema.parse(input)).toMatchObject({
      unit: { label: "Café" },
      evidence: { reason: "Checked" },
    });
    for (const reason of ["", "x".repeat(1001), "bad\nreason", "\ud800"])
      expect(
        ClassifyMoneyInputSchema.safeParse({
          ...input,
          evidence: { category: "OWNER_ATTESTATION", reason },
        }).success,
      ).toBe(false);
    for (const label of ["", "x".repeat(121), "bad\tunit", "\udfff"])
      expect(LegacyUnitDeclarationSchema.safeParse({ kind: "UNSUPPORTED", label }).success).toBe(
        false,
      );
    expect(
      ClassifyMoneyInputSchema.safeParse({
        ...input,
        evidence: {
          category: "OPERATOR_VERIFIED_RECORD",
          reason: "Checked",
          reference: "r".repeat(201),
        },
      }).success,
    ).toBe(false);
  });
});

it("reports out-of-range receipt/view input as validation failure without throwing", () => {
  for (const exponent of [-1, 10, 1.5]) {
    expect(AuthoringReceiptSchema.safeParse({ ...receipt, exponent }).success).toBe(false);
    expect(
      MoneyViewSchema.safeParse({ ...view, interpretation: { ...interpretation, exponent } })
        .success,
    ).toBe(false);
  }
  const raw = { amountMinor: "9007199254740992", currency: "EUR" };
  expect(AuthoringReceiptSchema.safeParse({ ...receipt, raw }).success).toBe(false);
  expect(MoneyViewSchema.safeParse({ ...view, raw }).success).toBe(false);
});

it("preserves structural historical money in full entry and variant snapshots without widening writers", () => {
  for (const currency of ["ANG", "BGN", "CUC", "HRK", "SLL", "XDR", "XSU", "ZWL", "ZZZ"]) {
    const raw = { amountMinor: 1, currency };
    const attribute = { definitionId: id, key: "price", type: "MONEY", value: raw };
    const snapshot = CatalogSnapshotSchema.parse({
      schemaVersion: 1,
      id,
      categoryTemplateId: id,
      text: { language: "de", title: "Historical raw entry" },
      attributes: [attribute],
      variants: [
        { id, text: { language: "en", title: "Historical raw variant" }, attributes: [attribute] },
      ],
      identifiers: [],
    });
    expect(snapshot.attributes[0]!.value).toEqual(raw);
    expect(snapshot.variants[0]!.attributes[0]!.value).toEqual(raw);
    expect(HistoricalCustomFieldMoneyValueSchema.parse(raw)).toEqual(raw);
  }
  expect(CustomFieldMoneyValueSchema.safeParse({ amountMinor: 1, currency: "ZZZ" }).success).toBe(
    false,
  );
  expect(CustomFieldMoneyValueSchema.safeParse({ amountMinor: 1, currency: "EUR" }).success).toBe(
    true,
  );
});
