import {
  createItemSearchRouteDependencies,
  createItemSearchRouteHandlers,
} from "./item-search-routes";
const dependencies = async () => {
  const [{ auth }, { createPrismaClient }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/create-client"),
    import("@sammlerraum/config/server"),
  ]);
  return createItemSearchRouteHandlers(
    createItemSearchRouteDependencies(
      createPrismaClient(serverEnv.DATABASE_URL, { bounded: true }),
      auth,
      serverEnv.APP_ORIGIN,
      { canonicalMoneyEnabled: serverEnv.MONEY_CANONICAL_CONSUMERS_ENABLED },
    ),
  );
};
let handlers: ReturnType<typeof dependencies> | undefined;
export function itemSearchRouteHandlers() {
  return (handlers ??= dependencies());
}
