import {
  ScopedSearchReferenceSchema,
  type ScopedSearchReference,
  parseScopedSearchQuery,
} from "./scoped-search";
import { z } from "zod";
import { parseItemSearchQuery, type SearchLifecycle } from "./item-search";
import { parseItemFilterJson, type ItemFilter } from "./search";
import { validUnicode } from "./search-parser";
import { CanonicalTimestampSchema } from "./items";
export const SMART_COLLECTION_MAX_BODY_BYTES = 32768;
export const SMART_COLLECTION_MAX_REVISION = 2147483647;
export class SmartCollectionError extends Error {
  constructor(
    readonly code:
      | "SMART_COLLECTION_INVALID"
      | "SMART_COLLECTION_NOT_FOUND"
      | "SMART_COLLECTION_CONFLICT"
      | "SMART_COLLECTION_UNRESOLVABLE",
  ) {
    super(code);
    this.name = "SmartCollectionError";
  }
}
export function smartFail(code: SmartCollectionError["code"]): never {
  throw new SmartCollectionError(code);
}
const nameValid = (v: string) =>
  validUnicode(v) && v.length >= 1 && v.length <= 100 && !/\p{Cc}/u.test(v);
export const SmartCollectionNameSchema = z
  .string()
  .refine(nameValid)
  .transform((v) => v.normalize("NFKC").trim())
  .refine(nameValid);
export const SmartCollectionRevisionSchema = z
  .number()
  .int()
  .min(1)
  .max(SMART_COLLECTION_MAX_REVISION);
const definitionSchema = z
  .object({
    version: z.literal(1),
    text: z.string(),
    filter: z.unknown(),
    lifecycle: z.enum(["ACTIVE", "ARCHIVED", "DISPOSED", "ALL"]),
  })
  .strict();
export type SmartCollectionDefinition = {
  version: 1;
  text: string;
  filter: ItemFilter | null;
  lifecycle: SearchLifecycle;
};
export function parseSmartCollectionDefinition(value: unknown): SmartCollectionDefinition {
  const result = definitionSchema.safeParse(value);
  if (!result.success || result.data.filter === undefined)
    return smartFail("SMART_COLLECTION_INVALID");
  const q = parseItemSearchQuery({
    text: result.data.text,
    filter: result.data.filter,
    lifecycle: result.data.lifecycle,
  });
  return { version: 1, text: q.text, filter: q.filter, lifecycle: q.lifecycle };
}
const mutationSchema = z
  .object({ name: SmartCollectionNameSchema, definition: z.unknown() })
  .strict();
export function parseSmartCollectionMutation(input: unknown) {
  const result = mutationSchema.safeParse(input);
  if (!result.success) return smartFail("SMART_COLLECTION_INVALID");
  return {
    name: result.data.name,
    definition: parseSmartCollectionDefinition(result.data.definition),
  };
}
const wireFields = {
  name: SmartCollectionNameSchema,
  text: z.string().optional(),
  f: z.string().nullable().optional(),
  lifecycle: z.enum(["ACTIVE", "ARCHIVED", "DISPOSED", "ALL"]).optional(),
};
const createWire = z.object(wireFields).strict();
const updateWire = z
  .object({ ...wireFields, expectedRevision: SmartCollectionRevisionSchema })
  .strict();
const deleteWire = z.object({ expectedRevision: SmartCollectionRevisionSchema }).strict();
export function parseSmartCollectionWire(
  input: unknown,
  operation: "create" | "update" | "delete",
) {
  if (operation === "delete") {
    const r = deleteWire.safeParse(input);
    if (!r.success) return smartFail("SMART_COLLECTION_INVALID");
    return r.data;
  }
  const r = (operation === "create" ? createWire : updateWire).safeParse(input);
  if (!r.success) return smartFail("SMART_COLLECTION_INVALID");
  const { f, text, lifecycle, name } = r.data;
  const q = parseItemSearchQuery({
    text,
    lifecycle,
    filter: f === undefined || f === null ? null : parseItemFilterJson(f),
  });
  return {
    name,
    definition: { version: 1 as const, text: q.text, filter: q.filter, lifecycle: q.lifecycle },
    ...("expectedRevision" in r.data ? { expectedRevision: r.data.expectedRevision } : {}),
  };
}
export const SmartCollectionSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: SmartCollectionNameSchema,
    revision: SmartCollectionRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();
