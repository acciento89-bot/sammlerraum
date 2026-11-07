import { ApiError } from "@sammlerraum/contracts/errors";
import { ShareError, RevokeShareSchema } from "@sammlerraum/contracts/sharing";
import { createShareService } from "@sammlerraum/domain/sharing/share-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { apiRoute, type ApiRouteHandler } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";

export function createShareRouteDependencies(
  database: Parameters<typeof createShareService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
  storage?: Parameters<typeof createShareService>[1],
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createShareService(database, storage),
  };
}
function mapped(error: unknown): never {
  if (!(error instanceof ShareError)) throw error;
  const status =
    error.code === "SHARE_INVALID"
      ? 400
      : error.code === "SHARE_NOT_FOUND"
        ? 404
        : error.code === "SHARE_FORBIDDEN"
          ? 403
          : ["SHARE_EXPIRED", "SHARE_REVOKED"].includes(error.code)
            ? 410
            : ["SHARE_PIN_REQUIRED", "SHARE_PIN_INVALID"].includes(error.code)
              ? 403
              : error.code === "SHARE_RATE_LIMITED"
                ? 429
                : error.code === "SHARE_LIMIT_EXCEEDED"
                  ? 413
                  : error.code === "SHARE_UNAVAILABLE"
                    ? 503
                    : error.code === "SHARE_CONFLICT"
                      ? 409
                      : 500;
  throw new ApiError(error.code, status, "Shared selection is not available for this request");
}
/** Apply privacy headers to errors as well as successes. Bearers never become cache keys. */
function secured<Args extends unknown[]>(handler: ApiRouteHandler<Args>): ApiRouteHandler<Args> {
  const wrapped = apiRoute(handler);
  return async (request, ...args) => {
    const response = await wrapped(request, ...args),
      headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store");
    headers.set("x-robots-tag", "noindex, nofollow");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    if (response.status === 429) headers.set("retry-after", "900");
    return new Response(response.body, { status: response.status, headers });
  };
}
export function createShareRouteHandlers(
  dependencies: ReturnType<typeof createShareRouteDependencies>,
) {
  async function actor(request: Request, required = false) {
    if (request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (required && !session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return session ? { userId: session.user.id } : null;
  }
  async function run(work: () => Promise<Response | unknown>, status = 200) {
    try {
      const result = await work();
      return result instanceof Response ? result : Response.json(result, { status });
    } catch (error) {
      return mapped(error);
    }
  }
  const binary = (result: { bytes: Uint8Array; mimeType: string; fileName: string }) =>
    new Response(Uint8Array.from(result.bytes), {
      headers: {
        "content-type": result.mimeType,
        "content-disposition": `attachment; filename="${result.fileName}"`,
      },
    });
  return {
    CREATE: secured((request) =>
      run(async () => {
        const who = await actor(request, true);
        return dependencies.service.createShare(who!, await readPrivateJson(request));
      }, 201),
    ),
    RESOLVE: secured((request) =>
      run(async () => {
        const who = await actor(request);
        return dependencies.service.resolveShare(who, await readPrivateJson(request));
      }),
    ),
    REVOKE: secured((request, shareId: string) =>
      run(async () => {
        const who = await actor(request, true),
          body = RevokeShareSchema.omit({ shareId: true }).safeParse(
            await readPrivateJson(request),
          );
        if (!body.success) throw new ShareError("SHARE_INVALID");
        return dependencies.service.revokeShare(who!, { ...body.data, shareId });
      }),
    ),
    ASSET: secured((request) =>
      run(async () => {
        const who = await actor(request);
        return binary(
          await dependencies.service.readSharedAsset(who, await readPrivateJson(request)),
        );
      }),
    ),
    EXPORT: secured((request) =>
      run(async () => {
        const who = await actor(request);
        return binary(await dependencies.service.exportShare(who, await readPrivateJson(request)));
      }),
    ),
  };
}
