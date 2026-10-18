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
