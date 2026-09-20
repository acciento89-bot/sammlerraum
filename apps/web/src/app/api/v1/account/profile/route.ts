import { createProfileService } from "@sammlerraum/domain/identity/profile-service";

import { createProfileRouteHandlers } from "../../../../../lib/account-profile-routes";

async function handlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("../../../../../lib/auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createProfileRouteHandlers({
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createProfileService(prisma),
    appOrigin: serverEnv.APP_ORIGIN,
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  return (await handlers()).GET(request);
}
export async function PUT(request: Request) {
  return (await handlers()).PUT(request);
}
