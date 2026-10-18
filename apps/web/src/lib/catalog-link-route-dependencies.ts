import {
  createCatalogLinkRouteDependencies,
  createCatalogLinkRouteHandlers,
} from "./catalog-link-routes";
export async function catalogLinkRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createCatalogLinkRouteHandlers(
    createCatalogLinkRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
  );
}
