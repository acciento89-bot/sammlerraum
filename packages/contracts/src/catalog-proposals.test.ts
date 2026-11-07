import { describe, expect, it } from "vitest";
import {
  SubmitCatalogProposalInputSchema,
  CatalogProposalDecisionSchema,
} from "./catalog-proposals";
const entryId = "b42572c3-dbf8-4c64-9203-593c5f181a41";
const input = {
  targetEntryId: entryId,
  baseRevision: 1,
  summary: "Correction",
  patch: { kind: "UPDATE_ENTRY", input: {} },
};

describe("catalog proposal contracts", () => {
  it("requires deliberate new-entry semantics and preserves optional corrections", () => {
    expect(
      SubmitCatalogProposalInputSchema.parse({ ...input, targetEntryId: entryId.toUpperCase() }),
    ).toMatchObject({ targetEntryId: entryId, patch: { input: {} } });
    for (const value of [
      { ...input, targetEntryId: null },
      { ...input, baseRevision: null },
      { ...input, baseRevision: 0 },
      { ...input, patch: { kind: "DELETE_ENTRY" } },
    ])
      expect(SubmitCatalogProposalInputSchema.safeParse(value).success).toBe(false);
    expect(
      SubmitCatalogProposalInputSchema.parse({
        targetEntryId: null,
        baseRevision: null,
        summary: "New entry",
        patch: {
          kind: "CREATE_ENTRY",
          input: { categoryTemplateId: entryId, text: { language: "pl", title: "Moneta" } },
        },
      }),
    ).toMatchObject({ targetEntryId: null, baseRevision: null });
  });
  it("rejects personal fields and submitted moderator authority at every operation boundary", () => {
    for (const extra of [
      { role: "ADMIN" },
      { proposerId: "other" },
      { moderatorId: "other" },
      { state: "APPROVED" },
    ])
      expect(SubmitCatalogProposalInputSchema.safeParse({ ...input, ...extra }).success).toBe(
        false,
      );
    for (const field of ["ownerId", "purchasePrice", "storageLocationId", "privateNotes"])
      expect(
        SubmitCatalogProposalInputSchema.safeParse({
          ...input,
          patch: { kind: "UPDATE_ENTRY", input: { [field]: "private" } },
        }).success,
      ).toBe(false);
    expect(
      CatalogProposalDecisionSchema.safeParse({
        decision: "APPROVE",
        reason: "Checked",
        role: "MODERATOR",
      }).success,
    ).toBe(false);
  });
});