export type SmartCollectionSummary = z.infer<typeof SmartCollectionSummarySchema>;
export type SmartCollectionDetail = SmartCollectionSummary & {
  definition: SmartCollectionDefinition;
};
export function parseSmartCollectionPageInput(input: unknown) {
  const result = z
    .object({
      limit: z.number().int().min(1).max(50).default(20),
      cursor: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,2048}$/u)
        .optional(),
    })
    .strict()
    .safeParse(input);
  if (!result.success) return smartFail("SMART_COLLECTION_INVALID");
  return result.data;
}
export function parseSmartCollectionId(input: unknown): string {
  const r = z.string().uuid().safeParse(input);
  if (!r.success) return smartFail("SMART_COLLECTION_INVALID");
  return r.data.toLowerCase();
}
export function parseSmartCollectionUpdate(input: unknown) {
  const r = z
    .object({
      name: z.unknown(),
      definition: z.unknown(),
      expectedRevision: SmartCollectionRevisionSchema,
    })
    .strict()
    .safeParse(input);
  if (!r.success) return smartFail("SMART_COLLECTION_INVALID");
  return {
    ...parseSmartCollectionMutation({ name: r.data.name, definition: r.data.definition }),
    expectedRevision: r.data.expectedRevision,
  };
}
export function parseSmartCollectionDelete(input: unknown) {
  const r = deleteWire.safeParse(input);
  if (!r.success) return smartFail("SMART_COLLECTION_INVALID");
  return r.data;
}

/** Version2 is explicitly scoped. AST filterVersion remains1; no access secret is stored. */
export const ScopedSmartCollectionDefinitionSchema = z
  .object({
    version: z.literal(2),
    scope: ScopedSearchReferenceSchema,
    text: z.string(),
    filter: z.unknown(),
    lifecycle: z.enum(["ACTIVE", "ARCHIVED", "DISPOSED", "ALL"]),
  })
  .strict();
export type ScopedSmartCollectionDefinition = {
  version: 2;
  scope: ScopedSearchReference;
  text: string;
  filter: ItemFilter | null;
  lifecycle: SearchLifecycle;
};
export type ScopedSmartCollectionDetail = SmartCollectionSummary & {
  definition: ScopedSmartCollectionDefinition;
};
export function parseScopedSmartCollectionDefinition(
  value: unknown,
): ScopedSmartCollectionDefinition {
  const parsed = ScopedSmartCollectionDefinitionSchema.safeParse(value);
  if (!parsed.success || parsed.data.filter === undefined)
    return smartFail("SMART_COLLECTION_INVALID");
  const query = parseScopedSearchQuery({
    text: parsed.data.text,
    filter: parsed.data.filter,
    lifecycle: parsed.data.lifecycle,
  });
  return {
    version: 2,
    scope: parsed.data.scope,
    text: query.text,
    filter: query.filter,
    lifecycle: query.lifecycle,
  };
}
export function parseScopedSmartCollectionMutation(input: unknown, update = false) {
  const schema = update
    ? mutationSchema.extend({ expectedRevision: SmartCollectionRevisionSchema }).strict()
    : mutationSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return smartFail("SMART_COLLECTION_INVALID");
  return {
    name: parsed.data.name,
    definition: parseScopedSmartCollectionDefinition(parsed.data.definition),
    ...("expectedRevision" in parsed.data
      ? { expectedRevision: parsed.data.expectedRevision as number }
      : {}),
  };
}

export const ScopedSmartCollectionDetailSchema = SmartCollectionSummarySchema.extend({
  definition: ScopedSmartCollectionDefinitionSchema,
})
  .strict()
  .transform((value) => ({
    ...value,
    definition: parseScopedSmartCollectionDefinition(value.definition),
  }));
export const ScopedSmartCollectionListSchema = z
  .object({
    items: z.array(ScopedSmartCollectionDetailSchema).max(50),
    total: z.number().int().nonnegative().safe(),
    nextCursor: z.string().max(2048).nullable(),
  })
  .strict();
