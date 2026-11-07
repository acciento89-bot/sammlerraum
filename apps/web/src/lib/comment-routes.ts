import { z } from "zod";
import { ApiError } from "@sammlerraum/contracts/errors";
import {
  CommunityError,
  FavoriteTargetSchema,
  FollowTargetSchema,
  CommunityListQuerySchema,
} from "@sammlerraum/contracts/community";
import {
  CreateCommentSchema,
  CommentPolicySchema,
  CommentHideSchema,
  CreateReportSchema,
} from "@sammlerraum/contracts/comments";
import { createCommentService } from "@sammlerraum/domain/community/comment-service";
import { createBlockReportService } from "@sammlerraum/domain/moderation/block-report-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readSearchQueryMap } from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
import { readBoundedBody } from "./api/read-bounded-body";
export function createCommentDependencies(
  db: Parameters<typeof createCommentService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
    comments: createCommentService(db),
    blocks: createBlockReportService(db),
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  };
}
export function createCommentHandlers(dependencies: ReturnType<typeof createCommentDependencies>) {
  async function actor(request: Request, write = false, optional = false) {
    const origin = request.headers.get("origin"),
      expected = new URL(dependencies.appOrigin).origin;
    if (write ? origin !== expected : origin !== null && origin !== expected)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session && !optional) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    if (new URL(request.url).hash)
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid community request");
    return session ? { userId: session.user.id } : null;
  }
  async function required(request: Request, write = false) {
    const who = await actor(request, write);
    if (!who) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return who;
  }
  async function run(work: () => Promise<unknown>) {
    try {
      return Response.json(await work(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof CommunityError) {
        const code = error.code,
          status =
            code === "COMMUNITY_INVALID" || code === "COMMENT_PARENT_INVALID"
              ? 400
              : code === "NOT_FOUND"
                ? 404
                : code === "BLOCKED_INTERACTION" || code === "COMMENTS_DISABLED"
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
              ? "Comment or interaction unavailable"
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
  function query(request: Request, withTarget = false) {
    const raw = readSearchQueryMap(
      request,
      withTarget ? ["type", "id", "limit", "afterId"] : ["limit", "afterId"],
    );
    if (raw.limit !== undefined && !/^[1-9][0-9]?$/u.test(raw.limit))
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid community page");
    const paging = CommunityListQuerySchema.parse({
      ...(raw.limit === undefined ? {} : { limit: Number(raw.limit) }),
      ...(raw.afterId === undefined ? {} : { afterId: raw.afterId }),
    });
    return {
      paging,
      target: withTarget ? FavoriteTargetSchema.parse({ type: raw.type, id: raw.id }) : null,
    };
  }
  return {
    COMMENTS: apiRoute((request) =>
      run(async () => {
        const who = await actor(request, false, true),
          value = query(request, true);
        return dependencies.comments.listComments(who, { target: value.target, ...value.paging });
      }),
    ),
    CREATE_COMMENT: apiRoute((request) =>
      run(async () => {
        const who = await required(request, true);
        readSearchQueryMap(request, []);
        return dependencies.comments.createComment(
          who,
          CreateCommentSchema.parse(await readPrivateJson(request, "community")),
        );
      }),
    ),
    DELETE_COMMENT: apiRoute((request, id: string) =>
      run(async () => {
        const who = await required(request, true);
        readSearchQueryMap(request, []);
        if (request.body !== null) await readBoundedBody(request, 0);
        return dependencies.comments.deleteOwnComment(who, z.uuid().parse(id));
      }),
    ),
    HIDE_COMMENT: apiRoute((request, id: string) =>
      run(async () => {
        const who = await required(request, true);
        readSearchQueryMap(request, []);
        return dependencies.comments.moderateOwnContentComment(
          who,
          z.uuid().parse(id),
          CommentHideSchema.parse(await readPrivateJson(request)),
        );
      }),
    ),
    GET_POLICY: apiRoute((request) =>
      run(async () => {
        const who = await required(request),
          raw = readSearchQueryMap(request, ["type", "id"]);
        return dependencies.comments.getOwnCommentPolicy(who, FavoriteTargetSchema.parse(raw));
      }),
    ),
    SET_POLICY: apiRoute((request) =>
      run(async () => {
        const who = await required(request, true);
        readSearchQueryMap(request, []);
        return dependencies.comments.setCommentPolicy(
          who,
          CommentPolicySchema.parse(await readPrivateJson(request)),
        );
      }),
    ),
    OWN_BLOCKS: apiRoute((request) =>
      run(async () => {
        const who = await required(request);
        return dependencies.blocks.listOwnBlocks(who, query(request).paging);
      }),
    ),
    BLOCK_USER: apiRoute((request) =>
      run(async () => {
        const who = await required(request, true);
        readSearchQueryMap(request, []);
        return dependencies.blocks.blockUser(
          who,
          FollowTargetSchema.parse(await readPrivateJson(request)).userId,
        );
      }),
    ),
    UNBLOCK_USER: apiRoute((request) =>
      run(async () => {
        const who = await required(request, true);
        readSearchQueryMap(request, []);
        return dependencies.blocks.unblockUser(
          who,
          FollowTargetSchema.parse(await readPrivateJson(request)).userId,
        );
      }),
    ),
    OWN_REPORTS: apiRoute((request) =>
      run(async () => {
        const who = await required(request);
        return dependencies.blocks.listOwnReports(who, query(request).paging);
      }),
    ),
    CREATE_REPORT: apiRoute((request) =>
      run(async () => {
        const who = await required(request, true);
        readSearchQueryMap(request, []);
        const value = CreateReportSchema.parse(await readPrivateJson(request));
        if (value.type === "COMMENT") {
          const { type: _type, ...body } = value;
          return dependencies.blocks.reportComment(who, body);
        }
        const { type: _type, ...body } = value;
        return dependencies.blocks.reportUser(who, body);
      }),
    ),
  };
}
