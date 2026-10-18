import { ApiError } from "@sammlerraum/contracts/errors";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import {
  SmartCollectionError,
  parseSmartCollectionWire,
  SMART_COLLECTION_MAX_BODY_BYTES,
} from "@sammlerraum/contracts/smart-collections";
import { createSmartCollectionService } from "@sammlerraum/domain/search/smart-collection-service";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
import { readItemSearchQuery } from "./item-search-routes";
type Authentication = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }): Promise<{ user: { id: string } } | null>;
  };
};
export function createSmartCollectionRouteDependencies(
  database: SearchDatabase,
  auth: Authentication,
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createSmartCollectionService(database),
  };
}
function mapped(error: unknown): never {
  if (error instanceof SmartCollectionError) {
    const status =
      error.code === "SMART_COLLECTION_INVALID"
        ? 400
        : error.code === "SMART_COLLECTION_NOT_FOUND"
          ? 404
          : 409;
    throw new ApiError(
      error.code,
      status,
      status === 400
        ? "Invalid saved query request"
        : status === 404
          ? "Resource not found"
          : "Saved query cannot be applied",
    );
  }
  if (error instanceof FilterValidationError)
    throw new ApiError(
      error.code,
      error.code === "FILTER_UNAVAILABLE" ? 422 : 400,
      "Invalid or unavailable filter",
    );
  if (error instanceof ItemSearchError)
    throw new ApiError(
      error.code,
      error.code === "SEARCH_INVALID"
        ? 400
        : error.code === "FILTER_REFERENCE_INVALID"
          ? 422
          : error.code === "SEARCH_UNAVAILABLE"
            ? 503
            : 500,
      error.code === "SEARCH_INVARIANT"
        ? "An unexpected error occurred"
        : "Search request cannot be applied",
    );
  throw error;
}
async function json(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("SMART_COLLECTION_INVALID", 400, "JSON body required");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(request, SMART_COLLECTION_MAX_BODY_BYTES),
      ),
    ) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("SMART_COLLECTION_INVALID", 400, "Invalid JSON body");
  }
}
export function createSmartCollectionRouteHandlers(
  dependencies: ReturnType<typeof createSmartCollectionRouteDependencies>,
) {
  async function actor(request: Request, mutation = false) {
    if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return { userId: session.user.id };
  }
  async function run(work: () => Promise<unknown>, status = 200) {
    try {
      return Response.json(await work(), { status, headers: { "cache-control": "no-store" } });
    } catch (error) {
      return mapped(error);
    }
  }
  return {
    GET: apiRoute((request) =>
      run(async () =>
        dependencies.service.listSmartCollections(
          await actor(request),
          readItemSearchQuery(request, ["limit", "cursor"]),
        ),
      ),
    ),
    POST: apiRoute((request) =>
      run(async () => {
        const a = await actor(request, true);
        readItemSearchQuery(request, []);
        return dependencies.service.createSmartCollection(
          a,
          parseSmartCollectionWire(await json(request), "create"),
        );
      }, 201),
    ),
    GET_ONE: apiRoute((request, id: string) =>
      run(async () => {
        const a = await actor(request);
        readItemSearchQuery(request, []);
        return dependencies.service.getSmartCollection(a, id);
      }),
    ),
    PATCH: apiRoute((request, id: string) =>
      run(async () => {
        const a = await actor(request, true);
        readItemSearchQuery(request, []);
        return dependencies.service.updateSmartCollection(
          a,
          id,
          parseSmartCollectionWire(await json(request), "update"),
        );
      }),
    ),
    DELETE: apiRoute((request, id: string) =>
      run(async () => {
        const a = await actor(request, true);
        readItemSearchQuery(request, []);
        return dependencies.service.deleteSmartCollection(
          a,
          id,
          parseSmartCollectionWire(await json(request), "delete"),
        );
      }),
    ),
    GET_ITEMS: apiRoute((request, id: string) =>
      run(async () =>
        dependencies.service.resolveSmartCollectionItems(
          await actor(request),
          id,
          readItemSearchQuery(request, ["limit", "cursor"]),
        ),
      ),
    ),
  };
}
