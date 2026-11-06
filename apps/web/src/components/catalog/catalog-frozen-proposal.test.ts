import { expect, it } from "vitest";
import { CatalogSnapshotSchema } from "@sammlerraum/contracts/catalog";
import { CatalogProposalOperationSchema } from "@sammlerraum/contracts/catalog-proposals";
import { MoneyViewSchema } from "@sammlerraum/contracts/legacy-money";
import { parseLegacyMoneyAuthoring } from "@sammlerraum/domain/money/legacy-money-policy";
import { digestCatalogPatch } from "./catalog-money-model";
import { catalogMoneyKey } from "./catalog-money-client";
import { frozenProposalMoney } from "./catalog-frozen-proposal";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definitionId = id(3),
  raw = { amountMinor: "100", currency: "AFN" };
const base = {
  revision: 1,
  rollbackFromRevision: null,
  state: CatalogSnapshotSchema.parse({
    schemaVersion: 1,
    id: id(1),
    categoryTemplateId: id(2),
    text: { language: "en", title: "Original" },
    attributes: [
      { definitionId, key: "price", type: "MONEY", value: { amountMinor: 100, currency: "AFN" } },
    ],
    variants: [],
    identifiers: [],
  }),
};
const patch = CatalogProposalOperationSchema.parse({
  kind: "UPDATE_ENTRY",
  input: {
    text: { language: "en", title: "Proposed" },
    attributes: [{ definitionId, value: { amountMinor: 100, currency: "AFN" } }],
  },
});
const view = MoneyViewSchema.parse({
  schemaVersion: 1,
  subject: {
    family: "CATALOG",
    entryId: id(1),
    revision: 1,
    target: { kind: "ENTRY" },
    definitionId,
  },
  raw,
  factToken: "original_token",
  interpretation: {
    kind: "INTERPRETED",
    exponent: 0,
    unitKey: "iso4217-2026-09-17:AFN",
    basisId: "OPERATOR_VERIFIED_RECORD:v1",
    eventId: id(4),
    assertionId: id(4),
    evidenceCategory: "OPERATOR_VERIFIED_RECORD",
    eligibility: "ELIGIBLE",
    decimal: "100",
  },
});
const key = catalogMoneyKey({ kind: "ENTRY" }, definitionId);
const common = { id: id(5), targetEntryId: id(1), baseRevision: 1, patch };
it("renders captured authored meaning independently and uses the exact replaced token for before-context", async () => {
  const receipt = parseLegacyMoneyAuthoring({
    kind: "DECIMAL",
    profileId: "legacy-money-iso-2026-09-17-v1",
    currency: "AFN",
    decimal: "1",
  });
  const proposal = {
    ...common,
    moneyInterpretation: {
      schemaVersion: 1,
      baseRevision: 1,
      patchDigest: await digestCatalogPatch(patch),
      paths: [
        {
          target: "ENTRY",
          definitionId,
          kind: "AUTHORED",
          receipt,
          replacesFactToken: view.factToken,
        },
      ],
    },
  };
  const result = await frozenProposalMoney(proposal, base, new Map([[key, view]]));
  expect(result.after.get(definitionId)).toMatchObject({
    kind: "CAPTURED",
    decimal: "1.00",
    source: "AUTHORED",
  });
  expect(result.before.get(key)).toMatchObject({
    kind: "CAPTURED",
    decimal: "100",
    source: "RETAIN",
  });
  const changed = await frozenProposalMoney(
    proposal,
    base,
    new Map([[key, { ...view, factToken: "changed_token" }]]),
  );
  expect(changed.after.get(definitionId)).toMatchObject({ kind: "CAPTURED", decimal: "1.00" });
  expect(changed.before.get(key)).toEqual({ kind: "RAW", raw, changed: true });
});
it("never borrows a fresh source scale for a retained proposal and treats legacy envelopes as unverified", async () => {
  const proposal = {
    ...common,
    moneyInterpretation: {
      schemaVersion: 1,
      baseRevision: 1,
      patchDigest: await digestCatalogPatch(patch),
      paths: [{ target: "ENTRY", definitionId, kind: "RETAIN", factToken: view.factToken }],
    },
  };
  const next = await frozenProposalMoney(
    proposal,
    base,
    new Map([[key, { ...view, factToken: "changed_token" }]]),
  );
  expect(next.after.get(definitionId)).toEqual({ kind: "RAW", raw, changed: true });
  expect(next.before.get(key)).toEqual({ kind: "RAW", raw, changed: true });
  const legacy = await frozenProposalMoney(
    { ...proposal, moneyInterpretation: null },
    base,
    new Map([[key, view]]),
  );
  expect(legacy.before.size).toBe(0);
  expect(legacy.after.size).toBe(0);
});
it("rejects tampered digests and unmatched receipt paths instead of projecting any partial meaning", async () => {
  const digest = await digestCatalogPatch(patch);
  for (const envelope of [
    { schemaVersion: 1, baseRevision: 1, patchDigest: "0".repeat(64), paths: [] },
    {
      schemaVersion: 1,
      baseRevision: 1,
      patchDigest: digest,
      paths: [{ target: "ENTRY", definitionId: id(99), kind: "RETAIN", factToken: view.factToken }],
    },
  ])
    await expect(
      frozenProposalMoney(
        { ...common, moneyInterpretation: envelope },
        base,
        new Map([[key, view]]),
      ),
    ).rejects.toMatchObject({ code: "READ_FAILED" });
});
