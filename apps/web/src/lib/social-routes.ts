import { ApiError } from "@sammlerraum/contracts/errors";
import {
  CommunityError,
  FollowTargetSchema,
  FavoriteTargetSchema,
  CommunityListQuerySchema,
} from "@sammlerraum/contracts/community";
import { createSocialService } from "@sammlerraum/domain/community/social-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readPrivateQuery as readSearchQueryMap } from "./api/read-private-query";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
export function createSocialDependencies(
  database: Parameters<typeof createSocialService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
    service: createSocialService(database),
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  };
}
export function createSocialHandlers(dependencies: ReturnType<typeof createSocialDependencies>) {
  async function actor(request: Request, write = false) {
    const origin = request.headers.get("origin"),
      expected = new URL(dependencies.appOrigin).origin;
    if (write ? origin !== expected : origin !== null && origin !== expected)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    if (new URL(request.url).hash)
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid community request");
    return { userId: session.user.id };
  }
  async function run(work: () => Promise<unknown>) {
    try {
      return Response.json(await work(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof CommunityError) {
        const code = error.code,
          status =
            code === "COMMUNITY_INVALID"
              ? 400
              : code === "NOT_FOUND"
                ? 404
                : code === "BLOCKED_INTERACTION"
                  ? 403
                  : code === "COMMUNITY_UNAVAILABLE"
                    ? 503
                    : 409;
        throw new ApiError(
          code,
          status,
          status === 404
            ? "Resource not found"
            : status === 403
              ? "Interaction unavailable"
              : status === 400
                ? "Invalid community request"
                : status === 503
                  ? "Community temporarily unavailable"
                  : "Community state changed",
        );
      }
      throw error;
    }
  }
  function listQuery(request: Request) {
    const query = readSearchQueryMap(request, ["limit", "afterId"]);
    if (query.limit !== undefined && !/^[1-9][0-9]?$/u.test(query.limit))
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid community request");
    return CommunityListQuerySchema.parse({
      ...query,
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    });
  }
  return {
    FOLLOW: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const target = FollowTargetSchema.parse(await readPrivateJson(request));
        return dependencies.service.followUser(who, target.userId);
      }),
    ),
    UNFOLLOW: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const target = FollowTargetSchema.parse(await readPrivateJson(request));
        return dependencies.service.unfollowUser(who, target.userId);
      }),
    ),
    FOLLOWING: apiRoute((request) =>
      run(async () => {
        const who = await actor(request);
        return dependencies.service.listFollowing(who, listQuery(request));
      }),
    ),
    FAVORITE: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        return dependencies.service.favoriteTarget(
          who,
          FavoriteTargetSchema.parse(await readPrivateJson(request)),
        );
      }),
    ),
    UNFAVORITE: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        return dependencies.service.unfavoriteTarget(
          who,
          FavoriteTargetSchema.parse(await readPrivateJson(request)),
        );
      }),
    ),
    FAVORITES: apiRoute((request) =>
      run(async () => {
        const who = await actor(request);
        return dependencies.service.listFavorites(who, listQuery(request));
      }),
    ),
  };
}
