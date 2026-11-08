import {
  ItemSearchPageSchema,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
import { parsePrivateItemSearchWire } from "@sammlerraum/contracts/private-search-query";
import { clearSearchSession } from "./search-url-state";
export class SearchHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(code);
  }
}
const codes = new Set([
  "SEARCH_INVALID",
  "SEARCH_UNAVAILABLE",
  "FILTER_INVALID",
  "FILTER_TOO_COMPLEX",
  "FILTER_VERSION_UNSUPPORTED",
  "FILTER_UNAVAILABLE",
  "FILTER_REFERENCE_INVALID",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "SMART_COLLECTION_INVALID",
  "SMART_COLLECTION_NOT_FOUND",
  "SMART_COLLECTION_CONFLICT",
  "SMART_COLLECTION_UNRESOLVABLE",
  "MILESTONE_INVALID",
  "MILESTONE_NOT_FOUND",
  "MILESTONE_CONFLICT",
]);
export async function searchRequest<T>(
  url: string,
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
  },
  signal: AbortSignal,
  body?: unknown,
  method?: "POST" | "PATCH" | "DELETE",
  maxResponseBytes = 1048576,
): Promise<T> {
  const response = await fetch(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (response.status === 401) {
    clearSearchSession();
    throw new SearchHttpError(401, "UNAUTHENTICATED");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxResponseBytes)
    throw new SearchHttpError(500, "SEARCH_UNAVAILABLE");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SearchHttpError(response.status, "SEARCH_UNAVAILABLE");
  }
  if (!response.ok) {
    const envelope = value as {
      error?: { code?: unknown; requestId?: unknown };
      requestId?: unknown;
    };
    const code = envelope?.error?.code;
    const requestId = envelope?.requestId ?? envelope?.error?.requestId;
    throw new SearchHttpError(
      response.status,
      typeof code === "string" && codes.has(code) ? code : "SEARCH_UNAVAILABLE",
      typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/u.test(requestId)
        ? requestId
        : undefined,
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SearchHttpError(500, "SEARCH_UNAVAILABLE");
  return parsed.data;
}
export function searchItems(query: NormalizedItemSearchQuery, signal: AbortSignal) {
  const body = {
    text: query.text,
    f: query.filter ? JSON.stringify(query.filter) : null,
    lifecycle: query.lifecycle,
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  };
  parsePrivateItemSearchWire(body);
  return searchRequest("/api/v1/search/items", ItemSearchPageSchema, signal, body);
}
export function searchErrorKey(error: unknown) {
  if (error instanceof SearchHttpError) {
    if (error.status === 401) return "session";
    if (error.status === 422) return "unavailable";
    if (error.status === 400 || error.status === 413 || error.status === 414) return "invalid";
    if (error.status === 403) return "forbidden";
  }
  return "failed";
}
