import { z } from "zod";
import {
  ItemSearchPageSchema,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
import {
  SmartCollectionSummarySchema,
  SmartCollectionRevisionSchema,
  parseSmartCollectionDefinition,
  parseSmartCollectionMutation,
  parseSmartCollectionId,
  parseSmartCollectionPageInput,
  SMART_COLLECTION_MAX_BODY_BYTES,
} from "@sammlerraum/contracts/smart-collections";
import { searchRequest, SearchHttpError } from "./search-client";

export const savedDetailSchema = SmartCollectionSummarySchema.extend({ definition: z.unknown() })
  .strict()
  .transform((row, context) => {
    try {
      return { ...row, definition: parseSmartCollectionDefinition(row.definition) };
    } catch {
      context.addIssue({ code: "custom", message: "Invalid saved search" });
      return z.NEVER;
    }
  });
export type SavedDetail = z.infer<typeof savedDetailSchema>;
// Validate contract values at the package boundary instead of mixing Zod instances
// from the web and contracts packages (which deliberately pin different versions).
const summarySchema = z.unknown().transform((value, context) => {
  const result = SmartCollectionSummarySchema.safeParse(value);
  if (result.success) return result.data;
  context.addIssue({ code: "custom", message: "Invalid saved search summary" });
  return z.NEVER;
});
const listSchema = z
  .object({
    items: z.array(summarySchema).max(50),
    total: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    nextCursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,2048}$/u)
      .nullable(),
  })
  .strict();
export type SavedPage = z.infer<typeof listSchema>;
const deletedSchema = z
  .object({ id: z.string().uuid(), revision: z.number().int().min(1).max(2147483647) })
  .strict();
const base = "/api/v1/smart-collections";
export class SavedMutationUnknownError extends Error {
  constructor() {
    super("SAVED_MUTATION_OUTCOME_UNKNOWN");
  }
}
async function mutation<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    // Only explicit rejection responses establish that a write was rejected.
    // A dropped response or malformed acknowledgement must never trigger a retry.
    if (
      error instanceof SearchHttpError &&
      [400, 401, 403, 404, 409, 413, 422].includes(error.status)
    )
      throw error;
    throw new SavedMutationUnknownError();
  }
}
function body(name: string, definition: unknown, revision?: number) {
  const normalized = parseSmartCollectionMutation({ name, definition });
  const result = {
    name: normalized.name,
    text: normalized.definition.text,
    f: normalized.definition.filter ? JSON.stringify(normalized.definition.filter) : null,
    lifecycle: normalized.definition.lifecycle,
    ...(revision === undefined
      ? {}
      : { expectedRevision: SmartCollectionRevisionSchema.parse(revision) }),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > SMART_COLLECTION_MAX_BODY_BYTES)
    throw new SearchHttpError(413, "SMART_COLLECTION_INVALID");
  return result;
}
export async function listSavedSearches(signal: AbortSignal, cursor?: string) {
  const page = parseSmartCollectionPageInput({ limit: 20, ...(cursor ? { cursor } : {}) });
  const params = new URLSearchParams({
    limit: String(page.limit),
    ...(page.cursor ? { cursor: page.cursor } : {}),
  });
  return searchRequest(`${base}?${params}`, listSchema, signal);
}
export async function getSavedSearch(id: string, signal: AbortSignal) {
  return searchRequest(`${base}/${parseSmartCollectionId(id)}`, savedDetailSchema, signal);
}
export async function resolveSavedItems(
  id: string,
  signal: AbortSignal,
  options: { limit?: number; cursor?: string } = {},
) {
  const validId = parseSmartCollectionId(id),
    page = parseSmartCollectionPageInput(options);
  const params = new URLSearchParams({
    limit: String(page.limit),
    ...(page.cursor ? { cursor: page.cursor } : {}),
  });
  return searchRequest(`${base}/${validId}/items?${params}`, ItemSearchPageSchema, signal);
}
export async function createSavedSearch(
  name: string,
  query: NormalizedItemSearchQuery,
  signal: AbortSignal,
) {
  const input = body(name, {
    version: 1,
    text: query.text,
    filter: query.filter,
    lifecycle: query.lifecycle,
  });
  return mutation(() => searchRequest(base, savedDetailSchema, signal, input, "POST"));
}
export async function updateSavedSearch(
  id: string,
  revision: number,
  name: string,
  definition: unknown,
  signal: AbortSignal,
) {
  const validId = parseSmartCollectionId(id),
    input = body(name, definition, revision);
  return mutation(() =>
    searchRequest(`${base}/${validId}`, savedDetailSchema, signal, input, "PATCH"),
  );
}
export async function deleteSavedSearch(id: string, revision: number, signal: AbortSignal) {
  const validId = parseSmartCollectionId(id),
    input = { expectedRevision: SmartCollectionRevisionSchema.parse(revision) };
  return mutation(() =>
    searchRequest(`${base}/${validId}`, deletedSchema, signal, input, "DELETE"),
  );
}
