import { z } from "zod";
import { validUnicode, utf8Length } from "./search-parser";

export const LEGACY_MONEY_PROFILE_ID = "legacy-money-iso-2026-09-17-v1" as const;
export const LEGACY_MONEY_AUTHORITY_HASH =
  "33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff" as const;
export const LEGACY_MONEY_MAX_BODY_BYTES = 16384;
export const LEGACY_MONEY_MAX_TOKEN_LENGTH = 2048;
export const LEGACY_MONEY_MAX_RAW = "9007199254740991";
export const LEGACY_MONEY_MAX_SEQUENCE = "9223372036854775807";
export class LegacyMoneyError extends Error {
  constructor(
    readonly code:
      | "LEGACY_MONEY_INVALID"
      | "LEGACY_MONEY_INTERPRETATION_UNSUPPORTED"
      | "MONEY_NOT_FOUND"
      | "MONEY_FORBIDDEN"
      | "MONEY_CONFLICT"
      | "MONEY_DATA_INTEGRITY"
      | "MONEY_UNAVAILABLE",
  ) {
    super(code);
    this.name = "LegacyMoneyError";
  }
}
export function legacyMoneyFail(code: LegacyMoneyError["code"]): never {
  throw new LegacyMoneyError(code);
}
export const LegacyMoneyIdSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const id = LegacyMoneyIdSchema;
function integerString(max: string) {
  return z
    .string()
    .max(max.length)
    .regex(/^(0|[1-9][0-9]*)$/u)
    .refine((value) => value.length < max.length || value <= max);
}
export const LegacyMinorStringSchema = integerString(LEGACY_MONEY_MAX_RAW);
const sequence = integerString(LEGACY_MONEY_MAX_SEQUENCE);
export const LegacyMoneyExponentSchema = z.number().int().min(0).max(9);
/** Historical syntax only: this never selects an exponent or attests a currency unit. */
export const HistoricalCurrencySchema = z.string().regex(/^[A-Z]{3}$/u);
export const HistoricalMoneyValueSchema = z
  .object({
    amountMinor: z.number().int().nonnegative().max(9007199254740991),
    currency: HistoricalCurrencySchema,
  })
  .strict();
export const LegacyRawMoneySchema = z
  .object({
    amountMinor: LegacyMinorStringSchema,
    currency: HistoricalCurrencySchema,
  })
  .strict();
export type RawMoney = z.infer<typeof LegacyRawMoneySchema>;
export const LegacyMoneySubjectSchema = z.discriminatedUnion("family", [
  z.object({ family: z.literal("PURCHASE"), itemId: id }).strict(),
  z.object({ family: z.literal("CUSTOM"), itemId: id, fieldDefinitionId: id }).strict(),
  z
    .object({
      family: z.literal("CATALOG"),
      entryId: id,
      revision: z.number().int().min(1).max(2147483647),
      target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("ENTRY") }).strict(),
        z.object({ kind: z.literal("VARIANT"), variantId: id }).strict(),
      ]),
      definitionId: id,
    })
    .strict(),
]);
export type MoneySubject = z.infer<typeof LegacyMoneySubjectSchema>;
function privateText(max: number) {
  return z
    .string()
    .max(max * 4)
    .refine((value) => validUnicode(value) && !/\p{Cc}/u.test(value))
    .transform((value) => value.normalize("NFC").trim())
    .refine(
      (value) => [...value].length >= 1 && [...value].length <= max && utf8Length(value) <= max * 4,
    );
}
const reason = privateText(1000),
  reference = privateText(200),
  label = privateText(120);
const token = z
  .string()
  .min(1)
  .max(LEGACY_MONEY_MAX_TOKEN_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/u);
const supportedKey = z.string().regex(/^iso4217-2026-09-17:[A-Z]{3}$/u);
const unsupportedKey = z
  .string()
  .refine((value) => value.startsWith("unsupported:") && id.safeParse(value.slice(12)).success);
