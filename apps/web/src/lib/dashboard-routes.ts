import { ApiError } from "@sammlerraum/contracts/errors";
import { createDashboardService } from "@sammlerraum/domain/dashboard/dashboard-service";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import {
  createItemSearchRouteDependencies,
  readItemSearchQuery,
  mapItemSearchError,
} from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { parsePrivateDashboardWire } from "@sammlerraum/contracts/private-search-query";
import { readSearchBody } from "./api/read-search-body";
export function createDashboardRouteDependencies(
  database: SearchDatabase,
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
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
    POST: apiRoute(async (request) => {
      try {
        if (request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
          throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
        const session = await dependencies.getSession(request.headers);
        if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
        readItemSearchQuery(request, []);
        const data = await dependencies.service.getDashboard(
          { userId: session.user.id },
          parsePrivateDashboardWire(await readSearchBody(request, "DASHBOARD_QUERY")),
        );
        return Response.json(data, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        return mapItemSearchError(error);
      }
    }),
  };
}
