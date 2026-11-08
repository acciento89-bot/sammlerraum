import { z } from "zod";
import { validUnicode } from "./search-parser";
import { CanonicalTimestampSchema } from "./items";
export const PERSONAL_MILESTONE_MAX_REVISION = 2147483647;
export const PERSONAL_MILESTONE_MAX_BODY_BYTES = 16384;
export const PERSONAL_MILESTONE_MAX_RESPONSE_BYTES = 65536;
export class PersonalMilestoneError extends Error {
  constructor(readonly code: "MILESTONE_INVALID" | "MILESTONE_NOT_FOUND" | "MILESTONE_CONFLICT") {
    super(code);
    this.name = "PersonalMilestoneError";
  }
}
export function milestoneFail(code: PersonalMilestoneError["code"]): never {
  throw new PersonalMilestoneError(code);
}
const rawTitle = (value: string) => validUnicode(value) && !/\p{Cc}/u.test(value);
const titleBounds = (value: string) =>
  [...value].length >= 1 &&
  [...value].length <= 120 &&
  new TextEncoder().encode(value).length <= 480;
export const PersonalMilestoneTitleSchema = z
  .string()
  .refine(rawTitle)
  .transform((v) => v.normalize("NFC").trim())
  .refine(titleBounds);
const canonicalTitle = z
  .string()
  .refine((v) => rawTitle(v) && titleBounds(v) && v === v.normalize("NFC").trim());
export const PersonalMilestoneDateSchema = z.string().refine((value) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
});
export const PersonalMilestoneRevisionSchema = z
  .number()
  .int()
  .min(1)
  .max(PERSONAL_MILESTONE_MAX_REVISION);
const id = z.string().uuid();
const canonicalId = id.refine((value) => value === value.toLowerCase());
const timestamp = CanonicalTimestampSchema.refine(
  (value) => /^[0-9]{4}-/u.test(value) && !value.startsWith("0000"),
);
const fields = { title: PersonalMilestoneTitleSchema, milestoneDate: PersonalMilestoneDateSchema };
const createSchema = z.object(fields).strict();
const updateSchema = z
  .object({ ...fields, expectedRevision: PersonalMilestoneRevisionSchema })
  .strict();
const deleteSchema = z.object({ expectedRevision: PersonalMilestoneRevisionSchema }).strict();
const cursorToken = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/u);
const pageInput = z
  .object({ limit: z.number().int().min(1).max(50).default(20), cursor: cursorToken.optional() })
  .strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return milestoneFail("MILESTONE_INVALID");
  return result.data;
}
export const parsePersonalMilestoneMutation = (input: unknown) => parse(createSchema, input);
export const parsePersonalMilestoneUpdate = (input: unknown) => parse(updateSchema, input);
export const parsePersonalMilestoneDelete = (input: unknown) => parse(deleteSchema, input);
export const parsePersonalMilestonePageInput = (input: unknown = {}) => parse(pageInput, input);
export const parsePersonalMilestoneId = (input: unknown) => parse(id, input).toLowerCase();
export const PersonalMilestoneDtoSchema = z
  .object({
    id: canonicalId,
    title: canonicalTitle,
    milestoneDate: PersonalMilestoneDateSchema,
    revision: PersonalMilestoneRevisionSchema,
    dateBasis: z.literal("OWNER_ENTERED"),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .refine((value) => value.updatedAt >= value.createdAt);
export const PersonalMilestonePageSchema = z
  .object({
    version: z.literal(1),
    scope: z.literal("OWNED"),
    selectionBasis: z.literal("ALL_PERSONAL_MILESTONES"),
    readAt: timestamp,
    items: z.array(PersonalMilestoneDtoSchema).max(50),
    total: z.number().int().nonnegative().safe(),
    nextCursor: cursorToken.nullable(),
  })
  .strict()
  .refine(
    (value) => value.total >= value.items.length && (!value.nextCursor || value.items.length > 0),
  );
export const PersonalMilestoneCursorSchema = z
  .object({
    v: z.literal(1),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/u),
    after: z
      .object({ milestoneDate: PersonalMilestoneDateSchema, createdAt: timestamp, id: canonicalId })
      .strict(),
  })
  .strict();
export type PersonalMilestoneDto = z.infer<typeof PersonalMilestoneDtoSchema>;
export type PersonalMilestonePage = z.infer<typeof PersonalMilestonePageSchema>;
export type PersonalMilestoneCursor = z.infer<typeof PersonalMilestoneCursorSchema>;
