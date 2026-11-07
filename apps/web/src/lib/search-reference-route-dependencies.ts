import type { ReferenceFamily } from "@sammlerraum/contracts/search-references";
import {
  createSearchReferenceRouteDependencies,
  createSearchReferenceRouteHandlers,
} from "./search-reference-routes";
export async function searchReferenceRouteHandlers(family: ReferenceFamily) {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createSearchReferenceRouteHandlers(
    createSearchReferenceRouteDependencies(prisma, auth, serverEnv.APP_ORIGIN),
    family,
  );
}
