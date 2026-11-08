import { z } from "zod";
import { validUnicode, utf8Length, scanFilterJson } from "./search-parser";
import { LEGACY_MONEY_PROFILE_ID, HistoricalCurrencySchema } from "./legacy-money";
import { ValidatedMoneyImportRowSchema } from "./money-transfer";
import { CanonicalTimestampSchema } from "./items";

export const IMPORT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const IMPORT_MAX_SOURCE_ROWS = 10000;
export const IMPORT_PREVIEW_BATCH_SIZE = 100;
export const IMPORT_MAX_ROW_BYTES = 65536;
export class ImportServiceError extends Error {
  constructor(
    readonly code:
      | "IMPORT_INVALID"
      | "IMPORT_NOT_FOUND"
      | "IMPORT_CONFLICT"
      | "IMPORT_NOT_READY"
      | "IMPORT_LIMIT_EXCEEDED",
  ) {
    super(code);
    this.name = "ImportServiceError";
  }
}
export function importFail(code: ImportServiceError["code"]): never {
  throw new ImportServiceError(code);
}
const column = z.number().int().min(0).max(255);
const clean = (value: string) => validUnicode(value) && !value.includes("\0");
const moneyCommon = {
  amountColumn: column,
  fixedCurrency: HistoricalCurrencySchema.optional(),
  currencyColumn: column.optional(),
};
const moneyMapping = z
  .discriminatedUnion("sourceKind", [
    z
      .object({
        ...moneyCommon,
        sourceKind: z.literal("DECIMAL"),
        profileId: z.literal(LEGACY_MONEY_PROFILE_ID),
      })
      .strict(),
    z
      .object({
        ...moneyCommon,
        sourceKind: z.literal("RAW"),
        profileId: z.literal(LEGACY_MONEY_PROFILE_ID).nullable(),
        sourceContract: z.enum(["CANONICAL_MINOR_UNITS_V1", "LEGACY_UNKNOWN_RAW_V1"]),
        exponentColumn: column.optional(),
        unitKeyColumn: column.optional(),
      })
      .strict()
      .refine((m) =>
        m.profileId === null
          ? m.sourceContract === "LEGACY_UNKNOWN_RAW_V1" &&
            m.exponentColumn === undefined &&
            m.unitKeyColumn === undefined
          : m.sourceContract === "CANONICAL_MINOR_UNITS_V1" &&
            m.exponentColumn !== undefined &&
            m.unitKeyColumn !== undefined,
      ),
  ])
  .refine((m) => (m.fixedCurrency !== undefined) !== (m.currencyColumn !== undefined));
export const ImportMappingSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.enum(["de", "en"]),
    columns: z
      .object({
        title: column,
        quantity: column.optional(),
        identifier: z
          .object({ column, type: z.string().trim().min(1).max(64).refine(clean) })
          .strict()
          .optional(),
        purchaseMoney: moneyMapping.optional(),
        acquiredOn: z
          .object({ column, format: z.enum(["YYYY-MM-DD", "DD.MM.YYYY"]) })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
export type ImportMapping = z.infer<typeof ImportMappingSchema>;
export const ImportRawRowSchema = z
  .array(
    z
      .string()
      .max(16384)
      .refine((v) => clean(v) && utf8Length(v) <= 16384)
      .nullable(),
  )
  .max(256)
  .refine((v) => utf8Length(JSON.stringify(v)) <= IMPORT_MAX_ROW_BYTES);
export const ImportRowContextSchema = z
  .object({
    rowKey: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_.:-]+$/u),
    matchingItemIds: z.array(z.string().uuid()).max(IMPORT_MAX_SOURCE_ROWS),
    duplicateInSource: z.boolean(),
  })
  .strict();
export type ImportRowContext = z.infer<typeof ImportRowContextSchema>;
export const ImportMappedValuesSchema = z
  .object({
    title: z.string().min(1).max(200).refine(clean),
    quantity: z.number().int().min(1).max(2147483647),
    identifier: z
      .object({ type: z.string(), value: z.string(), normalizedValue: z.string() })
      .strict()
      .nullable(),
    purchaseMoney: ValidatedMoneyImportRowSchema.nullable(),
    acquiredOn: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
      .nullable(),
  })
  .strict();
