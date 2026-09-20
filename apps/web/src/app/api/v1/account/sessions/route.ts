import {
  createSecurityService,
  type SecurityDatabase,
} from "@sammlerraum/domain/identity/security-service";
import { createSessionRouteHandlers } from "../../../../../lib/account-security-routes";

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
