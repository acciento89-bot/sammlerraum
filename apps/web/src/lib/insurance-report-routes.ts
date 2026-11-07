import { ApiError } from "@sammlerraum/contracts/errors";
import { ReportError, parseInsuranceReportJson } from "@sammlerraum/contracts/reports";
import { createReportService } from "@sammlerraum/domain/reports/report-service";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import { mapItemSearchError, type createItemSearchRouteDependencies } from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
export function createInsuranceReportRouteDependencies(
  database: SearchDatabase,
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
  settings: { canonicalMoneyEnabled?: boolean } = {},
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createReportService(database, settings),
  };
}
export function createInsuranceReportRouteHandlers(
  dependencies: ReturnType<typeof createInsuranceReportRouteDependencies>,
) {
  return {
    POST: apiRoute(async (request) => {
      try {
        if (request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
          throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
        const session = await dependencies.getSession(request.headers);
        if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
        const url = new URL(request.url);
        if (url.search || url.hash) throw new ReportError("REPORT_INVALID");
        if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
          throw new ReportError("REPORT_INVALID");
        const bytes = await readBoundedBody(request, 16384);
        if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
          throw new ReportError("REPORT_INVALID");
        let input: unknown;
        try {
          input = parseInsuranceReportJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        } catch {
          throw new ReportError("REPORT_INVALID");
        }
        const job = await dependencies.service.requestInsuranceReport(
          { userId: session.user.id },
          input,
        );
        return Response.json(job, { status: 202, headers: { "cache-control": "no-store" } });
      } catch (error) {
        if (error instanceof ReportError) {
          const status =
            error.code === "REPORT_INVALID"
              ? 400
              : error.code === "REPORT_NOT_FOUND"
                ? 404
                : error.code === "REPORT_LIMIT_EXCEEDED"
                  ? 413
                  : error.code === "REPORT_INTEGRITY"
                    ? 500
                    : 409;
          throw new ApiError(
            error.code,
            status,
            status === 400
              ? "Invalid report request"
              : status === 404
                ? "Resource not found"
                : status === 500
                  ? "An unexpected error occurred"
                  : "Report cannot be prepared",
          );
        }
        return mapItemSearchError(error);
      }
    }),
  };
}