const unitKey = z.union([supportedKey, unsupportedKey]);
export const LegacyUnitDeclarationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SUPPORTED"), unitKey: supportedKey }).strict(),
  z.object({ kind: z.literal("UNSUPPORTED"), label }).strict(),
]);
export type UnitDeclaration = z.infer<typeof LegacyUnitDeclarationSchema>;
const decimalInput = z
  .string()
  .max(80)
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^[0-9]+(?:[.,][0-9]+)?$/u));
export const LegacyMoneyAuthoringSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("DECIMAL"),
      profileId: z.literal(LEGACY_MONEY_PROFILE_ID),
      currency: HistoricalCurrencySchema,
      decimal: decimalInput,
    })
    .strict(),
  z
    .object({
      kind: z.literal("RAW"),
      profileId: z.literal(LEGACY_MONEY_PROFILE_ID),
      currency: HistoricalCurrencySchema,
      amountMinor: LegacyMinorStringSchema,
      exponent: LegacyMoneyExponentSchema,
      unitKey: supportedKey,
    })
    .strict(),
]);
export type Authoring = z.infer<typeof LegacyMoneyAuthoringSchema>;
export const NewMoneyIntentSchema = z
  .object({ op: z.literal("NEW"), authoring: LegacyMoneyAuthoringSchema })
  .strict();
const replace = z
  .object({
    op: z.literal("REPLACE"),
    expectedFactToken: token,
    authoring: LegacyMoneyAuthoringSchema,
    correctionReason: reason.optional(),
  })
  .strict();
export const ExistingMoneyIntentSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("RETAIN"), expectedFactToken: token }).strict(),
  z.object({ op: z.literal("CLEAR"), expectedFactToken: token }).strict(),
  replace,
]);
export const CorrectMoneyInputSchema = replace.extend({ correctionReason: reason });
export type NewMoneyIntent = z.infer<typeof NewMoneyIntentSchema>;
export type ExistingMoneyIntent = z.infer<typeof ExistingMoneyIntentSchema>;
export const LegacyMoneyEvidenceSchema = z.discriminatedUnion("category", [
  z
    .object({ category: z.literal("OWNER_ATTESTATION"), reason, reference: reference.optional() })
    .strict(),
  z.object({ category: z.literal("OPERATOR_VERIFIED_RECORD"), reason, reference }).strict(),
]);
export const ClassifyMoneyInputSchema = z
  .object({
    expectedFactToken: token,
    exponent: LegacyMoneyExponentSchema,
    unit: LegacyUnitDeclarationSchema,
    evidence: LegacyMoneyEvidenceSchema,
  })
  .strict();
export type ClassifyMoneyInput = z.infer<typeof ClassifyMoneyInputSchema>;
export const RevokeMoneyInputSchema = z
  .object({ assertionId: id, expectedAssertionToken: token, reason })
  .strict();
export type RevokeMoneyInput = z.infer<typeof RevokeMoneyInputSchema>;
const timestamp = z
  .string()
  .max(32)
  .refine((value) => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
  });
/** Parsed token contents remain an equality precondition, never authority. */
export const MoneyFactTokenV1Schema = z
  .object({
    v: z.literal(1),
    subject: LegacyMoneySubjectSchema,
    generation: id.nullable(),
    sequence,
    raw: LegacyRawMoneySchema.nullable(),
    effectiveEventId: id.nullable(),
    originId: id.nullable(),
    originEvidenceErasedAt: timestamp.nullable(),
    revocationId: id.nullable(),
  })
  .strict();
export type MoneyFactTokenV1 = z.infer<typeof MoneyFactTokenV1Schema>;
export const MoneyAssertionTokenV1Schema = z
  .object({
    v: z.literal(1),
    subject: LegacyMoneySubjectSchema,
    assertionId: id,
    evidenceErasedAt: timestamp.nullable(),
    revocationId: id.nullable(),
  })
  .strict();
