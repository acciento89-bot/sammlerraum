import { createRestoreRouteDependencies, createRestoreRouteHandlers } from "./restore-routes";
export async function restoreRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createRestoreRouteHandlers(
    createRestoreRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
