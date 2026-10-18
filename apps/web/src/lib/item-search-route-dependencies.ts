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
    ),
  );
};
let handlers: ReturnType<typeof dependencies> | undefined;
export function itemSearchRouteHandlers() {
  return (handlers ??= dependencies());
}
