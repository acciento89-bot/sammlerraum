import { createGradingRouteDependencies, createGradingRouteHandlers } from "./grading-routes";

export async function gradingRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createGradingRouteHandlers(
    createGradingRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
