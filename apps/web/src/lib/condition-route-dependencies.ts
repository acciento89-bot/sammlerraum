import { createConditionRouteDependencies, createConditionRouteHandlers } from "./condition-routes";

export async function conditionRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createConditionRouteHandlers(
    createConditionRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
