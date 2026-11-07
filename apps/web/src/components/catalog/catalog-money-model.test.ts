import { describe, expect, it } from "vitest";
import { MoneyViewSchema } from "@sammlerraum/contracts/legacy-money";
import { parseLegacyMoneyAuthoring } from "@sammlerraum/domain/money/legacy-money-policy";
import { digestCatalogMoneyPatch } from "../../../../../packages/domain/src/catalog/catalog-money-envelope";
import { initialMoneyDraft } from "../money/legacy-money-draft";
import {
  buildCatalogMoneyFields,
  proposalMoneyPreview,
  digestCatalogPatch,
} from "./catalog-money-model";
const entryId = "00000000-0000-4000-8000-000000000001",
  definitionId = "00000000-0000-4000-8000-000000000002",
  variantId = "00000000-0000-4000-8000-000000000003";
const context = { entryId, revision: 1, target: { kind: "ENTRY" as const } },
  definition = { id: definitionId, type: "MONEY" as const };
const raw = { amountMinor: "100", currency: "AFN" },
  attributes = [{ definitionId, value: { amountMinor: 100, currency: "AFN" } }];
const view = MoneyViewSchema.parse({
  schemaVersion: 1,
  subject: { family: "CATALOG", ...context, definitionId },
  raw,
  factToken: "original_token",
  interpretation: { kind: "UNKNOWN", reason: "NO_EVIDENCE" },
});
const views = new Map([[definitionId, view]]);
const authoring = {
  kind: "DECIMAL" as const,
  profileId: "legacy-money-iso-2026-09-17-v1" as const,
  currency: "AFN",
  decimal: "1",
};
describe("exact canonical monetary form and frozen display", () => {
  it("retains unresolved historical raw with its frozen fact token, without authoring it", () => {
    const result = buildCatalogMoneyFields(context, "ENTRY", [definition], attributes, views, {
      [definitionId]: initialMoneyDraft(view),
    });
    expect(result).toEqual({
      attributes,
      intents: [
        {
          target: "ENTRY",
          definitionId,
          intent: { op: "RETAIN", expectedFactToken: view.factToken },
        },
      ],
    });
  });
  it("requires deliberate replacement acknowledgment and derives the patch only from its pinned receipt", () => {
    const draft = {
      ...initialMoneyDraft(view),
      mode: "REPLACE" as const,
      decimal: "1",
      currency: "AFN",
    };
    expect(() =>
      buildCatalogMoneyFields(context, "ENTRY", [definition], attributes, views, {
        [definitionId]: draft,
      }),
    ).toThrow();
    const result = buildCatalogMoneyFields(
      context,
      "ENTRY",
      [definition],
      attributes,
      views,
      {
        [definitionId]: { ...draft, acknowledged: true, correctionReason: "Synthetic new record" },
      },
      "Synthetic proposal summary",
    );
    expect(result.attributes).toEqual(attributes);
    expect(result.intents[0]!.intent).toMatchObject({
      op: "REPLACE",
      expectedFactToken: view.factToken,
      authoring,
    });
  });
  it("separates removal from a present-path intent and uses NEW for a genuinely absent attribute", () => {
    expect(() =>
      buildCatalogMoneyFields(context, "ENTRY", [definition], attributes, views, {
        [definitionId]: { ...initialMoneyDraft(view), mode: "CLEAR" },
      }),
    ).toThrow();
    expect(
      buildCatalogMoneyFields(context, "ENTRY", [definition], attributes, views, {
        [definitionId]: { ...initialMoneyDraft(view), mode: "CLEAR", acknowledged: true },
      }),
    ).toEqual({ attributes: [], intents: [] });
    const fresh = buildCatalogMoneyFields(null, "OPERATION_VARIANT", [definition], [], new Map(), {
      [definitionId]: {
        ...initialMoneyDraft(null),
        mode: "REPLACE",
        currency: "AFN",
        decimal: "1",
      },
    });
    expect(fresh).toEqual({
      attributes,
      intents: [{ target: "OPERATION_VARIANT", definitionId, intent: { op: "NEW", authoring } }],
    });
  });
  it("rejects missing or foreign exact-revision/target facts instead of borrowing a token", () => {
    const draft = { [definitionId]: initialMoneyDraft(view) };
    expect(() =>
      buildCatalogMoneyFields(context, "ENTRY", [definition], attributes, new Map(), draft),
    ).toThrow();
    expect(() =>
      buildCatalogMoneyFields(
        { ...context, target: { kind: "VARIANT", variantId } },
        "OPERATION_VARIANT",
        [definition],
        attributes,
        views,
        draft,
      ),
    ).toThrow();
    expect(() =>
      buildCatalogMoneyFields(
        { ...context, revision: 2 },
        "ENTRY",
        [definition],
        attributes,
        views,
        draft,
      ),
    ).toThrow();
  });
  it("uses captured authored receipts and never borrows a newer scale for a frozen retained source", () => {
    const receipt = parseLegacyMoneyAuthoring(authoring);
    expect(
      proposalMoneyPreview(
        raw,
        { target: "ENTRY", definitionId, kind: "AUTHORED", receipt },
        null,
        null,
      ),
    ).toMatchObject({ kind: "CAPTURED", decimal: "1.00", exponent: 2, source: "AUTHORED" });
    const interpreted = MoneyViewSchema.parse({
      ...view,
      interpretation: {
        kind: "INTERPRETED",
        exponent: 0,
        unitKey: "iso4217-2026-09-17:AFN",
        basisId: "OWNER_ATTESTATION:v1",
        eventId: variantId,
        assertionId: variantId,
        evidenceCategory: "OWNER_ATTESTATION",
        eligibility: "ELIGIBLE",
        decimal: "100",
      },
    });
    const retained = {
      target: "ENTRY" as const,
      definitionId,
      kind: "RETAIN" as const,
      factToken: view.factToken,
    };
    expect(proposalMoneyPreview(raw, retained, view.subject, interpreted)).toMatchObject({
      kind: "CAPTURED",
      decimal: "100",
      source: "RETAIN",
    });
    expect(
      proposalMoneyPreview(raw, retained, view.subject, {
        ...interpreted,
        factToken: "newer_token",
      }),
    ).toEqual({ kind: "RAW", raw, changed: true });
    expect(proposalMoneyPreview(raw, undefined, view.subject, interpreted)).toEqual({
      kind: "RAW",
      raw,
      changed: false,
    });
  });
  it("computes the same immutable patch digest in the browser as the accepted server serializer", async () => {
    const patch = {
      kind: "UPDATE_ENTRY",
      input: { text: { language: "en", title: "Explicit proposal" }, attributes },
    };
    expect(await digestCatalogPatch(patch)).toBe(digestCatalogMoneyPatch(patch));
  });
});
