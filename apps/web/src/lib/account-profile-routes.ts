import { UpdateOwnProfileSchema } from "@sammlerraum/contracts/profile";
import { ApiError } from "@sammlerraum/contracts/errors";
import { ProfileServiceError } from "@sammlerraum/domain/identity/profile-service";

import { apiRoute } from "./api/route-handler";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  service: {
    getOwnProfile(userId: string): Promise<unknown>;
    upsertOwnProfile(
      userId: string,
      input: ReturnType<typeof UpdateOwnProfileSchema.parse>,
    ): Promise<unknown>;
  };
  appOrigin: string;
};

const noStoreHeaders = { "cache-control": "no-store" };

async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 400, "Request validation failed");
  }
}

export function createProfileRouteHandlers(dependencies: Dependencies) {
  return {
    GET: apiRoute(async (request) => {
      const session = await dependencies.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
      return Response.json(
        { profile: await dependencies.service.getOwnProfile(session.user.id) },
        { headers: noStoreHeaders },
      );
    }),
    PUT: apiRoute(async (request) => {
      if (request.headers.get("origin") !== new URL(dependencies.appOrigin).origin) {
        throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
      }
      const session = await dependencies.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
      const input = UpdateOwnProfileSchema.parse(await body(request));
      try {
        return Response.json(
          { profile: await dependencies.service.upsertOwnProfile(session.user.id, input) },
          { headers: noStoreHeaders },
        );
      } catch (error) {
        if (error instanceof ProfileServiceError) {
          throw new ApiError("HANDLE_TAKEN", 409, "Profile handle is already in use");
        }
        throw error;
      }
    }),
  };
}
