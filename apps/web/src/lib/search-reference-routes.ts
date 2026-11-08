import { ApiError } from "@sammlerraum/contracts/errors";
import { searchFail } from "@sammlerraum/contracts/item-search";
import type { ReferenceFamily } from "@sammlerraum/contracts/search-references";
import { createSearchReferenceService } from "@sammlerraum/domain/search/search-reference-service";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import { apiRoute } from "./api/route-handler";
import { readSearchBody } from "./api/read-search-body";
import { readSearchQueryMap, mapItemSearchError } from "./item-search-routes";
type Authentication = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }): Promise<{ user: { id: string } } | null>;
  };
};
export function createSearchReferenceRouteDependencies(
  database: SearchDatabase,
  auth: Authentication,
  appOrigin: string,
) {
  return {
    appOrigin,
    service: createSearchReferenceService(database),
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  };
}
export function createSearchReferenceRouteHandlers(
  dependencies: ReturnType<typeof createSearchReferenceRouteDependencies>,
  family: ReferenceFamily,
) {
  async function actor(request: Request, post = false) {
    if (post && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return { userId: session.user.id };
  }
  return {
    GET: apiRoute(async (request) => {
      try {
        const user = await actor(request);
        const input: Record<string, string | number> = readSearchQueryMap(
          request,
          family === "COLLECTIONS"
            ? ["limit", "cursor"]
            : family === "CUSTOM_FIELDS"
              ? ["collectionId", "limit", "cursor"]
              : ["categoryId", "limit", "cursor"],
        );
        if (input.limit !== undefined) {
          if (typeof input.limit !== "string" || !/^[1-9][0-9]*$/u.test(input.limit))
            searchFail("SEARCH_INVALID");
          input.limit = Number(input.limit);
        }
        const result =
          family === "COLLECTIONS"
            ? await dependencies.service.listCollections(user, input)
            : family === "CUSTOM_FIELDS"
              ? await dependencies.service.listCustomFields(user, input)
              : await dependencies.service.listConditions(user, input);
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        return mapItemSearchError(error);
      }
    }),
    POST: apiRoute(async (request) => {
      try {
        const user = await actor(request, true);
        readSearchQueryMap(request, []);
        const input = await readSearchBody(
          request,
          family === "COLLECTIONS"
            ? "COLLECTION_REFERENCES"
            : family === "CUSTOM_FIELDS"
              ? "CUSTOM_FIELD_REFERENCES"
              : "CONDITION_REFERENCES",
        );
        const result =
          family === "COLLECTIONS"
            ? await dependencies.service.resolveCollections(user, input)
            : family === "CUSTOM_FIELDS"
              ? await dependencies.service.resolveCustomFields(user, input)
              : await dependencies.service.resolveConditions(user, input);
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        return mapItemSearchError(error);
      }
    }),
  };
}
