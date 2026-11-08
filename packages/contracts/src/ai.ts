import { z } from "zod";
import { validUnicode, utf8Length } from "./search-parser";
import { CanonicalTimestampSchema } from "./items";
export const AIIdSchema = z.uuid().transform((value) => value.toLowerCase());
const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .refine(validUnicode)
    .transform((value) => value.normalize("NFKC").trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        .refine((value) => !value.includes("\0")),
    );
export const CollectibleAnalysisSchema = z
  .object({
    categoryKey: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/u)
      .nullable(),
    title: text(200).nullable(),
    manufacturer: text(200).nullable(),
    seriesOrSet: text(200).nullable(),
    year: z.number().int().min(1).max(3000).nullable(),
    identifiers: z.array(z.object({ type: text(64), value: text(512) }).strict()).max(20),
    catalogCandidates: z
      .array(
        z
          .object({
            catalogEntryId: AIIdSchema,
            catalogVariantId: AIIdSchema.nullable(),
            confidence: z.number().min(0).max(1),
            evidence: z.array(text(256)).max(8),
          })
          .strict(),
      )
      .max(10),
    warnings: z.array(text(512)).max(20),
  })
  .strict();
export type CollectibleAnalysis = z.infer<typeof CollectibleAnalysisSchema>;
export const AIErrorCodeSchema = z.enum([
  "AI_INVALID_REQUEST",
  "AI_ITEM_NOT_FOUND",
  "AI_SOURCE_NOT_AUTHORIZED",
  "AI_LIMIT_REACHED",
  "AI_REQUEST_CONFLICT",
  "AI_NOT_READY",
  "AI_STALE_JOB",
  "AI_UNAVAILABLE",
  "AI_INVALID_RESPONSE",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_RESPONSE_REFUSED",
  "AI_ITEM_CHANGED",
  "AI_INVALID_SELECTION",
]);
export class AIAnalysisError extends Error {
  constructor(readonly code: z.infer<typeof AIErrorCodeSchema>) {
    super(code);
    this.name = "AIAnalysisError";
  }
}
export const RequestAIAnalysisSchema = z
  .object({
    itemId: AIIdSchema,
    assetIds: z
      .array(AIIdSchema)
      .min(1)
      .max(4)
      .refine((ids) => new Set(ids).size === ids.length),
    requestKey: AIIdSchema,
  })
  .strict();
export const AIReportedUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).max(2147483647).nullable(),
    outputTokens: z.number().int().min(0).max(2147483647).nullable(),
  })
  .strict();
export type AIReportedUsage = z.infer<typeof AIReportedUsageSchema>;
export const AIAnalysisStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
  "CANCELLED",
]);
export const AIAnalysisJobSchema = z
  .object({
    id: AIIdSchema,
    itemId: AIIdSchema,
    status: AIAnalysisStatusSchema,
    imageCount: z.number().int().min(1).max(4),
    providerId: text(64),
    model: text(128),
    errorCode: AIErrorCodeSchema.nullable(),
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();
export type AIAnalysisJob = z.infer<typeof AIAnalysisJobSchema>;
export const AIAnalysisDetailSchema = z
  .object({ job: AIAnalysisJobSchema, analysis: CollectibleAnalysisSchema.nullable() })
  .strict();
export function parseCollectibleAnalysis(input: unknown): CollectibleAnalysis {
  try {
    if (utf8Length(JSON.stringify(input)) > 65536) throw Error();
    return CollectibleAnalysisSchema.parse(input);
  } catch {
    throw new AIAnalysisError("AI_INVALID_RESPONSE");
  }
}

export const ApplyAISuggestionsSchema = z
  .object({
    requestKey: AIIdSchema,
    baseline: z.string().regex(/^[a-f0-9]{64}$/u),
    title: z.boolean(),
    category: z.boolean(),
    manufacturerFieldId: AIIdSchema.nullable(),
    seriesOrSetFieldId: AIIdSchema.nullable(),
    yearFieldId: AIIdSchema.nullable(),
    identifierIndices: z
      .array(z.number().int().min(0).max(19))
      .max(20)
      .refine((values) => new Set(values).size === values.length),
    catalogCandidateIndex: z.number().int().min(0).max(9).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const targets = [value.manufacturerFieldId, value.seriesOrSetFieldId, value.yearFieldId].filter(
      (id) => id !== null,
    );
    if (new Set(targets).size !== targets.length)
      context.addIssue({ code: "custom", message: "Distinct field destinations required" });
  });
export const AIApplyReceiptSchema = z
  .object({
    analysisId: AIIdSchema,
    requestKey: AIIdSchema,
    accepted: z
      .array(
        z
          .string()
          .regex(
            /^(title|category|manufacturer|seriesOrSet|year|catalogCandidate|identifier:[0-9]{1,2})$/u,
          ),
      )
      .max(26),
    decidedAt: CanonicalTimestampSchema,
  })
  .strict();

export const AIUsageSchema = z
  .object({
    period: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/u),
    requests: z.number().int().nonnegative().safe(),
    completed: z.number().int().nonnegative().safe(),
    failed: z.number().int().nonnegative().safe(),
    cancelled: z.number().int().nonnegative().safe(),
    inProgress: z.number().int().nonnegative().safe(),
    attempts: z.number().int().nonnegative().safe(),
    inputTokens: z
      .string()
      .regex(/^[0-9]+$/u)
      .nullable(),
    outputTokens: z
      .string()
      .regex(/^[0-9]+$/u)
      .nullable(),
    unknownInputAttempts: z.number().int().nonnegative().safe(),
    unknownOutputAttempts: z.number().int().nonnegative().safe(),
  })
  .strict();
export const AICaptureSchema = z
  .object({
    itemId: AIIdSchema,
    photos: z.array(z.object({ assetId: AIIdSchema }).strict()).max(200),
    latestJob: AIAnalysisJobSchema.nullable(),
    enabled: z.boolean(),
    monthlyLimit: z.number().int().min(0).max(10000),
    usage: AIUsageSchema,
  })
  .strict();
export const AIReviewSchema = z
  .object({
    job: AIAnalysisJobSchema,
    analysis: CollectibleAnalysisSchema,
    baseline: z.string().regex(/^[a-f0-9]{64}$/u),
    item: z
      .object({
        id: AIIdSchema,
        collectionId: AIIdSchema,
        title: z.string().max(200),
        categoryTemplateId: AIIdSchema.nullable(),
        catalogEntryId: AIIdSchema.nullable(),
        catalogVariantId: AIIdSchema.nullable(),
      })
      .strict(),
    fields: z
      .array(
        z
          .object({
            id: AIIdSchema,
            name: z.string().max(120),
            type: z.enum(["SHORT_TEXT", "INTEGER"]),
            value: z.string().max(1000).nullable(),
          })
          .strict(),
      )
      .max(100),
    fieldsTruncated: z.boolean(),
    identifiers: z
      .array(z.object({ type: z.string().max(64), value: z.string().max(512) }).strict())
      .max(100),
    catalogCandidates: z
      .array(
        CollectibleAnalysisSchema.shape.catalogCandidates.element
          .extend({ index: z.number().int().min(0).max(9), title: z.string().max(500).nullable() })
          .strict(),
      )
      .max(10),
    decision: AIApplyReceiptSchema.nullable(),
  })
  .strict();
export type AIReview = z.infer<typeof AIReviewSchema>;
