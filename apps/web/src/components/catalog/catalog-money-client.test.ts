import { describe, expect, it } from "vitest";
import { CatalogSnapshotSchema } from "@sammlerraum/contracts/catalog";
import { MoneyViewSchema } from "@sammlerraum/contracts/legacy-money";
import { readCanonicalMoney, catalogMoneyKey } from "./catalog-money-client";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const state = CatalogSnapshotSchema.parse({
  schemaVersion: 1,
  id: id(1),
  categoryTemplateId: id(2),
  text: { language: "en", title: "Synthetic canonical map" },
  attributes: [
    {
      definitionId: id(3),
      key: "price",
      type: "MONEY",
      value: { amountMinor: 100, currency: "AFN" },
    },
  ],
  variants: [],
  identifiers: [],
});
const view = MoneyViewSchema.parse({
  schemaVersion: 1,
  subject: {
    family: "CATALOG",
    entryId: state.id,
    revision: 1,
    target: { kind: "ENTRY" },
    definitionId: id(3),
  },
  raw: { amountMinor: "100", currency: "AFN" },
  factToken: "synthetic_token",
  interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
});
describe("exact immutable-revision money map browser read", () => {
  it("rejects missing, duplicate, foreign revision/target and raw-mismatched fields as a whole read", async () => {
    for (const money of [
      [],
      [view, view],
      [{ ...view, subject: { ...view.subject, revision: 2 } }],
      [{ ...view, raw: { amountMinor: "101", currency: "AFN" } }],
    ])
      await expect(
        readCanonicalMoney(state, 1, async () =>
          Response.json({ schemaVersion: 1, entryId: state.id, revision: 1, money }),
        ),
      ).rejects.toMatchObject({ code: "READ_FAILED" });
    const result = await readCanonicalMoney(state, 1, async () =>
      Response.json({ schemaVersion: 1, entryId: state.id, revision: 1, money: [view] }),
    );
    expect(result.get(catalogMoneyKey({ kind: "ENTRY" }, id(3)))).toEqual(view);
  });
  it("reads the full supported 10100-field snapshot rather than silently truncating or applying a personal-response size cap", async () => {
    const fields = Array.from({ length: 100 }, (_, i) => ({
      definitionId: id(100 + i),
      key: `price_${i}`,
      type: "MONEY" as const,
      value: { amountMinor: 100, currency: "AFN" },
    }));
    const large = CatalogSnapshotSchema.parse({
      ...state,
      attributes: fields,
      variants: Array.from({ length: 100 }, (_, i) => ({
        id: id(1000 + i),
        text: { language: "en", title: `Variant ${i}` },
        attributes: fields,
      })),
    });
    const money = [
      ...large.attributes.map((field) => ({
        ...view,
        factToken: "a".repeat(2048),
        subject: {
          family: "CATALOG",
          entryId: state.id,
          revision: 1,
          target: { kind: "ENTRY" },
          definitionId: field.definitionId,
        },
      })),
      ...large.variants.flatMap((variant) =>
        variant.attributes.map((field) => ({
          ...view,
          factToken: "a".repeat(2048),
          subject: {
            family: "CATALOG",
            entryId: state.id,
            revision: 1,
            target: { kind: "VARIANT", variantId: variant.id },
            definitionId: field.definitionId,
          },
        })),
      ),
    ];
    const result = await readCanonicalMoney(large, 1, async () =>
      Response.json({ schemaVersion: 1, entryId: state.id, revision: 1, money }),
    );
    expect(result.size).toBe(10100);
    expect(
      result.get(catalogMoneyKey({ kind: "VARIANT", variantId: id(1099) }, id(199))),
    ).toBeDefined();
  });
});

it("accepts only an own pending proposal acknowledgment bound to the actual patch and captured receipts", async () => {
  const { submitCanonicalMoneyProposal } = await import("./catalog-money-client");
  const { SubmitCatalogMoneyProposalInputSchema } = await import(
    "@sammlerraum/contracts/catalog-proposals"
  );
  const { MoneyCapabilitiesSchema } = await import("@sammlerraum/contracts/money-capabilities");
  const { parseLegacyMoneyAuthoring } = await import(
    "@sammlerraum/domain/money/legacy-money-policy"
  );
  const { digestCatalogPatch } = await import("./catalog-money-model");
  const authoring = {
    kind: "DECIMAL" as const,
    profileId: "legacy-money-iso-2026-09-17-v1" as const,
    currency: "AFN",
    decimal: "1",
  };
  const input = SubmitCatalogMoneyProposalInputSchema.parse({
    proposal: {
      targetEntryId: state.id,
      baseRevision: 1,
      summary: "Explicit synthetic proposal",
      patch: {
        kind: "UPDATE_ENTRY",
        input: {
          attributes: [{ definitionId: id(3), value: { amountMinor: 100, currency: "AFN" } }],
        },
      },
    },
    money: {
      schemaVersion: 1,
      intents: [{ target: "ENTRY", definitionId: id(3), intent: { op: "NEW", authoring } }],
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
  const record = {
    id: id(4),
    proposerId: "owner",
    ...input.proposal,
    source: null,
    state: "PENDING",
    createdAt: "2026-11-06T10:00:00.000Z",
    moderatorId: null,
    moderatedAt: null,
    decisionReason: null,
    resultEntryId: null,
    resultRevision: null,
    moneyInterpretation: {
      schemaVersion: 1,
      baseRevision: 1,
      patchDigest: await digestCatalogPatch(input.proposal.patch),
      paths: [
        {
          target: "ENTRY",
          definitionId: id(3),
          kind: "AUTHORED",
          receipt: parseLegacyMoneyAuthoring(authoring),
        },
      ],
    },
  };
  for (const proposal of [
    { ...record, proposerId: "other" },
    { ...record, moneyInterpretation: { ...record.moneyInterpretation, paths: [] } },
  ])
    await expect(
      submitCanonicalMoneyProposal(input, capabilities, async () => Response.json({ proposal })),
    ).rejects.toMatchObject({ code: "ACKNOWLEDGED_UNREADABLE" });
  expect(
    (
      await submitCanonicalMoneyProposal(input, capabilities, async () =>
        Response.json({ proposal: record }),
      )
    ).id,
  ).toBe(id(4));
});
