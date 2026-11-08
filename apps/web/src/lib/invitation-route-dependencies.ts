import {
  createInvitationRouteDependencies,
  createInvitationRouteHandlers,
} from "./invitation-routes";
export async function invitationRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createInvitationRouteHandlers(
    createInvitationRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
