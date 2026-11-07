import { ApiError } from "@sammlerraum/contracts/errors";
import {
  RestoreError,
  RestorePreviewInputSchema,
  RestoreAuditInputSchema,
} from "@sammlerraum/contracts/restore";
import { createRestoreService } from "@sammlerraum/domain/audit/restore-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readItemSearchQuery, mapItemSearchError } from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
const bodySchema = RestoreAuditInputSchema.omit({ eventId: true });
export function createRestoreRouteDependencies(
  database: Parameters<typeof createRestoreService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createRestoreService(database),
  };
}
function mapped(error: unknown): never {
  if (error instanceof RestoreError) {
    const status =
      error.code === "RESTORE_INVALID"
        ? 400
        : error.code === "RESTORE_NOT_FOUND"
          ? 404
          : error.code === "RESTORE_CONFLICT"
            ? 409
            : error.code === "RESTORE_UNSUPPORTED"
              ? 422
              : error.code === "RESTORE_UNAVAILABLE"
                ? 503
                : 500;
    throw new ApiError(
      error.code,
      status,
      status === 400
        ? "Invalid restoration request"
        : status === 404
          ? "Resource not found"
          : status === 409
            ? "The resource changed; inspect its current state before restoring"
            : status === 422
              ? "This change cannot be restored"
              : status === 503
                ? "Restoration is temporarily unavailable"
                : "An unexpected error occurred",
    );
  }
  return mapItemSearchError(error);
}
export function createRestoreRouteHandlers(
  dependencies: ReturnType<typeof createRestoreRouteDependencies>,
) {
  async function actor(request: Request, mutation: boolean) {
    const actual = request.headers.get("origin"),
      expected = new URL(dependencies.appOrigin).origin;
    if (mutation ? actual !== expected : actual !== null && actual !== expected)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    if (new URL(request.url).hash) throw new RestoreError("RESTORE_INVALID");
    readItemSearchQuery(request, []);
    return { userId: session.user.id };
  }
  async function run(work: () => Promise<unknown>) {
    try {
      return Response.json(await work(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      return mapped(error);
    }
  }
  return {
    GET: apiRoute((request, eventId: string) =>
      run(async () => {
        const who = await actor(request, false),
          input = RestorePreviewInputSchema.safeParse({ eventId });
        if (!input.success) throw new RestoreError("RESTORE_INVALID");
        return dependencies.service.getRestorePreview(who, input.data);
      }),
    ),
    POST: apiRoute((request, eventId: string) =>
      run(async () => {
        const who = await actor(request, true),
          scope = RestorePreviewInputSchema.safeParse({ eventId });
        if (!scope.success) throw new RestoreError("RESTORE_INVALID");
        const body = bodySchema.safeParse(await readPrivateJson(request));
        if (!body.success) throw new RestoreError("RESTORE_INVALID");
        return dependencies.service.restoreAuditEvent(who, {
          ...body.data,
          eventId: scope.data.eventId,
        });
      }),
    ),
  };
}
