import { createAuxiliaryRouteHandlers } from "./collection-item-aux-routes";
import { createCollectionRouteHandlers, createItemRouteHandlers } from "./collection-item-routes";
import { createManagementRouteDependencies } from "./management-route-dependencies";

export async function managementHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  const dependencies = createManagementRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN);
  return {
    ...createCollectionRouteHandlers(dependencies),
    ...createItemRouteHandlers(dependencies),
    ...createAuxiliaryRouteHandlers(dependencies),
  };
}
