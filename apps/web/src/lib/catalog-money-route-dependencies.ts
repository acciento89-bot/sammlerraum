import {
  createCatalogMoneyRouteDependencies,
  createCatalogMoneyRouteHandlers,
} from "./catalog-money-routes";
const dependencies = async () => {
  const [{ auth }, { createPrismaClient }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/create-client"),
    import("@sammlerraum/config/server"),
  ]);
  return createCatalogMoneyRouteHandlers(
    createCatalogMoneyRouteDependencies(
      createPrismaClient(serverEnv.DATABASE_URL, { bounded: true }),
      auth,
      serverEnv.APP_ORIGIN,
      serverEnv.MONEY_AUTHORING_ENABLED,
    ),
  );
};
let handlers: ReturnType<typeof dependencies> | undefined;
export function catalogMoneyRouteHandlers() {
  return (handlers ??= dependencies());
}
