import { BillingError } from "@sammlerraum/contracts/billing";
import { createBillingWebhookRoute } from "../../../../../lib/billing-webhook-route";
export async function POST(request: Request) {
  const [
    { prisma },
    { parseBillingProviderEnv },
    { StripeBillingProvider },
    { createBillingWebhookService },
  ] = await Promise.all([
    import("@sammlerraum/db/client"),
    import("@sammlerraum/config/server"),
    import("@sammlerraum/billing/stripe-provider"),
    import("@sammlerraum/domain/billing/webhook-service"),
  ]);
  let provider: InstanceType<typeof StripeBillingProvider> | null = null;
  const route = createBillingWebhookRoute({
    verify: (raw, signature) => {
      let config;
      try {
        config = parseBillingProviderEnv(process.env);
      } catch {
        throw new BillingError("BILLING_UNAVAILABLE");
      }
      if (!config) throw new BillingError("BILLING_UNAVAILABLE");
      provider = new StripeBillingProvider(config);
      return provider.verifyWebhook(raw, signature);
    },
    receive: async (event) => {
      const config = parseBillingProviderEnv(process.env);
      if (!config || !provider) throw new BillingError("BILLING_UNAVAILABLE");
      return createBillingWebhookService(prisma, {
        providerId: provider.id,
        liveMode: config.liveMode,
      }).receiveEvent(event);
    },
  });
  return route(request);
}
