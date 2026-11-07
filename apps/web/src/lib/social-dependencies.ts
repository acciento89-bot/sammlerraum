import { createSocialDependencies, createSocialHandlers } from "./social-routes";
export async function socialHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createSocialHandlers(createSocialDependencies(prisma, auth, serverEnv.APP_ORIGIN));
}