export type ImportMappedValues = z.infer<typeof ImportMappedValuesSchema>;
export const ImportActionSchema = z.enum(["CREATE", "SKIP", "MERGE", "CREATE_SEPARATE"]);
export const ImportPreviewRowSchema = z
  .object({
    rowKey: ImportRowContextSchema.shape.rowKey,
    status: z.enum(["READY", "CONFLICT", "INVALID"]),
    values: ImportMappedValuesSchema.nullable(),
    errors: z
      .array(
        z
          .object({
            field: z.enum([
              "row",
              "title",
              "quantity",
              "identifier",
              "purchaseMoney",
              "acquiredOn",
            ]),
            code: z.literal("INVALID_VALUE"),
          })
          .strict(),
      )
      .max(6),
    matchingItemIds: z.array(z.string().uuid()).max(IMPORT_MAX_SOURCE_ROWS),
    duplicateInSource: z.boolean(),
    allowedActions: z.array(ImportActionSchema).min(1).max(3),
    decision: z.null(),
  })
  .strict();
export type ImportPreviewRow = z.infer<typeof ImportPreviewRowSchema>;

const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(2147483647);
const checksum = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/u)
  .transform((v) => v.toLowerCase());
const fileName = z
  .string()
  .transform((v) => v.normalize("NFC").trim())
  .pipe(z.string().min(1).max(255).refine(clean));
const sourceBytes = z
  .string()
  .regex(/^[1-9][0-9]{0,7}$/u)
  .refine((v) => /^[1-9][0-9]{0,7}$/u.test(v) && BigInt(v) <= BigInt(IMPORT_MAX_SOURCE_BYTES));
