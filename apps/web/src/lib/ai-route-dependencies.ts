import { createAIApplyRouteDependencies, createAIApplyRouteHandlers } from "./ai-routes";
export async function aiApplyHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createAIApplyRouteHandlers(
    createAIApplyRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
