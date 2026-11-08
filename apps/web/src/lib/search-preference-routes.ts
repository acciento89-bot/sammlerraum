import { ApiError } from "@sammlerraum/contracts/errors";
import {
  SearchPreferenceError,
  SearchPreferenceInput,
  type SearchPreference,
} from "@sammlerraum/domain/seo/search-preference-service";
import { apiRoute } from "./api/route-handler";
type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  service: {
    getOwn(userId: string): Promise<SearchPreference | null>;
    updateOwn(userId: string, input: unknown): Promise<SearchPreference>;
  };
  appOrigin: string;
};
export function createSearchPreferenceHandlers(deps: Dependencies) {
  return {
    GET: apiRoute(async (request) => {
      const session = await deps.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
      return Response.json(
        { preference: await deps.service.getOwn(session.user.id) },
        { headers: { "cache-control": "no-store" } },
      );
    }),
    PUT: apiRoute(async (request) => {
      if (request.headers.get("origin") !== new URL(deps.appOrigin).origin)
        throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
      const session = await deps.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApiError("VALIDATION_ERROR", 400, "Request validation failed");
      }
      const input = SearchPreferenceInput.parse(body);
      try {
        return Response.json(
          { preference: await deps.service.updateOwn(session.user.id, input) },
          { headers: { "cache-control": "no-store" } },
        );
      } catch (error) {
        if (error instanceof SearchPreferenceError)
          throw new ApiError(
            error.code,
            error.code === "CONFLICT" ? 409 : 404,
            "Preference changed or profile not found",
          );
        throw error;
      }
    }),
  };
}
