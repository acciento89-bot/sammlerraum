import { createModerationDependencies, createModerationHandlers } from "./moderation-routes";
export async function moderationHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createModerationHandlers(createModerationDependencies(prisma, auth, serverEnv.APP_ORIGIN));
}
