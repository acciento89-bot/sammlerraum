import type { CatalogAttributeDefinition } from "@sammlerraum/contracts/catalog";
import {
  AuthoringReceiptSchema,
  HistoricalMoneyValueSchema,
  LegacyMoneySubjectSchema,
  LegacyRawMoneySchema,
  MoneyViewSchema,
  type MoneyView,
  type RawMoney,
} from "@sammlerraum/contracts/legacy-money";
import {
  CatalogProposalOperationSchema,
  CATALOG_PROPOSAL_MAX_BYTES,
  type StoredProposalMoneyEnvelope,
  type SubmitCatalogMoneyProposalInput,
} from "@sammlerraum/contracts/catalog-proposals";
import { parseLegacyMoneyAuthoring } from "@sammlerraum/domain/money/legacy-money-policy";
import { serializeCatalogValue } from "@sammlerraum/domain/catalog/catalog-serialization";
import { MoneyDraftError, moneyDraftIntent, type MoneyDraft } from "../money/legacy-money-draft";
export type CatalogMoneyContext = {
  entryId: string;
  revision: number;
  target: Extract<MoneyView["subject"], { family: "CATALOG" }>["target"];
};
export type CatalogMoneyPreview =
  | { kind: "RAW"; raw: RawMoney; changed: boolean }
  | {
      kind: "CAPTURED";
      raw: RawMoney;
      decimal: string;
      exponent: number;
      eligibility: "ELIGIBLE" | "UNIT_UNSUPPORTED";
      source: "AUTHORED" | "RETAIN";
    };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function invalid(): never {
  throw new MoneyDraftError("MONEY_DRAFT_NOT_LOADED");
}
export function buildCatalogMoneyFields(
  context: CatalogMoneyContext | null,
  target: "ENTRY" | "OPERATION_VARIANT",
  definitions: Pick<CatalogAttributeDefinition, "id" | "type">[],
  attributes: { definitionId: string; value: unknown }[],
  views: ReadonlyMap<string, MoneyView>,
  drafts: Record<string, MoneyDraft>,
  summary = "",
): {
  attributes: { definitionId: string; value: { amountMinor: number; currency: string } }[];
  intents: SubmitCatalogMoneyProposalInput["money"]["intents"];
} {
  if (
    definitions.length > 100 ||
    attributes.length > 100 ||
    new Set(attributes.map((row) => row.definitionId)).size !== attributes.length
  )
    invalid();
  const output: ReturnType<typeof buildCatalogMoneyFields> = { attributes: [], intents: [] };
  for (const field of definitions.filter((field) => field.type === "MONEY")) {
    const old = attributes.find((row) => row.definitionId === field.id);
    const original = old ? HistoricalMoneyValueSchema.parse(old.value) : null;
    const view = views.get(field.id) ?? null;
    if (original) {
      if (
        !context ||
        !view ||
        !MoneyViewSchema.safeParse(view).success ||
        !same(
          view.subject,
          LegacyMoneySubjectSchema.parse({ family: "CATALOG", ...context, definitionId: field.id }),
        ) ||
        !same(view.raw, { amountMinor: String(original.amountMinor), currency: original.currency })
      )
        invalid();
    }
    const draft = drafts[field.id];
    if (!draft) invalid();
    if (draft.outcome !== "READY") throw new MoneyDraftError("MONEY_OUTCOME_UNCERTAIN");
    if (draft.mode === "KEEP") {
      if (original) {
        if (!draft.expectedFactToken) invalid();
        output.attributes.push({ definitionId: field.id, value: original });
        output.intents.push({
          target,
          definitionId: field.id,
          intent: { op: "RETAIN", expectedFactToken: draft.expectedFactToken },
        });
      }
      continue;
    }
    // Canonical correction explanations are recorded once in the existing proposal summary.
    const intent = moneyDraftIntent(
      { ...draft, correctionReason: summary },
      view,
      Boolean(original),
    );
    if (!intent) invalid();
    if (intent.op === "CLEAR") continue;
    if (intent.op === "RETAIN") invalid();
    const receipt = parseLegacyMoneyAuthoring(intent.authoring);
    output.attributes.push({
      definitionId: field.id,
      value: { amountMinor: Number(receipt.raw.amountMinor), currency: receipt.raw.currency },
    });
    const explicit =
      intent.op === "REPLACE"
        ? {
            op: "REPLACE" as const,
            expectedFactToken: intent.expectedFactToken,
            authoring: intent.authoring,
          }
        : intent;
    output.intents.push({ target, definitionId: field.id, intent: explicit });
  }
  return output;
}
/** A proposal preview is not a fabricated MoneyView and cannot grant mutation authority. */
export function proposalMoneyPreview(
  rawInput: RawMoney,
  path: StoredProposalMoneyEnvelope["paths"][number] | undefined,
  expectedSubject: MoneyView["subject"] | null,
  base: MoneyView | null,
): CatalogMoneyPreview {
  const raw = LegacyRawMoneySchema.parse(rawInput);
  const fallback = (changed = false): CatalogMoneyPreview => ({ kind: "RAW", raw, changed });
  if (!path) return fallback();
  if (path.kind === "AUTHORED") {
    const receipt = AuthoringReceiptSchema.safeParse(path.receipt);
    return receipt.success && same(receipt.data.raw, raw)
      ? {
          kind: "CAPTURED",
          raw,
          decimal: receipt.data.normalizedDecimal,
          exponent: receipt.data.exponent,
          eligibility: "ELIGIBLE",
          source: "AUTHORED",
        }
      : fallback(true);
  }
  const parsed = MoneyViewSchema.safeParse(base);
  if (
    !parsed.success ||
    !expectedSubject ||
    !same(parsed.data.subject, LegacyMoneySubjectSchema.parse(expectedSubject)) ||
    parsed.data.factToken !== path.factToken ||
    !same(parsed.data.raw, raw)
  )
    return fallback(true);
  const meaning = parsed.data.interpretation;
  return meaning.kind === "INTERPRETED"
    ? {
        kind: "CAPTURED",
        raw,
        decimal: meaning.decimal,
        exponent: meaning.exponent,
        eligibility: meaning.eligibility,
        source: "RETAIN",
      }
    : fallback();
}
export async function digestCatalogPatch(patch: unknown): Promise<string> {
  const parsed = CatalogProposalOperationSchema.parse(patch);
  const bytes = new TextEncoder().encode(serializeCatalogValue(parsed, invalid));
  if (bytes.byteLength > CATALOG_PROPOSAL_MAX_BYTES) invalid();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}
