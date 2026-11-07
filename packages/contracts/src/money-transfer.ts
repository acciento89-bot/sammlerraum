import { z } from "zod";
import { validUnicode, utf8Length } from "./search-parser";
import {
  LegacyMoneyIdSchema,
  LegacyMoneyAuthoringSchema,
  LegacyRawMoneySchema,
  LegacyMoneySubjectSchema,
  MoneyFactTokenV1Schema,
  MoneyViewSchema,
  AuthoringReceiptSchema,
  CorrectMoneyInputSchema,
  LEGACY_MONEY_PROFILE_ID,
  formatLegacyMinorUnits,
} from "./legacy-money";
import {
  MoneyCoverageSchema,
  PurchaseMoneyCoverageSchema,
  PurchaseCostGroupSchema,
} from "./money-coverage";
export const MONEY_EXPORT_MAX_ITEMS = 1000;
export const MONEY_EXPORT_MAX_BYTES = 8_388_608;
export class MoneyTransferError extends Error {
  constructor(
    readonly code:
      | "MONEY_TRANSFER_INVALID"
      | "MONEY_TRANSFER_CONFLICT"
      | "MONEY_EXPORT_LIMIT_EXCEEDED"
      | "MONEY_EXPORT_INCOMPLETE",
  ) {
    super(code);
    this.name = "MoneyTransferError";
  }
}
export const MoneyExportSelectorSchema = z.discriminatedUnion("family", [
  z.object({ family: z.literal("PURCHASE") }).strict(),
  z
    .object({
      family: z.literal("CUSTOM"),
      collectionId: LegacyMoneyIdSchema,
      definitionId: LegacyMoneyIdSchema,
    })
    .strict(),
  z
    .object({
      family: z.literal("CATALOG"),
      categoryTemplateId: LegacyMoneyIdSchema,
      definitionId: LegacyMoneyIdSchema,
      target: z.enum(["ENTRY", "SELECTED_VARIANT"]),
    })
    .strict(),
]);
export type MoneyExportSelector = z.infer<typeof MoneyExportSelectorSchema>;
export const MoneyExportOptionsSchema = z.discriminatedUnion("mode", [
  z.object({ measure: z.enum(["PURCHASE", "CUSTOM", "CATALOG"]), mode: z.literal("RAW") }).strict(),
  z
    .object({
      measure: z.enum(["PURCHASE", "CUSTOM", "CATALOG"]),
      mode: z.literal("INTERPRETED"),
      completeness: z.enum(["REQUIRE_COMPLETE", "INCLUDE_UNRESOLVED"]),
    })
    .strict(),
]);
export type MoneyExportOptions = z.infer<typeof MoneyExportOptionsSchema>;
const quantity = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/u)
  .refine((v) => v.length < 10 || v <= "2147483647");
export const MoneyExportItemSchema = z
  .object({
    itemId: LegacyMoneyIdSchema,
    title: z
      .string()
      .min(1)
      .max(800)
      .refine((v) => validUnicode(v) && [...v].length <= 200),
    quantity,
    catalogEntryId: LegacyMoneyIdSchema.nullable().optional(),
    catalogVariantId: LegacyMoneyIdSchema.nullable().optional(),
    catalogRevision: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type MoneyExportItem = z.infer<typeof MoneyExportItemSchema>;
const token = MoneyFactTokenV1Schema.shape;
const interpreted = MoneyViewSchema.shape.interpretation.options[2].shape;
export const MoneyExportRowSchema = z
  .object({
    rowNumber: z
      .string()
      .max(16)
      .regex(/^[1-9][0-9]*$/u),
    itemId: LegacyMoneyIdSchema,
    title: MoneyExportItemSchema.shape.title,
    quantity,
    requestedPath: z.string().min(1).max(256),
    subject: LegacyMoneySubjectSchema.nullable(),
    raw: LegacyRawMoneySchema.nullable(),
    fact: z
      .object({
        generation: token.generation,
        sequence: token.sequence,
        effectiveEventId: token.effectiveEventId,
        originId: token.originId,
        originEvidenceErasedAt: token.originEvidenceErasedAt,
        revocationId: token.revocationId,
      })
      .strict()
      .nullable(),
    interpretation: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("MISSING") }).strict(),
      z.object({ kind: z.literal("UNKNOWN") }).strict(),
      z
        .object({
          kind: z.literal("INTERPRETED"),
          exponent: interpreted.exponent,
          unitKey: interpreted.unitKey,
          eligibility: interpreted.eligibility,
          decimal: interpreted.decimal.optional(),
        })
        .strict(),
    ]),
  })
  .strict()
  .refine((row) => {
    if (row.interpretation.kind === "MISSING") return row.raw === null;
    if (row.raw === null || row.subject === null || row.fact === null) return false;
    if (row.interpretation.kind !== "INTERPRETED") return true;
    const raw = LegacyRawMoneySchema.safeParse(row.raw);
    if (!raw.success || !interpreted.exponent.safeParse(row.interpretation.exponent).success)
      return false;
    return (
      row.interpretation.unitKey.startsWith("unsupported:") ===
        (row.interpretation.eligibility === "UNIT_UNSUPPORTED") &&
      (row.interpretation.unitKey.startsWith("unsupported:") ||
        row.interpretation.unitKey === `iso4217-2026-09-17:${raw.data.currency}`) &&
      (row.interpretation.decimal === undefined ||
        row.interpretation.decimal ===
          formatLegacyMinorUnits(raw.data.amountMinor, row.interpretation.exponent))
    );
  });
