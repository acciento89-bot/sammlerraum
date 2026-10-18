import { ApiError } from "@sammlerraum/contracts/errors";
import { parseItemFilterJson, FilterValidationError } from "@sammlerraum/contracts/search";
import { ItemSearchError, SEARCH_MAX_QUERY_BYTES } from "@sammlerraum/contracts/item-search";
import {
  createItemSearchService,
  type SearchDatabase,
} from "@sammlerraum/domain/search/item-search-service";
import { apiRoute } from "./api/route-handler";
type Authentication = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }): Promise<{ user: { id: string } } | null>;
  };
};
export function createItemSearchRouteDependencies(database: SearchDatabase, auth: Authentication) {
  return {
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createItemSearchService(database),
  };
}
export function readItemSearchQuery(
  request: Request,
  allowedKeys: readonly string[] = ["text", "f", "lifecycle", "limit", "cursor"],
) {
  const marker = request.url.indexOf("?");
  const encoded = marker < 0 ? "" : request.url.slice(marker).split("#", 1)[0]!;
  if (Buffer.byteLength(encoded) > SEARCH_MAX_QUERY_BYTES)
    throw new ApiError("SEARCH_QUERY_TOO_LARGE", 414, "Search query is too large");
  const raw = encoded.slice(1);
  const values: Record<string, string> = Object.create(null);
  try {
    for (const segment of raw ? raw.split("&") : []) {
      if (!segment) throw Error();
      const separator = segment.indexOf("=");
      const key = decodeURIComponent(
        (separator < 0 ? segment : segment.slice(0, separator)).replaceAll("+", " "),
      );
      const value = decodeURIComponent(
        (separator < 0 ? "" : segment.slice(separator + 1)).replaceAll("+", " "),
      );
      if (!allowedKeys.includes(key) || Object.hasOwn(values, key)) throw Error();
      values[key] = value;
    }
  } catch {
    throw new ItemSearchError("SEARCH_INVALID");
  }
  if (values.limit !== undefined && !/^[1-9][0-9]*$/u.test(values.limit))
    throw new ItemSearchError("SEARCH_INVALID");
  return {
    ...(values.text !== undefined ? { text: values.text } : {}),
    ...(values.f !== undefined ? { filter: parseItemFilterJson(values.f) } : {}),
    ...(values.lifecycle !== undefined ? { lifecycle: values.lifecycle } : {}),
    ...(values.limit !== undefined ? { limit: Number(values.limit) } : {}),
    ...(values.cursor !== undefined ? { cursor: values.cursor } : {}),
  };
}
function mapped(error: unknown): never {
  if (error instanceof FilterValidationError)
    throw new ApiError(
      error.code,
      error.code === "FILTER_UNAVAILABLE" ? 422 : 400,
      error.code === "FILTER_UNAVAILABLE" ? "Filter is unavailable" : "Invalid search filter",
    );
  if (error instanceof ItemSearchError) {
    const code = error.code;
    throw new ApiError(
      code,
      code === "SEARCH_INVALID"
        ? 400
        : code === "FILTER_REFERENCE_INVALID"
          ? 422
          : code === "SEARCH_UNAVAILABLE"
            ? 503
            : 500,
      code === "FILTER_REFERENCE_INVALID"
        ? "Filter reference is unavailable"
        : code === "SEARCH_INVALID"
          ? "Invalid search request"
          : code === "SEARCH_UNAVAILABLE"
            ? "Search is temporarily unavailable"
            : "An unexpected error occurred",
    );
  }
  throw error;
}
export function createItemSearchRouteHandlers(
  dependencies: ReturnType<typeof createItemSearchRouteDependencies>,
) {
  return {
    GET: apiRoute(async (request) => {
      try {
        const session = await dependencies.getSession(request.headers);
        if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
        const result = await dependencies.service.searchItems(
          { userId: session.user.id },
          readItemSearchQuery(request),
        );
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        return mapped(error);
      }
    }),
  };
}
