import { utf8Length, scanScopedSearchJson } from "./search-parser";
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

/** Strict lexical boundary before nested target/query schemas, including duplicate JSON keys. */
export function parseScopedSearchRequestJson(raw: string): unknown {
  scanScopedSearchJson(raw);
  return JSON.parse(raw) as unknown;
}
export const ScopedDiscoveryInputSchema = z
  .object({
    family: z.enum(["MEMBER_COLLECTION", "SHARE"]),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,2048}$/u)
      .optional(),
  })
  .strict();
export const ScopedDiscoveryPageSchema = z
  .object({
    items: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("MEMBER_COLLECTION"),
              collectionId: z.uuid(),
              name: z.string().min(1).max(200),
            })
            .strict(),
          z
            .object({ kind: z.literal("SHARE"), shareId: z.uuid(), pinRequired: z.boolean() })
            .strict(),
        ]),
      )
      .max(50),
    nextCursor: z.string().max(2048).nullable(),
  })
  .strict();