export type MoneyAssertionTokenV1 = z.infer<typeof MoneyAssertionTokenV1Schema>;
/** Exact syntax arithmetic shared by receipt/view validators and the policy formatter. */
export function formatLegacyMinorUnits(amountMinor: string, exponent: number): string {
  const raw = LegacyMinorStringSchema.safeParse(amountMinor);
  if (!raw.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  if (!LegacyMoneyExponentSchema.safeParse(exponent).success)
    return legacyMoneyFail("LEGACY_MONEY_INTERPRETATION_UNSUPPORTED");
  if (exponent === 0) return raw.data;
  const digits = raw.data.padStart(exponent + 1, "0");
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}
function storedDecimalMatches(amountMinor: string, exponent: number, decimal: string): boolean {
  return (
    LegacyMinorStringSchema.safeParse(amountMinor).success &&
    LegacyMoneyExponentSchema.safeParse(exponent).success &&
    decimal === formatLegacyMinorUnits(amountMinor, exponent)
  );
}
const normalizedDecimal = z
  .string()
  .max(26)
  .regex(/^(0|[1-9][0-9]*)(?:\.[0-9]{1,9})?$/u);
/** Structural receipt only. A service must still validate the pinned policy and raw binding. */
export const AuthoringReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    profileId: z.literal(LEGACY_MONEY_PROFILE_ID),
    authorityHash: z.literal(LEGACY_MONEY_AUTHORITY_HASH),
    raw: LegacyRawMoneySchema,
    exponent: LegacyMoneyExponentSchema,
    unitKey: supportedKey,
    normalizedDecimal,
  })
  .strict()
  .refine(
    (value) =>
      value.unitKey === `iso4217-2026-09-17:${value.raw.currency}` &&
      storedDecimalMatches(value.raw.amountMinor, value.exponent, value.normalizedDecimal),
  );
export type AuthoringReceipt = z.infer<typeof AuthoringReceiptSchema>;
const evidenceCategory = z.enum(["OWNER_ATTESTATION", "OPERATOR_VERIFIED_RECORD"]);
const interpreted = z
  .object({
    kind: z.literal("INTERPRETED"),
    exponent: LegacyMoneyExponentSchema,
    unitKey,
    basisId: z.enum([
      LEGACY_MONEY_PROFILE_ID,
      "OWNER_ATTESTATION:v1",
      "OPERATOR_VERIFIED_RECORD:v1",
    ]),
    assertionId: id,
    eventId: id,
    evidenceCategory: evidenceCategory.nullable(),
    eligibility: z.enum(["ELIGIBLE", "UNIT_UNSUPPORTED"]),
    decimal: normalizedDecimal,
  })
  .strict()
  .refine(
    (value) =>
      value.unitKey.startsWith("unsupported:") === (value.eligibility === "UNIT_UNSUPPORTED") &&
      (!value.unitKey.startsWith("unsupported:") || value.evidenceCategory !== null) &&
      value.basisId ===
        (value.evidenceCategory ? `${value.evidenceCategory}:v1` : LEGACY_MONEY_PROFILE_ID),
  );
export const MoneyViewSchema = z
  .object({
    schemaVersion: z.literal(1),
    subject: LegacyMoneySubjectSchema,
    raw: LegacyRawMoneySchema.nullable(),
    factToken: token,
    interpretation: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("MISSING") }).strict(),
      z
        .object({
          kind: z.literal("UNKNOWN"),
          reason: z.enum([
            "NO_EVIDENCE",
            "RAW_WRITER",
            "REVOKED",
            "ORIGIN_ERASED",
            "EVIDENCE_ERASED",
          ]),
        })
        .strict(),
      interpreted,
    ]),
  })
  .strict()
  .refine((value) => {
    if (value.interpretation.kind === "MISSING") return value.raw === null;
    if (value.raw === null) return false;
    return (
      value.interpretation.kind !== "INTERPRETED" ||
      ((value.interpretation.unitKey.startsWith("unsupported:") ||
        value.interpretation.unitKey === `iso4217-2026-09-17:${value.raw.currency}`) &&
        storedDecimalMatches(
          value.raw.amountMinor,
          value.interpretation.exponent,
          value.interpretation.decimal,
        ))
    );
  });
export type MoneyView = z.infer<typeof MoneyViewSchema>;
