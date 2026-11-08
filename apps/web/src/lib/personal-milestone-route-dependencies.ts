import {
  createPersonalMilestoneRouteDependencies,
  createPersonalMilestoneRouteHandlers,
} from "./personal-milestone-routes";
const dependencies = async () => {
  const [{ auth }, { createPrismaClient }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/create-client"),
    import("@sammlerraum/config/server"),
  ]);
  return createPersonalMilestoneRouteHandlers(
    createPersonalMilestoneRouteDependencies(
      createPrismaClient(serverEnv.DATABASE_URL, { bounded: true }),
      auth,
      serverEnv.APP_ORIGIN,
    ),
  );
};
let handlers: ReturnType<typeof dependencies> | undefined;
export function personalMilestoneRouteHandlers() {
  return (handlers ??= dependencies());
}
