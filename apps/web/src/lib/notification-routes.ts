import { ApiError } from "@sammlerraum/contracts/errors";
import { CommunityError } from "@sammlerraum/contracts/community";
import {
  NotificationError,
  NotificationIdSchema,
  NotificationListSchema,
  UpdateNotificationPreferencesSchema,
  EmptyNotificationCommandSchema,
} from "@sammlerraum/contracts/notifications";
import { createNotificationService } from "@sammlerraum/domain/notifications/notification-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readPrivateQuery as readSearchQueryMap } from "./api/read-private-query";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
export function createNotificationDependencies(
  db: Parameters<typeof createNotificationService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    service: createNotificationService(db),
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  };
}
export function createNotificationHandlers(
  deps: ReturnType<typeof createNotificationDependencies>,
) {
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
      if (error instanceof NotificationError) {
        const status =
          error.code === "NOTIFICATION_INVALID"
            ? 400
            : error.code === "NOTIFICATION_NOT_FOUND"
              ? 404
              : 409;
        throw new ApiError(
          error.code,
          status,
          status === 404
            ? "Resource not found"
            : status === 400
              ? "Invalid notification request"
              : "Notification state changed",
        );
      }
      if (error instanceof CommunityError)
        throw new ApiError(
          error.code,
          error.code === "COMMUNITY_UNAVAILABLE" ? 503 : 409,
          "Notifications temporarily unavailable",
        );
      throw error;
    }
  }
  return {
    LIST: apiRoute((request) =>
      run(async () => {
        const who = await actor(request),
          raw = readSearchQueryMap(request, ["limit", "afterId"]);
        if (raw.limit !== undefined && !/^[1-9][0-9]?$/.test(raw.limit))
          throw new ApiError("VALIDATION_ERROR", 400, "Invalid notification page");
        return deps.service.listNotifications(
          who,
          NotificationListSchema.parse({
            ...raw,
            ...(raw.limit === undefined ? {} : { limit: Number(raw.limit) }),
          }),
        );
      }),
    ),
    PREFERENCES: apiRoute((request) =>
      run(async () => {
        const who = await actor(request);
        readSearchQueryMap(request, []);
        return deps.service.getPreferences(who);
      }),
    ),
    UPDATE_PREFERENCES: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        return deps.service.updatePreferences(
          who,
          UpdateNotificationPreferencesSchema.parse(await readPrivateJson(request)),
        );
      }),
    ),
    READ: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        EmptyNotificationCommandSchema.parse(await readPrivateJson(request));
        return deps.service.markRead(who, NotificationIdSchema.parse(id));
      }),
    ),
    ALL_READ: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        EmptyNotificationCommandSchema.parse(await readPrivateJson(request));
        return deps.service.markAllRead(who);
      }),
    ),
  };
}
