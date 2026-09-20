import {
  SecurityServiceError,
  type SessionMetadata,
} from "@sammlerraum/domain/identity/security-service";

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

function errorResponse(code: string, status: number, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: noStoreHeaders });
}

function hasSameOrigin(request: Request, appOrigin: string): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(appOrigin).origin;
}

export function createSessionRouteHandlers(dependencies: SessionRouteDependencies) {
  return {
    async GET(request: Request): Promise<Response> {
      const session = await dependencies.getSession(request.headers);
      if (!session) return errorResponse("UNAUTHORIZED", 401, "Authentication required");
      const sessions = await dependencies.service.listSessions(session.user.id, session.session.id);
      return Response.json({ sessions }, { headers: noStoreHeaders });
    },

    async DELETE(request: Request): Promise<Response> {
      if (!hasSameOrigin(request, dependencies.appOrigin)) {
        return errorResponse("FORBIDDEN", 403, "Cross-origin request rejected");
      }
      const session = await dependencies.getSession(request.headers);
      if (!session) return errorResponse("UNAUTHORIZED", 401, "Authentication required");

      let sessionId: unknown;
      try {
        ({ sessionId } = (await request.json()) as { sessionId?: unknown });
      } catch {
        return errorResponse("INVALID_REQUEST", 400, "Invalid JSON body");
      }
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        return errorResponse("INVALID_REQUEST", 400, "sessionId is required");
      }

      try {
        await dependencies.service.revokeSession(session.user.id, sessionId);
        return new Response(null, { status: 204, headers: noStoreHeaders });
      } catch (error) {
        if (error instanceof SecurityServiceError && error.code === "SESSION_NOT_FOUND") {
          return errorResponse(error.code, 404, error.message);
        }
        throw error;
      }
    },
  };
}

export function createRecoveryMethodRouteHandlers(dependencies: RecoveryRouteDependencies) {
  return {
    async DELETE(request: Request): Promise<Response> {
      if (!hasSameOrigin(request, dependencies.appOrigin)) {
        return errorResponse("FORBIDDEN", 403, "Cross-origin request rejected");
      }
      const session = await dependencies.getSession(request.headers);
      if (!session) return errorResponse("UNAUTHORIZED", 401, "Authentication required");

      const now = (dependencies.now ?? (() => new Date()))().getTime();
      const sessionAge = now - new Date(session.session.createdAt).getTime();
      if (sessionAge < 0 || sessionAge >= dependencies.freshAgeSeconds * 1_000) {
        return errorResponse("SESSION_NOT_FRESH", 403, "Recent authentication required");
      }

      let methodId: unknown;
      try {
        ({ methodId } = (await request.json()) as { methodId?: unknown });
      } catch {
        return errorResponse("INVALID_REQUEST", 400, "Invalid JSON body");
      }
      if (typeof methodId !== "string" || methodId.length === 0) {
        return errorResponse("INVALID_REQUEST", 400, "methodId is required");
      }

      try {
        await dependencies.service.removeLoginMethod(session.user.id, methodId);
        return new Response(null, { status: 204, headers: noStoreHeaders });
      } catch (error) {
        if (error instanceof SecurityServiceError) {
          const status = error.code === "RECOVERY_METHOD_REQUIRED" ? 409 : 404;
          return errorResponse(error.code, status, error.message);
        }
        throw error;
      }
    },
  };
}
