import { z } from "zod";
import { validUnicode, utf8Length } from "./search-parser";
import { parseItemFilter, type ItemFilter } from "./search";
import { VisibilitySchema } from "./collections";
import { TradeStatusSchema, CanonicalTimestampSchema } from "./items";

export const SEARCH_MAX_QUERY_BYTES = 32768;
export const SEARCH_MAX_RESPONSE_BYTES = 1048576;
export const SearchLifecycleSchema = z.enum(["ACTIVE", "ARCHIVED", "DISPOSED", "ALL"]);
export type SearchLifecycle = z.infer<typeof SearchLifecycleSchema>;
export class ItemSearchError extends Error {
  constructor(
    readonly code:
      | "SEARCH_INVALID"
      | "SEARCH_UNAVAILABLE"
      | "SEARCH_INVARIANT"
      | "FILTER_REFERENCE_INVALID",
  ) {
    super(code);
    this.name = "ItemSearchError";
  }
}
export function searchFail(code: ItemSearchError["code"]): never {
  throw new ItemSearchError(code);
}
const textValid = (v: string) =>
  validUnicode(v) && !v.includes("\0") && [...v].length <= 200 && utf8Length(v) <= 800;
const querySchema = z
  .object({
    text: z
      .string()
      .refine(textValid)
      .transform((v) => v.normalize("NFKC").trim())
      .refine(textValid)
      .default(""),
    filter: z.unknown().optional(),
    lifecycle: SearchLifecycleSchema.default("ACTIVE"),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  })
  .strict();
export type ItemSearchQuery = {
  text?: string;
  filter?: ItemFilter | null;
  lifecycle?: SearchLifecycle;
  limit?: number;
  cursor?: string | undefined;
};
export type NormalizedItemSearchQuery = {
  text: string;
  filter: ItemFilter | null;
  lifecycle: SearchLifecycle;
  limit: number;
  cursor?: string | undefined;
};
export function parseItemSearchQuery(input: unknown): NormalizedItemSearchQuery {
  const result = querySchema.safeParse(input);
  if (!result.success) return searchFail("SEARCH_INVALID");
  const { filter, ...query } = result.data;
  return {
    ...query,
    filter: filter === undefined || filter === null ? null : parseItemFilter(filter),
  };
}
export const ItemSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
    collectionId: z.string().uuid(),
    categoryTemplateId: z.string().uuid().nullable(),
    conditionOptionId: z.string().uuid().nullable(),
    quantity: z.number().int().positive().safe(),
    visibility: VisibilitySchema,
    tradeStatus: TradeStatusSchema,
    archivedAt: CanonicalTimestampSchema.nullable(),
    disposedAt: CanonicalTimestampSchema.nullable(),
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
  })
  .strict();
export type ItemSummary = z.infer<typeof ItemSummarySchema>;
export type SearchPage<T> = {
  items: T[];
  total: number;
  nextCursor: string | null;
  scope: "OWNED";
  lifecycle: SearchLifecycle;
  readAt: string;
};
export const ItemSearchPageSchema = z
  .object({
    items: z.array(ItemSummarySchema).max(50),
    total: z.number().int().nonnegative().safe(),
    nextCursor: z.string().max(2048).nullable(),
    scope: z.literal("OWNED"),
    lifecycle: SearchLifecycleSchema,
    readAt: CanonicalTimestampSchema,
  })
  .strict();

export const SearchCursorSchema = z
  .object({
    v: z.literal(1),
    contextHash: z.string().regex(/^[0-9a-f]{64}$/u),
    after: z
      .object({
        createdAt: CanonicalTimestampSchema,
        id: z
          .string()
          .uuid()
          .regex(/^[0-9a-f-]+$/u),
      })
      .strict(),
  })
  .strict();
export type SearchCursor = z.infer<typeof SearchCursorSchema>;
