import {
  SecurityServiceError,
  type SessionMetadata,
} from "@sammlerraum/domain/identity/security-service";
import { ApiError } from "@sammlerraum/contracts/errors";
import { z } from "zod";

import { apiRoute } from "./api/route-handler";

export type TrustedSession = {
  user: { id: string };
  session: { id: string; createdAt: Date };
};

type SessionRouteDependencies = {
  getSession(headers: Headers): Promise<TrustedSession | null>;
  service: {
    listSessions(userId: string, currentSessionId: string): Promise<SessionMetadata[]>;
    revokeSession(userId: string, sessionId: string): Promise<void>;
  };
  appOrigin: string;
};

type RecoveryRouteDependencies = {
  getSession(headers: Headers): Promise<TrustedSession | null>;
  service: { removeLoginMethod(userId: string, methodId: string): Promise<void> };
  appOrigin: string;
  freshAgeSeconds: number;
  now?: () => Date;
};

const noStoreHeaders = { "cache-control": "no-store" };
const sessionIdSchema = z.object({ sessionId: z.string().min(1) });
const recoveryMethodIdSchema = z.object({ methodId: z.string().min(1) });

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 400, "Request validation failed");
  }
}

function hasSameOrigin(request: Request, appOrigin: string): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(appOrigin).origin;
}

export function createSessionRouteHandlers(dependencies: SessionRouteDependencies) {
  return {
    GET: apiRoute(async (request: Request): Promise<Response> => {
      const session = await dependencies.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
      const sessions = await dependencies.service.listSessions(session.user.id, session.session.id);
      return Response.json({ sessions }, { headers: noStoreHeaders });
    }),

    DELETE: apiRoute(async (request: Request): Promise<Response> => {
      if (!hasSameOrigin(request, dependencies.appOrigin)) {
        throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
      }
      const session = await dependencies.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");

      const { sessionId } = sessionIdSchema.parse(await parseJson(request));

      try {
        await dependencies.service.revokeSession(session.user.id, sessionId);
        return new Response(null, { status: 204, headers: noStoreHeaders });
      } catch (error) {
        if (error instanceof SecurityServiceError && error.code === "SESSION_NOT_FOUND") {
          throw new ApiError("SESSION_NOT_FOUND", 404, "Session not found");
        }
        throw error;
      }
    }),
  };
}

export function createRecoveryMethodRouteHandlers(dependencies: RecoveryRouteDependencies) {
  return {
    DELETE: apiRoute(async (request: Request): Promise<Response> => {
      if (!hasSameOrigin(request, dependencies.appOrigin)) {
        throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
      }
      const session = await dependencies.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");

      const now = (dependencies.now ?? (() => new Date()))().getTime();
      const sessionAge = now - new Date(session.session.createdAt).getTime();
      if (sessionAge < 0 || sessionAge >= dependencies.freshAgeSeconds * 1_000) {
        throw new ApiError("SESSION_NOT_FRESH", 403, "Recent authentication required");
      }

      const { methodId } = recoveryMethodIdSchema.parse(await parseJson(request));

      try {
        await dependencies.service.removeLoginMethod(session.user.id, methodId);
        return new Response(null, { status: 204, headers: noStoreHeaders });
      } catch (error) {
        if (error instanceof SecurityServiceError) {
          const status = error.code === "RECOVERY_METHOD_REQUIRED" ? 409 : 404;
          const message =
            error.code === "RECOVERY_METHOD_REQUIRED"
              ? "At least one recovery method is required"
              : "Login method not found";
          throw new ApiError(error.code, status, message);
        }
        throw error;
      }
    }),
  };
}
