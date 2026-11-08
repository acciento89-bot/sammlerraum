import { BillingError } from "@sammlerraum/contracts/billing";
import { createBillingRouteHandlers } from "./billing-routes";
export async function billingHandlers() {
  const [
    { auth },
    { prisma },
    { serverEnv, parseBillingProviderEnv },
    { StripeBillingProvider },
    { createBillingSessionService },
  ] = await Promise.all([
    import("./auth"),
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
    import("@sammlerraum/billing/stripe-provider"),
    import("@sammlerraum/domain/billing/session-service"),
  ]);
  return createBillingRouteHandlers({
    appOrigin: serverEnv.APP_ORIGIN,
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    getService: () => {
      try {
        const config = parseBillingProviderEnv(process.env);
        if (!config) throw new BillingError("BILLING_UNAVAILABLE");
        return createBillingSessionService(prisma, new StripeBillingProvider(config));
      } catch {
        throw new BillingError("BILLING_UNAVAILABLE");
      }
    },
  });
}
