import { createMoneyCapabilitiesRouteHandler } from "../../../../../lib/money-capabilities-routes";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: Request) {
  const [{ auth }, { serverEnv }] = await Promise.all([
    import("../../../../../lib/auth"),
    import("@sammlerraum/config/server"),
  ]);
  return createMoneyCapabilitiesRouteHandler({
    appOrigin: serverEnv.APP_ORIGIN,
    authoringEnabled: serverEnv.MONEY_AUTHORING_ENABLED,
    canonicalConsumersEnabled: serverEnv.MONEY_CANONICAL_CONSUMERS_ENABLED,
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
  })(request);
}
