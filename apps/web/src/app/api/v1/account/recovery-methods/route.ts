import {
  createSecurityService,
  SecurityServiceError,
  type SecurityDatabase,
} from "@sammlerraum/domain/identity/security-service";

import { hasSameOrigin } from "../sessions/route";

type TrustedSession = {
  user: { id: string };
  session: { id: string; createdAt: Date };
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

async function runtimeHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("../../../../../lib/auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createRecoveryMethodRouteHandlers({
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createSecurityService(prisma as unknown as SecurityDatabase),
    appOrigin: serverEnv.APP_ORIGIN,
    freshAgeSeconds: 5 * 60,
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(request: Request): Promise<Response> {
  return (await runtimeHandlers()).DELETE(request);
}
