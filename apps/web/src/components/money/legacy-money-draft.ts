import { z } from "zod";
import { clearCatalogMoneySessions } from "../catalog/catalog-money-session";
import { clearMoneyReviewDrafts } from "./money-review-draft";
import {
  ExistingMoneyIntentSchema,
  NewMoneyIntentSchema,
  LEGACY_MONEY_PROFILE_ID,
  type MoneyView,
  type ExistingMoneyIntent,
  type NewMoneyIntent,
} from "@sammlerraum/contracts/legacy-money";
import { parseLegacyMoneyAuthoring } from "@sammlerraum/domain/money/legacy-money-policy";
const MoneyDraftSchema = z
  .object({
    outcome: z.enum(["READY", "UNKNOWN", "ACKNOWLEDGED_UNREADABLE", "CONFLICT"]).default("READY"),
    expectedFactToken: z.string().min(1).max(2048).nullable(),
    mode: z.enum(["KEEP", "REPLACE", "CLEAR"]),
    decimal: z.string().max(96),
    currency: z.string().max(3),
    acknowledged: z.boolean(),
    correctionReason: z.string().max(4000),
  })
  .strict();
export type MoneyDraft = z.infer<typeof MoneyDraftSchema>;
export class MoneyDraftError extends Error {
  constructor(
    readonly code:
      | "MONEY_OUTCOME_UNCERTAIN"
      | "MONEY_DRAFT_NOT_LOADED"
      | "MONEY_REPLACEMENT_ACK_REQUIRED"
      | "MONEY_CORRECTION_REASON_REQUIRED"
      | "MONEY_INPUT_INVALID",
  ) {
    super(code);
  }
}
export function initialMoneyDraft(view: MoneyView | null): MoneyDraft {
  // An existing integer never becomes an editable decimal merely by opening a form.
  return {
    outcome: "READY",
    expectedFactToken: view?.factToken ?? null,
    mode: "KEEP",
    decimal: "",
    currency: view?.raw?.currency ?? "EUR",
    acknowledged: false,
    correctionReason: "",
  };
}
export function previewMoneyDraft(draft: MoneyDraft) {
  return parseLegacyMoneyAuthoring({
    kind: "DECIMAL",
    profileId: LEGACY_MONEY_PROFILE_ID,
    currency: draft.currency,
    decimal: draft.decimal,
  });
}
export function moneyDraftIntent(
  value: MoneyDraft,
  view: MoneyView | null,
  existing: boolean,
): ExistingMoneyIntent | NewMoneyIntent | undefined {
  const draft = MoneyDraftSchema.parse(value);
  if (draft.outcome !== "READY") throw new MoneyDraftError("MONEY_OUTCOME_UNCERTAIN");
  if (draft.mode === "KEEP") return undefined;
  if (existing && (!view || !draft.expectedFactToken))
    throw new MoneyDraftError("MONEY_DRAFT_NOT_LOADED");
  if (draft.mode === "CLEAR") {
    if (!existing || !view?.raw) throw new MoneyDraftError("MONEY_INPUT_INVALID");
    if (!draft.acknowledged) throw new MoneyDraftError("MONEY_REPLACEMENT_ACK_REQUIRED");
    return ExistingMoneyIntentSchema.parse({
      op: "CLEAR",
      expectedFactToken: draft.expectedFactToken,
    });
  }
  if (view?.raw && !draft.acknowledged) throw new MoneyDraftError("MONEY_REPLACEMENT_ACK_REQUIRED");
  if (view?.raw && !draft.correctionReason.trim())
    throw new MoneyDraftError("MONEY_CORRECTION_REASON_REQUIRED");
  // This browser preview grants no authority: the server re-parses the authoring request.
  previewMoneyDraft(draft);
  const authoring = {
    kind: "DECIMAL",
    profileId: LEGACY_MONEY_PROFILE_ID,
    currency: draft.currency,
    decimal: draft.decimal,
  };
  return existing
    ? ExistingMoneyIntentSchema.parse({
        op: "REPLACE",
        expectedFactToken: draft.expectedFactToken,
        authoring,
        ...(view?.raw ? { correctionReason: draft.correctionReason } : {}),
      })
    : NewMoneyIntentSchema.parse({ op: "NEW", authoring });
}
export function displayStoredMoney(view: MoneyView, locale: "de" | "en") {
  const meaning = view.interpretation;
  return {
    amount:
      meaning.kind === "INTERPRETED"
        ? meaning.decimal.replace(".", locale === "de" ? "," : ".")
        : (view.raw?.amountMinor ?? null),
    currency: view.raw?.currency ?? null,
    status:
      meaning.kind === "INTERPRETED" && meaning.eligibility === "UNIT_UNSUPPORTED"
        ? ("UNIT_UNSUPPORTED" as const)
        : meaning.kind,
  };
}
// Bounded in-memory only. Never persist money/evidence in URLs or browser storage.
const drafts = new Map<string, MoneyDraft>();
let activeOwner: string | null = null;
function ownerScope(owner: string) {
  if (!owner || owner.length > 512) throw new MoneyDraftError("MONEY_INPUT_INVALID");
  if (activeOwner !== owner) {
    // Other actor-scoped caches bind independently; do not erase a new owner's
    // already initialized context just because this particular cache binds later.
    drafts.clear();
    activeOwner = owner;
  }
}
export function rememberMoneyDraft(owner: string, key: string, draft: MoneyDraft): void {
  ownerScope(owner);
  if (!key || key.length > 512) throw new MoneyDraftError("MONEY_INPUT_INVALID");
  const parsed = MoneyDraftSchema.parse(draft);
  drafts.delete(key);
  drafts.set(key, parsed);
  // One active bounded form can hold 1000 custom MONEY edits plus purchase.
  while (drafts.size > 1024) drafts.delete(drafts.keys().next().value!);
}
export function recallMoneyDraft(owner: string, key: string): MoneyDraft | undefined {
  ownerScope(owner);
  const draft = drafts.get(key);
  if (draft) {
    drafts.delete(key);
    drafts.set(key, draft);
  }
  return draft ? { ...draft } : undefined;
}
export function forgetMoneyDraft(owner: string, key: string): void {
  ownerScope(owner);
  drafts.delete(key);
}
export function clearMoneyDrafts(): void {
  clearCatalogMoneySessions();
  clearMoneyReviewDrafts();
  drafts.clear();
  activeOwner = null;
}

// Discard only this entry's proposal drafts after explicit reconciliation.
export function forgetCatalogMoneyDrafts(owner: string, scope: string): void {
  ownerScope(owner);
  if (
    scope !== "new" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(scope)
  )
    throw new MoneyDraftError("MONEY_INPUT_INVALID");
  const prefix = `catalog:${scope}:`;
  for (const key of drafts.keys()) if (key.startsWith(prefix)) drafts.delete(key);
}
