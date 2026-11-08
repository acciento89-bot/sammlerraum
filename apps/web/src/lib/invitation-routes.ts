import { ApiError } from "@sammlerraum/contracts/errors";
import {
  CreateInvitationSchema,
  RevokeInvitationSchema,
  InvitationError,
  MembershipCollectionIdSchema,
} from "@sammlerraum/contracts/collaboration";
import { createInvitationService } from "@sammlerraum/domain/collaboration/invitation-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readItemSearchQuery, mapItemSearchError } from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
const createBody = CreateInvitationSchema.omit({ collectionId: true });
const revokeBody = RevokeInvitationSchema.pick({ expectedRevision: true });
export function createInvitationRouteDependencies(
  database: Parameters<typeof createInvitationService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createInvitationService(database),
  };
}
function mapped(error: unknown): never {
  if (error instanceof InvitationError) {
    const code = error.code,
      status =
        code === "INVITATION_INVALID"
          ? 400
          : code === "INVITATION_NOT_FOUND"
            ? 404
            : [
                  "INVITATION_FORBIDDEN",
                  "INVITATION_RECIPIENT_MISMATCH",
                  "INVITATION_VERIFICATION_REQUIRED",
                ].includes(code)
              ? 403
              : ["INVITATION_EXPIRED", "INVITATION_REVOKED"].includes(code)
                ? 410
                : code === "INVITATION_UNAVAILABLE"
                  ? 503
                  : code === "INVITATION_INTEGRITY"
                    ? 500
                    : 409;
    throw new ApiError(
      code,
      status,
      status === 400
        ? "Invalid invitation request"
        : status === 404
          ? "Resource not found"
          : status === 403
            ? "Invitation is not available for this account"
            : status === 410
              ? "Invitation is no longer available"
              : status === 503
                ? "Invitations are temporarily unavailable"
                : status === 500
                  ? "An unexpected error occurred"
                  : "Invitation or membership changed; inspect the current state",
    );
  }
  return mapItemSearchError(error);
}
export function createInvitationRouteHandlers(
  dependencies: ReturnType<typeof createInvitationRouteDependencies>,
) {
  async function actor(request: Request, mutation = true) {
    const requestOrigin = request.headers.get("origin"),
      expected = new URL(dependencies.appOrigin).origin;
    if (
      mutation ? requestOrigin !== expected : requestOrigin !== null && requestOrigin !== expected
    )
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    if (new URL(request.url).hash) throw new InvitationError("INVITATION_INVALID");
    readItemSearchQuery(request, []);
    return { userId: session.user.id };
  }
  async function run(work: () => Promise<unknown>, status = 200) {
    try {
      return Response.json(await work(), { status, headers: { "cache-control": "no-store" } });
    } catch (error) {
      return mapped(error);
    }
  }
  return {
    GET: apiRoute((request, collectionId: string) =>
      run(async () => {
        const who = await actor(request, false);
        return dependencies.service.getPendingInvitations(who, collectionId);
      }),
    ),
    POST: apiRoute((request, collectionId: string) =>
      run(async () => {
        const who = await actor(request),
          scope = MembershipCollectionIdSchema.safeParse(collectionId);
        if (!scope.success) throw new InvitationError("INVITATION_INVALID");
        const body = createBody.safeParse(await readPrivateJson(request));
        if (!body.success) throw new InvitationError("INVITATION_INVALID");
        return dependencies.service.createInvitation(who, {
          ...body.data,
          collectionId: scope.data,
        });
      }, 201),
    ),
    ACCEPT: apiRoute((request) =>
      run(async () => {
        const who = await actor(request);
        return dependencies.service.acceptInvitation(who, await readPrivateJson(request));
      }),
    ),
    REVOKE: apiRoute((request, collectionId: string, invitationId: string) =>
      run(async () => {
        const who = await actor(request),
          body = revokeBody.safeParse(await readPrivateJson(request));
        if (!body.success) throw new InvitationError("INVITATION_INVALID");
        return dependencies.service.revokeInvitation(who, {
          ...body.data,
          collectionId,
          invitationId,
        });
      }),
    ),
  };
}
