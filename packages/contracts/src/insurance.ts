import { z } from "zod";
import { AmountMinorSchema } from "./valuations";
import { validUnicode, utf8Length } from "./search-parser";
export class InsuranceError extends Error {
  constructor(
    readonly code:
      | "INSURANCE_INVALID"
      | "INSURANCE_NOT_FOUND"
      | "INSURANCE_CONFLICT"
      | "INSURANCE_INACTIVE"
      | "INSURANCE_INTEGRITY",
  ) {
    super(code);
    this.name = "InsuranceError";
  }
}
const id = z.uuid().transform((v) => v.toLowerCase());
export const InsuranceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("COLLECTION"), collectionId: id }).strict(),
  z.object({ kind: z.literal("ITEM"), itemId: id }).strict(),
]);
export type InsuranceTarget = z.infer<typeof InsuranceTargetSchema>;
const day = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
  .refine(
    (v) =>
      !v.startsWith("0000") &&
      Number.isFinite(Date.parse(v + "T00:00:00.000Z")) &&
      new Date(v + "T00:00:00.000Z").toISOString().slice(0, 10) === v,
  );
const text = (max: number) =>
  z.string().refine((v) => validUnicode(v) && [...v].length <= max && utf8Length(v) <= max * 4);
const optionalText = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(text(max))
    .nullable()
    .optional()
    .transform((v) => v || null);
export const InsuranceInputSchema = z
  .object({
    amountMinor: AmountMinorSchema,
    currency: z.string().regex(/^[A-Z]{3}$/u),
    valuationDate: day,
    insurer: optionalText(200),
    policyReference: optionalText(500),
    notes: optionalText(2000),
  })
  .strict();
export const InsuranceMutationSchema = z
  .object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    insurance: InsuranceInputSchema.nullable(),
  })
  .strict();
export const InsuranceDataSchema = z
  .object({
    target: InsuranceTargetSchema,
    revision: z.number().int().min(0).max(2147483647),
    insurance: z
      .object({
        amountMinor: AmountMinorSchema,
        currency: z.string().regex(/^[A-Z]{3}$/u),
        minorUnitExponent: z.number().int().min(0).max(4),
        basis: z.enum(["PER_UNIT", "COLLECTION_TOTAL"]),
        valuationDate: day,
        insurer: text(200).nullable(),
        policyReference: text(500).nullable(),
        notes: text(2000).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.insurance &&
      (v.revision === 0 ||
        v.insurance.basis !== (v.target.kind === "ITEM" ? "PER_UNIT" : "COLLECTION_TOTAL"))
    )
      ctx.addIssue({ code: "custom", message: "Invalid private insurance basis" });
  });
export type InsuranceData = z.infer<typeof InsuranceDataSchema>;
