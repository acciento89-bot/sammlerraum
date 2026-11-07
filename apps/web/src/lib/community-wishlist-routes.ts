import { ApiError } from "@sammlerraum/contracts/errors";
import { CommunityError, CommunityFeedQuerySchema } from "@sammlerraum/contracts/community";
import {
  WishlistError,
  CreateWishlistEntrySchema,
  WishlistListQuerySchema,
  DuplicateCandidatesQuerySchema,
  DuplicatePairSchema,
  EmptyWishlistCommandSchema,
  WishlistIdSchema,
} from "@sammlerraum/contracts/wishlist";
import { createFeedService } from "@sammlerraum/domain/community/feed-service";
import { createWishlistService } from "@sammlerraum/domain/wishlist/wishlist-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readPrivateQuery as readSearchQueryMap } from "./api/read-private-query";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
import { readBoundedBody } from "./api/read-bounded-body";
export function createCommunityWorkspaceDependencies(
  db: Parameters<typeof createFeedService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    feed: createFeedService(db),
    wishlist: createWishlistService(db),
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  };
}
export function createCommunityWorkspaceHandlers(
  deps: ReturnType<typeof createCommunityWorkspaceDependencies>,
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
      if (error instanceof CommunityError || error instanceof WishlistError) {
        const code = error.code,
          status = code.endsWith("INVALID")
            ? 400
            : code.endsWith("NOT_FOUND") || code === "NOT_FOUND"
              ? 404
              : code.endsWith("UNAVAILABLE")
                ? 503
                : 409;
        throw new ApiError(
          code,
          status,
          status === 404
            ? "Resource not found"
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
  function query(request: Request, allowed: string[]) {
    const raw = readSearchQueryMap(request, allowed);
    if (raw.limit !== undefined && !/^[1-9][0-9]?$/.test(raw.limit))
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid page");
    return { ...raw, ...(raw.limit === undefined ? {} : { limit: Number(raw.limit) }) };
  }
  return {
    FEED: apiRoute((request) =>
      run(async () => {
        const who = await actor(request);
        return deps.feed.getFeed(
          who,
          CommunityFeedQuerySchema.parse(query(request, ["scope", "limit", "afterId"])),
        );
      }),
    ),
    WISHLIST: apiRoute((request) =>
      run(async () => {
        const who = await actor(request);
        return deps.wishlist.listWishlistEntries(
          who,
          WishlistListQuerySchema.parse(query(request, ["status", "limit", "afterId"])),
        );
      }),
    ),
    CREATE: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        return deps.wishlist.createWishlistEntry(
          who,
          CreateWishlistEntrySchema.parse(await readPrivateJson(request, "community")),
        );
      }),
    ),
    FULFILL: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        EmptyWishlistCommandSchema.parse(await readPrivateJson(request));
        return deps.wishlist.fulfillWishlistEntry(who, WishlistIdSchema.parse(id));
      }),
    ),
    REMOVE: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        if (request.body) await readBoundedBody(request, 0);
        return deps.wishlist.removeWishlistEntry(who, WishlistIdSchema.parse(id));
      }),
    ),
    DUPLICATES: apiRoute((request) =>
      run(async () => {
        const who = await actor(request);
        return deps.wishlist.listDuplicateCandidates(
          who,
          DuplicateCandidatesQuerySchema.parse(query(request, ["itemId", "afterId", "limit"])),
        );
      }),
    ),
    MARK_DUPLICATE: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const pair = DuplicatePairSchema.parse(await readPrivateJson(request));
        return deps.wishlist.markDuplicateRelation(who, pair.itemAId, pair.itemBId);
      }),
    ),
    UNMARK_DUPLICATE: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const pair = DuplicatePairSchema.parse(await readPrivateJson(request));
        return deps.wishlist.unmarkDuplicateRelation(who, pair.itemAId, pair.itemBId);
      }),
    ),
  };
}
