import { ApiError } from "@sammlerraum/contracts/errors";
import { createDashboardService } from "@sammlerraum/domain/dashboard/dashboard-service";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import {
  createItemSearchRouteDependencies,
  readItemSearchQuery,
  mapItemSearchError,
} from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
export function createDashboardRouteDependencies(
  database: SearchDatabase,
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
) {
  return {
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createDashboardService(database),
  };
}
export function createDashboardRouteHandlers(
  dependencies: ReturnType<typeof createDashboardRouteDependencies>,
) {
  return {
    GET: apiRoute(async (request) => {
      try {
        const session = await dependencies.getSession(request.headers);
        if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
        const data = await dependencies.service.getDashboard(
          { userId: session.user.id },
          readItemSearchQuery(request, ["text", "f", "lifecycle"]),
        );
        return Response.json(data, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        return mapItemSearchError(error);
      }
    }),
  };
}
