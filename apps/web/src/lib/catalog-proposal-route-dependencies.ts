import { createCatalogProposalService } from "@sammlerraum/domain/catalog/proposal-service";
import { createCatalogProposalRouteHandlers } from "./catalog-proposal-routes";

export async function catalogProposalRouteHandlers() {
  const [{ auth }, { prisma }, { serverEnv }] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
  ]);
  return createCatalogProposalRouteHandlers({
    appOrigin: serverEnv.APP_ORIGIN,
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    createService: () => createCatalogProposalService(prisma),
  });
}
