import { utf8Length } from "./search-parser";
import { z } from "zod";
import {
  parseItemSearchQuery,
  searchFail,
  SEARCH_MAX_QUERY_BYTES,
  SearchLifecycleSchema,
} from "./item-search";
import { CanonicalTimestampSchema } from "./items";

/** Symbolic saved/discovery target only; never a bearer credential. */
export const ScopedSearchReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MEMBER_COLLECTION"), collectionId: z.uuid() }).strict(),
  z.object({ kind: z.literal("SHARE"), shareId: z.uuid() }).strict(),
]);
export type ScopedSearchReference = z.infer<typeof ScopedSearchReferenceSchema>;
export function parseScopedSearchQuery(input: unknown) {
  try {
    if (utf8Length(JSON.stringify(input)) > SEARCH_MAX_QUERY_BYTES)
      return searchFail("SEARCH_INVALID");
  } catch {
    return searchFail("SEARCH_INVALID");
  }
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return searchFail("SEARCH_INVALID");
  const query = parseItemSearchQuery(input);
  if (!("lifecycle" in input) || input.lifecycle === undefined) query.lifecycle = "ALL";
  return query;
}
export const ScopedSearchItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(2000),
    quantity: z.number().int().positive().safe(),
  })
  .strict();
export const ScopedSearchPageSchema = z
  .object({
    items: z.array(ScopedSearchItemSchema).max(50),
    total: z.number().int().nonnegative().safe(),
    nextCursor: z.string().max(2048).nullable(),
    scope: z.enum(["OWNER_COLLECTION", "MEMBER_COLLECTION", "SHARE"]),
    lifecycle: SearchLifecycleSchema,
    readAt: CanonicalTimestampSchema,
  })
  .strict();
export type ScopedSearchPage = z.infer<typeof ScopedSearchPageSchema>;
