import {
  createSmartCollectionRouteDependencies,
  createSmartCollectionRouteHandlers,
} from "./smart-collection-routes";
const dependencies = async () => {
  const [{ auth }, { createPrismaClient }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/create-client"),
    import("@sammlerraum/config/server"),
  ]);
  return createSmartCollectionRouteHandlers(
    createSmartCollectionRouteDependencies(
      createPrismaClient(serverEnv.DATABASE_URL, { bounded: true }),
      auth,
      serverEnv.APP_ORIGIN,
    ),
  );
};
let handlers: ReturnType<typeof dependencies> | undefined;
export function smartCollectionRouteHandlers() {
  return (handlers ??= dependencies());
}
