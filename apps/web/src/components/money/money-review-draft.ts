import { z } from "zod";
import {
  ClassifyMoneyInputSchema,
  LegacyRawMoneySchema,
  LegacyMoneySubjectSchema,
  type MoneyView,
  type MoneySubject,
} from "@sammlerraum/contracts/legacy-money";
import { valuationCurrencyCodes } from "@sammlerraum/domain/money/currencies";
import { formatStoredMoney } from "@sammlerraum/domain/money/legacy-money-policy";
const schema = z
  .object({
    expectedFactToken: z.string().min(1).max(2048),
    raw: z
      .object({ amountMinor: z.string().max(16), currency: z.string().max(3) })
      .refine((value) => LegacyRawMoneySchema.safeParse(value).success)
      .nullable(),
    exponent: z.string().max(2),
    unitKind: z.enum(["", "SUPPORTED", "UNSUPPORTED"]),
    unitLabel: z.string().max(120),
    category: z.enum(["", "OWNER_ATTESTATION", "OPERATOR_VERIFIED_RECORD"]),
    reason: z.string().max(4000),
    reference: z.string().max(800),
    acknowledged: z.boolean(),
    outcome: z.enum(["READY", "UNKNOWN", "ACKNOWLEDGED_UNREADABLE", "CONFLICT"]),
  })
  .strict();
export type MoneyReviewDraft = z.infer<typeof schema>;
export function initialReviewDraft(view: MoneyView): MoneyReviewDraft {
  return {
    expectedFactToken: view.factToken,
    raw: view.raw ? { ...view.raw } : null,
    exponent: "",
    unitKind: "",
    unitLabel: "",
    category: "",
    reason: "",
    reference: "",
    acknowledged: false,
    outcome: "READY",
  };
}
export function reviewDraftInput(view: MoneyView, value: MoneyReviewDraft) {
  const draft = schema.parse(value);
  if (
    draft.outcome !== "READY" ||
    !view.raw ||
    !draft.raw ||
    !draft.acknowledged ||
    !/^[0-9]$/u.test(draft.exponent)
  )
    throw Error("INVALID_REVIEW");
  if (draft.unitKind === "SUPPORTED" && !valuationCurrencyCodes.includes(draft.raw.currency))
    throw Error("INVALID_REVIEW");
  return ClassifyMoneyInputSchema.parse({
    expectedFactToken: draft.expectedFactToken,
    exponent: Number(draft.exponent),
    unit:
      draft.unitKind === "SUPPORTED"
        ? { kind: "SUPPORTED", unitKey: `iso4217-2026-09-17:${draft.raw.currency}` }
        : draft.unitKind === "UNSUPPORTED"
          ? { kind: "UNSUPPORTED", label: draft.unitLabel }
          : null,
    evidence: {
      category: draft.category,
      reason: draft.reason,
      ...(draft.reference.trim() ? { reference: draft.reference } : {}),
    },
  });
}
export function reviewDraftPreview(_view: MoneyView, draft: MoneyReviewDraft): string | null {
  if (
    !draft.raw ||
    !/^[0-9]$/u.test(draft.exponent) ||
    !draft.unitKind ||
    (draft.unitKind === "UNSUPPORTED" && !draft.unitLabel.trim()) ||
    (draft.unitKind === "SUPPORTED" && !valuationCurrencyCodes.includes(draft.raw.currency))
  )
    return null;
  return formatStoredMoney(draft.raw, Number(draft.exponent));
}
let owner: string | null = null;
const drafts = new Map<string, MoneyReviewDraft>();
let active: { scope: string; subject: MoneySubject } | null = null;
function actor(value: string) {
  if (!value || value.length > 512) throw Error("INVALID_REVIEW_OWNER");
  if (owner !== value) {
    clearMoneyReviewDrafts();
    owner = value;
  }
}
const key = (subject: MoneySubject) => JSON.stringify(LegacyMoneySubjectSchema.parse(subject));
export function rememberMoneyReview(
  actorId: string,
  subject: MoneySubject,
  draft: MoneyReviewDraft,
) {
  actor(actorId);
  const id = key(subject);
  drafts.delete(id);
  drafts.set(id, schema.parse(draft));
  while (drafts.size > 128) drafts.delete(drafts.keys().next().value!);
}
export function recallMoneyReview(
  actorId: string,
  subject: MoneySubject,
): MoneyReviewDraft | undefined {
  actor(actorId);
  const value = drafts.get(key(subject));
  return value ? { ...value, raw: value.raw ? { ...value.raw } : null } : undefined;
}
export function forgetMoneyReview(actorId: string, subject: MoneySubject) {
  actor(actorId);
  drafts.delete(key(subject));
}
export function setActiveMoneyReview(actorId: string, scope: string, subject: MoneySubject | null) {
  actor(actorId);
  active = subject ? { scope, subject: LegacyMoneySubjectSchema.parse(subject) } : null;
}
export function activeMoneyReview(actorId: string, scope: string): MoneySubject | null {
  actor(actorId);
  return active?.scope === scope ? LegacyMoneySubjectSchema.parse(active.subject) : null;
}
export function clearMoneyReviewDrafts() {
  owner = null;
  drafts.clear();
  active = null;
}
