import { z } from "zod";
import { AcquisitionDateSchema, CanonicalTimestampSchema } from "./items";

export const GRADING_MAX_BODY_BYTES = 8192;
export const GRADING_MAX_RECORDS = 100;
export const GradingIdSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const authoredText = (max: number) =>
  z
    .string()
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Control characters are not allowed")
    .transform((value) => value.normalize("NFC").trim())
    .pipe(z.string().min(1).max(max));
// Numeric values are author assertions within an explicit scale, never a conversion or authenticity claim.
export const GradingComparableValueSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,4})?$/u);
const verificationUrl = authoredText(2048).refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password
    );
  } catch {
    return false;
  }
}, "Expected an HTTP(S) URL without credentials");
const facts = z
  .object({
    provider: authoredText(120),
    grade: authoredText(120),
    comparableValue: GradingComparableValueSchema.nullable().default(null),
    comparableScale: authoredText(120).nullable().default(null),
    certificateNo: authoredText(160).nullable().default(null),
    gradedAt: AcquisitionDateSchema.nullable().default(null),
    verificationUrl: verificationUrl.nullable().default(null),
    source: authoredText(1000).nullable().default(null),
  })
  .strict();
const paired = (
  value: { comparableValue: string | null; comparableScale: string | null },
  context: z.RefinementCtx,
) => {
  if ((value.comparableValue === null) !== (value.comparableScale === null)) {
    context.addIssue({
      code: "custom",
      path: ["comparableValue"],
      message: "Comparable value and its authored scale must be supplied together",
    });
  }
};
// PUT uses the same full replacement facts; omitted nullable values are explicitly cleared.
export const GradingInputSchema = facts.superRefine(paired);
export const GradingSchema = facts
  .extend({
    id: GradingIdSchema,
    itemId: GradingIdSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .superRefine(paired);
export type Grading = z.infer<typeof GradingSchema>;
export type GradingInput = z.input<typeof GradingInputSchema>;
