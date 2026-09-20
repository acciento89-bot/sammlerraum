import {
  createSecurityService,
  SecurityServiceError,
  type SecurityDatabase,
  type SessionMetadata,
} from "@sammlerraum/domain/identity/security-service";

type TrustedSession = {
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

const noStoreHeaders = { "cache-control": "no-store" };

function errorResponse(code: string, status: number, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: noStoreHeaders });
}

export function hasSameOrigin(request: Request, appOrigin: string): boolean {
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

async function runtimeHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("../../../../../lib/auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createSessionRouteHandlers({
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createSecurityService(prisma as unknown as SecurityDatabase),
    appOrigin: serverEnv.APP_ORIGIN,
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  return (await runtimeHandlers()).GET(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return (await runtimeHandlers()).DELETE(request);
}