export type MoneyExportRow = z.infer<typeof MoneyExportRowSchema>;
export const MoneyExportSnapshotV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    asOf: token.originEvidenceErasedAt.unwrap(),
    measure: z.enum(["PURCHASE", "CUSTOM", "CATALOG"]),
    mode: z.enum(["RAW", "INTERPRETED"]),
    completeness: z.enum(["REQUIRE_COMPLETE", "INCLUDE_UNRESOLVED"]).nullable(),
    requestedPaths: z.array(z.string().min(1).max(256)).min(1),
    coverage: z.union([PurchaseMoneyCoverageSchema, MoneyCoverageSchema]),
    rows: z.array(MoneyExportRowSchema),
    totals: z.array(PurchaseCostGroupSchema).max(1650).nullable(),
  })
  .strict()
  .refine((s) => {
    const complete = s.mode === "INTERPRETED" && s.completeness === "REQUIRE_COMPLETE";
    if (s.mode === "RAW" && s.completeness !== null) return false;
    if (s.mode === "INTERPRETED" && s.completeness === null) return false;
    if ((s.measure === "PURCHASE") !== "selectedUnits" in s.coverage) return false;
    if (
      s.coverage.selectedItems > MONEY_EXPORT_MAX_ITEMS ||
      s.coverage.selectedPaths !== s.rows.length
    )
      return false;
    if ((complete && s.measure === "PURCHASE") !== (s.totals !== null)) return false;
    if (
      s.rows.some((row) =>
        complete
          ? row.interpretation.kind !== "INTERPRETED" ||
            row.interpretation.eligibility !== "ELIGIBLE" ||
            row.interpretation.decimal === undefined
          : "decimal" in row.interpretation,
      )
    )
      return false;
    return utf8Length(JSON.stringify(s)) <= MONEY_EXPORT_MAX_BYTES;
  });
export type MoneyExportSnapshotV1 = z.infer<typeof MoneyExportSnapshotV1Schema>;
export const MoneyImportRowV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    rowKey: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_.:-]+$/u),
    profileId: z.literal(LEGACY_MONEY_PROFILE_ID).nullable(),
    sourceKind: z.enum(["DECIMAL", "RAW"]),
    sourceContract: z.enum(["CANONICAL_MINOR_UNITS_V1", "LEGACY_UNKNOWN_RAW_V1"]).optional(),
    authoring: z.union([LegacyMoneyAuthoringSchema, LegacyRawMoneySchema]),
    intent: z.enum(["NEW", "REPLACE"]),
    expectedFactToken: CorrectMoneyInputSchema.shape.expectedFactToken.optional(),
  })
  .strict()
  .refine((row) =>
    row.intent === "NEW"
      ? row.expectedFactToken === undefined
      : row.expectedFactToken !== undefined,
  );
export type MoneyImportRowV1 = z.infer<typeof MoneyImportRowV1Schema>;
const preview = {
  schemaVersion: z.literal(1),
  source: MoneyImportRowV1Schema,
  sourceDigest: z.string().regex(/^[0-9a-f]{64}$/u),
};
export const ValidatedMoneyImportRowSchema = z.discriminatedUnion("kind", [
  z.object({ ...preview, kind: z.literal("CANONICAL"), receipt: AuthoringReceiptSchema }).strict(),
  z.object({ ...preview, kind: z.literal("LEGACY_UNKNOWN"), raw: LegacyRawMoneySchema }).strict(),
]);
export type ValidatedMoneyImportRow = z.infer<typeof ValidatedMoneyImportRowSchema>;