const rowCount = z.number().int().min(0).max(IMPORT_MAX_SOURCE_ROWS);
export const ImportJobStatusSchema = z.enum([
  "AWAITING_UPLOAD",
  "PARSING",
  "PARSED",
  "PREVIEWING",
  "REVIEW_READY",
  "COMMITTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const ImportJobCreateInputSchema = z
  .object({
    collectionId: id,
    locale: z.enum(["de", "en"]),
    source: z
      .object({
        format: z.enum(["CSV", "XLSX"]),
        fileName,
        byteSize: sourceBytes,
        checksumSha256: checksum,
      })
      .strict(),
  })
  .strict();
export const ImportJobDtoSchema = z
  .object({
    id,
    collectionId: id,
    locale: z.enum(["de", "en"]),
    status: ImportJobStatusSchema,
    revision,
    source: z
      .object({
        format: z.enum(["CSV", "XLSX"]),
        fileName,
        byteSize: sourceBytes,
        checksumSha256: checksum,
        verified: z.boolean(),
      })
      .strict(),
    progress: z
      .object({
        totalRows: rowCount.nullable(),
        parsedRows: rowCount,
        previewedRows: rowCount,
        committedRows: rowCount,
      })
      .strict(),
    previewGeneration: z.number().int().min(0).max(2147483647),
    mapping: ImportMappingSchema.nullable(),
    mappingHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
    mappingProfile: z.object({ id, revision }).strict().nullable(),
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict()
  .refine(
    (j) =>
      j.progress.previewedRows <= j.progress.parsedRows &&
      j.progress.committedRows <= j.progress.previewedRows &&
      (j.progress.totalRows === null || j.progress.parsedRows <= j.progress.totalRows),
  );
export type ImportJobDto = z.infer<typeof ImportJobDtoSchema>;
export const ImportProfileNameSchema = z
  .string()
  .transform((v) => v.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(
    z
      .string()
      .min(1)
      .max(120)
      .refine((v) => clean(v) && !/[\p{Cc}]/u.test(v)),
  );
export const ImportProfileMutationSchema = z
  .object({
    profileId: id.optional(),
    expectedRevision: revision.optional(),
    name: ImportProfileNameSchema,
    mapping: ImportMappingSchema,
  })
  .strict()
  .refine((v) => (v.profileId === undefined) === (v.expectedRevision === undefined));
export const ImportProfileDtoSchema = z
  .object({
    id,
    name: ImportProfileNameSchema,
    revision,
    mapping: ImportMappingSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();
export type ImportProfileDto = z.infer<typeof ImportProfileDtoSchema>;
export const ImportPreviewInputSchema = z
  .object({
    jobId: id,
    expectedRevision: revision,
    mapping: ImportMappingSchema.optional(),
    mappingProfileId: id.optional(),
    expectedProfileRevision: revision.optional(),
    batchSize: z
      .number()
      .int()
      .min(1)
      .max(IMPORT_PREVIEW_BATCH_SIZE)
      .default(IMPORT_PREVIEW_BATCH_SIZE),
  })
  .strict()
  .refine(
    (v) =>
      (v.mapping !== undefined) !== (v.mappingProfileId !== undefined) &&
      (v.mappingProfileId === undefined) === (v.expectedProfileRevision === undefined),
  );
export const ImportPreviewBatchSchema = z
  .object({
    job: ImportJobDtoSchema,
    rows: z.array(ImportPreviewRowSchema).max(IMPORT_PREVIEW_BATCH_SIZE),
    complete: z.boolean(),
  })
  .strict()
  .refine(
    (v) =>
      v.complete === (v.job.status === "REVIEW_READY") &&
      utf8Length(JSON.stringify(v)) <= 2 * 1024 * 1024,
  );
export type ImportPreviewBatch = z.infer<typeof ImportPreviewBatchSchema>;
export const ImportPreviewPageInputSchema = z
  .object({
    jobId: id,
    limit: z.number().int().min(1).max(50).default(20),
    afterRowNumber: z.number().int().min(0).max(IMPORT_MAX_SOURCE_ROWS).default(0),
  })
  .strict();
export const ImportPreviewPageSchema = z
  .object({
    job: ImportJobDtoSchema,
    items: z
      .array(
        z
          .object({
            rowNumber: z.string().regex(/^[1-9][0-9]{0,4}$/u),
            preview: ImportPreviewRowSchema,
          })
          .strict(),
      )
      .max(50),
    hasMore: z.boolean(),
    nextAfterRowNumber: z.number().int().min(1).max(IMPORT_MAX_SOURCE_ROWS).nullable(),
  })
  .strict()
  .refine((v) =>
    v.hasMore
      ? v.items.length > 0 && v.nextAfterRowNumber === Number(v.items.at(-1)!.rowNumber)
      : v.nextAfterRowNumber === null,
  );
export type ImportPreviewPage = z.infer<typeof ImportPreviewPageSchema>;

const importRowNumber = z.number().int().min(1).max(IMPORT_MAX_SOURCE_ROWS);
export const ImportMergeFieldSchema = z.enum([
  "title",
  "quantity",
  "identifier",
  "purchaseMoney",
  "acquiredOn",
]);
export const ImportDecisionInputSchema = z.discriminatedUnion("action", [
  z.object({ rowNumber: importRowNumber, action: z.literal("CREATE") }).strict(),
  z.object({ rowNumber: importRowNumber, action: z.literal("CREATE_SEPARATE") }).strict(),
  z.object({ rowNumber: importRowNumber, action: z.literal("SKIP") }).strict(),
  z
    .object({
      rowNumber: importRowNumber,
      action: z.literal("MERGE"),
      targetItemId: id,
      expectedTargetToken: z.string().regex(/^[0-9a-f]{64}$/u),
      fields: z
        .array(ImportMergeFieldSchema)
        .min(1)
        .max(5)
        .refine((v) => new Set(v).size === v.length),
    })
    .strict(),
]);
export const ImportDecisionsInputSchema = z
  .object({
    jobId: id,
    expectedRevision: revision,
    previewGeneration: revision,
    decisions: z
      .array(ImportDecisionInputSchema)
      .min(1)
      .max(100)
      .refine((rows) => new Set(rows.map((r) => r.rowNumber)).size === rows.length),
  })
  .strict();
export const ImportCommitApprovalInputSchema = z
  .object({ jobId: id, expectedRevision: revision, previewGeneration: revision })
  .strict();
export const ImportMergeTargetInputSchema = z
  .object({ jobId: id, previewGeneration: revision, rowNumber: importRowNumber, targetItemId: id })
  .strict();
export type ImportDecisionInput = z.infer<typeof ImportDecisionInputSchema>;

/** Shared by the upload boundary and the bounded worker parser. */
export const ImportParserOptionsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    format: z.enum(["CSV", "XLSX"]),
    hasHeader: z.boolean(),
    sourceProfile: z.enum(["GENERIC", "SAMMLERRAUM_TABULAR_V1"]).default("GENERIC"),
    delimiter: z.enum([",", ";", "\t"]).default(","),
    sheetName: z.string().min(1).max(31).optional(),
  })
  .strict()
  .refine((v) => v.format !== "CSV" || v.sheetName === undefined)
  .refine((v) => v.sourceProfile === "GENERIC" || v.hasHeader);
export const ImportUploadInputSchema = z
  .object({
    collectionId: id,
    locale: z.enum(["de", "en"]),
    fileName,
    format: z.enum(["CSV", "XLSX"]),
    uploadRequestId: id,
    parserOptions: ImportParserOptionsSchema,
  })
  .strict()
  .refine((v) => v.format === v.parserOptions.format);

export function parseImportRequestJson(raw: string): unknown {
  try {
    scanFilterJson(raw);
    return JSON.parse(raw);
  } catch {
    return importFail("IMPORT_INVALID");
  }
}

export const ImportCancellationInputSchema = z
  .object({ jobId: id, expectedRevision: revision })
  .strict();
