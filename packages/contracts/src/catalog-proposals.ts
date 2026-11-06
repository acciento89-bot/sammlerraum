import {
  ExistingMoneyIntentSchema,
  NewMoneyIntentSchema,
  LegacyMoneyIdSchema,
  AuthoringReceiptSchema,
} from "./legacy-money";
import { z } from "zod";
import {
  CatalogEntryPatchSchema,
  CatalogExternalIdentifierInputSchema,
  CatalogSourceSchema,
  CatalogVariantInputSchema,
  CreateCatalogEntryInputSchema,
} from "./catalog";

export const CATALOG_PROPOSAL_MAX_BYTES = 65_536;
export const CatalogProposalIdSchema = z.uuid().transform((id) => id.toLowerCase());
export const CatalogRevisionNumberSchema = z.number().int().min(1).max(2_147_483_647);
const AuthoredSummarySchema = z
  .string()
  .max(500)
  .refine((value) => !value.includes("\u0000"))
  .pipe(z.string().trim().min(1));
export const CatalogDecisionReasonSchema = z
  .string()
  .max(1000)
  .refine((value) => !value.includes("\u0000"))
  .pipe(z.string().trim().min(1));
export const CatalogProposalOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CREATE_ENTRY"), input: CreateCatalogEntryInputSchema }).strict(),
  z.object({ kind: z.literal("UPDATE_ENTRY"), input: CatalogEntryPatchSchema }).strict(),
  z.object({ kind: z.literal("ADD_VARIANT"), input: CatalogVariantInputSchema }).strict(),
  z
    .object({
      kind: z.literal("UPDATE_VARIANT"),
      variantId: CatalogProposalIdSchema,
      input: CatalogVariantInputSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("ADD_IDENTIFIER"), input: CatalogExternalIdentifierInputSchema })
    .strict(),
  z
    .object({
      kind: z.literal("UPDATE_IDENTIFIER"),
      identifierId: CatalogProposalIdSchema,
      input: CatalogExternalIdentifierInputSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("REMOVE_IDENTIFIER"), identifierId: CatalogProposalIdSchema })
    .strict(),
]);
export const SubmitCatalogProposalInputSchema = z
  .object({
    targetEntryId: CatalogProposalIdSchema.nullable(),
    baseRevision: CatalogRevisionNumberSchema.nullable(),
    patch: CatalogProposalOperationSchema,
    summary: AuthoredSummarySchema,
    source: CatalogSourceSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const create = value.patch.kind === "CREATE_ENTRY";
    if (
      create !== (value.targetEntryId === null && value.baseRevision === null) ||
      (!create && (value.targetEntryId === null || value.baseRevision === null))
    ) {
      context.addIssue({
        code: "custom",
        message: "New entries require a null target and base; existing entries require both",
      });
    }
  });
export type SubmitCatalogProposalInput = z.input<typeof SubmitCatalogProposalInputSchema>;
export type CatalogProposalOperation = z.infer<typeof CatalogProposalOperationSchema>;
export const CatalogProposalStateSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CONFLICT"]);
export const CatalogProposalListInputSchema = z
  .object({
    state: CatalogProposalStateSchema.optional(),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(256).optional(),
  })
  .strict();
export const CatalogProposalCursorSchema = z
  .object({
    createdAt: z.iso.datetime({ precision: 3 }),
    id: CatalogProposalIdSchema,
  })
  .strict();
export const CatalogProposalDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: CatalogDecisionReasonSchema,
  })
  .strict();
export const CatalogRollbackInputSchema = z
  .object({
    expectedRevision: CatalogRevisionNumberSchema,
    targetRevision: CatalogRevisionNumberSchema,
    reason: CatalogDecisionReasonSchema,
  })
  .strict();

/** M4 contract foundation; no submission or approval adapter uses it yet. */
const [retainedMoneyIntent, , replacementMoneyIntent] = ExistingMoneyIntentSchema.options;
// Catalog correction explanations use the existing required proposal summary.
// Reject a per-path correctionReason explicitly rather than silently losing it.
const catalogReplacement = replacementMoneyIntent.omit({ correctionReason: true }).strict();
const moneyTarget = z.enum(["ENTRY", "OPERATION_VARIANT"]);
const inputPath = z
  .object({
    target: moneyTarget,
    definitionId: LegacyMoneyIdSchema,
    intent: z.union([NewMoneyIntentSchema, retainedMoneyIntent, catalogReplacement]),
  })
  .strict();
const uniqueMoneyPaths = (paths: Array<{ target: string; definitionId: string }>) =>
  new Set(paths.map((p) => `${p.target}:${p.definitionId}`)).size === paths.length;
function boundedMoneyProposal(value: unknown, context: z.RefinementCtx): void {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > CATALOG_PROPOSAL_MAX_BYTES)
      context.addIssue({ code: "custom", message: "Catalog money proposal exceeds byte limit" });
  } catch {
    context.addIssue({ code: "custom", message: "Catalog money proposal must be JSON" });
  }
}
export const SubmitCatalogMoneyProposalInputSchema = z
  .object({
    proposal: SubmitCatalogProposalInputSchema,
    money: z
      .object({
        schemaVersion: z.literal(1),
        intents: z.array(inputPath).max(100).refine(uniqueMoneyPaths),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    boundedMoneyProposal(value, context);
    const kind = value.proposal.patch.kind;
    const target =
      kind === "CREATE_ENTRY" || kind === "UPDATE_ENTRY"
        ? "ENTRY"
        : kind === "ADD_VARIANT" || kind === "UPDATE_VARIANT"
          ? "OPERATION_VARIANT"
          : null;
    if (
      (kind === "CREATE_ENTRY" || kind === "ADD_VARIANT") &&
      value.money.intents.some((path) => path.intent.op !== "NEW")
    )
      context.addIssue({ code: "custom", message: "New canonical subjects require new authoring" });
    if (value.money.intents.some((path) => path.target !== target))
      context.addIssue({
        code: "custom",
        message: "Money target does not belong to this operation",
      });
  });
export type SubmitCatalogMoneyProposalInput = z.infer<typeof SubmitCatalogMoneyProposalInputSchema>;
const storedPath = z.discriminatedUnion("kind", [
  z
    .object({
      target: moneyTarget,
      definitionId: LegacyMoneyIdSchema,
      kind: z.literal("AUTHORED"),
      receipt: AuthoringReceiptSchema,
    })
    .strict(),
  z
    .object({
      target: moneyTarget,
      definitionId: LegacyMoneyIdSchema,
      kind: z.literal("RETAIN"),
      factToken: retainedMoneyIntent.shape.expectedFactToken,
    })
    .strict(),
]);
export const StoredProposalMoneyEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    baseRevision: CatalogRevisionNumberSchema.nullable(),
    patchDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    paths: z.array(storedPath).max(100).refine(uniqueMoneyPaths),
  })
  .strict()
  .superRefine(boundedMoneyProposal);
export type StoredProposalMoneyEnvelope = z.infer<typeof StoredProposalMoneyEnvelopeSchema>;
