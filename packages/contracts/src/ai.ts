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
