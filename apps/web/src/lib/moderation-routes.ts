import { ApiError } from "@sammlerraum/contracts/errors";
import { CommunityError } from "@sammlerraum/contracts/community";
import {
  ModerationError,
  ModerationIdSchema,
  ModerationReportQuerySchema,
  ResolveCommunityReportSchema,
  ModerationContentActionSchema,
} from "@sammlerraum/contracts/moderation";
import { createModerationService } from "@sammlerraum/domain/moderation/moderation-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readSearchQueryMap } from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
export function createModerationDependencies(
  db: Parameters<typeof createModerationService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    service: createModerationService(db),
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  };
}
export function createModerationHandlers(deps: ReturnType<typeof createModerationDependencies>) {
  async function actor(request: Request, write = false) {
    const origin = request.headers.get("origin"),
      expected = new URL(deps.appOrigin).origin;
    if (write ? origin !== expected : origin !== null && origin !== expected)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await deps.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return { userId: session.user.id };
  }
  async function run(work: () => Promise<unknown>) {
    try {
      return Response.json(await work(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof ModerationError) {
        const status =
          error.code === "MODERATION_INVALID"
            ? 400
            : error.code === "MODERATION_FORBIDDEN"
              ? 403
              : error.code === "MODERATION_NOT_FOUND"
                ? 404
                : 409;
        throw new ApiError(
          error.code,
          status,
          status === 403
            ? "Platform moderation required"
            : status === 404
              ? "Resource not found"
              : status === 400
                ? "Invalid moderation request"
                : "Moderation state changed",
        );
      }
      if (error instanceof CommunityError) {
        const status = error.code === "COMMUNITY_UNAVAILABLE" ? 503 : 409;
        throw new ApiError(error.code, status, "Moderation temporarily unavailable");
      }
      throw error;
    }
  }
  return {
    REPORTS: apiRoute((request) =>
      run(async () => {
        const who = await actor(request),
          raw = readSearchQueryMap(request, ["status", "limit", "afterId"]);
        if (raw.limit !== undefined && !/^[1-9][0-9]?$/.test(raw.limit))
          throw new ApiError("VALIDATION_ERROR", 400, "Invalid moderation page");
        return deps.service.listReports(
          who,
          ModerationReportQuerySchema.parse({
            ...raw,
            ...(raw.limit === undefined ? {} : { limit: Number(raw.limit) }),
          }),
        );
      }),
    ),
    RESOLVE: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        return deps.service.resolveReport(
          who,
          ModerationIdSchema.parse(id),
          ResolveCommunityReportSchema.parse(await readPrivateJson(request)),
        );
      }),
    ),
    REVIEW: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request);
        readSearchQueryMap(request, []);
        return deps.service.getCommentForReview(who, ModerationIdSchema.parse(id));
      }),
    ),
    VISIBILITY: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const value = ModerationContentActionSchema.parse(await readPrivateJson(request)),
          target = ModerationIdSchema.parse(id);
        return value.action === "HIDE"
          ? deps.service.hideContent(who, target, { reason: value.reason })
          : deps.service.restoreContent(who, target, { reason: value.reason });
      }),
    ),
  };
}
