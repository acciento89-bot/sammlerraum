import { it, expect } from "vitest";
import { parseBillingPolicyEnv, parseBillingProviderEnv } from "./server";
const tier = {
  ITEM_CREATE: 2,
  MEDIA_COUNT: 2,
  MEDIA_BYTES: 100,
  AI_MONTHLY: 0,
  IMPORT_PROFILES: 1,
  MARKET_DATA: false,
  EXTENDED_HISTORY: false,
  ADVANCED_ANALYTICS: false,
  XLSX: false,
  ADVANCED_FILTERS: false,
};
it("requires explicit whole deployment quotas, never guessing production limits", () => {
  expect(() => parseBillingPolicyEnv({})).toThrow("BILLING_PLAN_LIMITS");
  expect(() => parseBillingPolicyEnv({ BILLING_PLAN_LIMITS: "not json" })).toThrow(
    "BILLING_PLAN_LIMITS",
  );
  expect(
    parseBillingPolicyEnv({ BILLING_PLAN_LIMITS: JSON.stringify({ FREE: tier, PREMIUM: tier }) }),
  ).toEqual({ FREE: tier, PREMIUM: tier });
});
it("does not leak malformed private input in validation errors", () => {
  expect(() => parseBillingPolicyEnv({ BILLING_PLAN_LIMITS: "private-secret" })).toThrow(
    /^Invalid environment configuration: BILLING_PLAN_LIMITS$/u,
  );
});

it("keeps payment activation off and requires complete explicit provider configuration", async () => {
  const module = await import("./server");
  expect(module.parseBillingProviderEnv, "provider configuration parser exists").toBeTypeOf(
    "function",
  );
  expect(module.parseBillingProviderEnv({})).toBeNull();
  expect(() => module.parseBillingProviderEnv({ BILLING_ENABLED: "true" })).toThrow();
  const ready = {
    BILLING_ENABLED: "true",
    STRIPE_SECRET_KEY: "rk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_PREMIUM_MONTHLY_PRICE_ID: "price_monthly_fixture",
    STRIPE_PREMIUM_YEARLY_PRICE_ID: "price_yearly_fixture",
    APP_ORIGIN: "https://sammlerraum.example",
    BILLING_PLAN_LIMITS: JSON.stringify({ FREE: tier, PREMIUM: tier }),
  };
  expect(module.parseBillingProviderEnv(ready)).toMatchObject({
    monthlyPriceId: "price_monthly_fixture",
  });
  expect(
    module.parseBillingProviderEnv({
      ...ready,
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_sammlerraum",
    }),
  ).toMatchObject({ portalConfigurationId: "bpc_sammlerraum" });
  expect(() =>
    module.parseBillingProviderEnv({
      ...ready,
      STRIPE_PORTAL_CONFIGURATION_ID: "https://foreign.example",
    }),
  ).toThrow("STRIPE_PORTAL_CONFIGURATION_ID");
  expect(() =>
    module.parseBillingProviderEnv({
      ...ready,
      STRIPE_PREMIUM_YEARLY_PRICE_ID: ready.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
    }),
  ).toThrow();
});

it("derives Stripe test/live mode only from the key prefix, never an embedded suffix", () => {
  const ready = {
    BILLING_ENABLED: "true",
    BILLING_ENVIRONMENT: "test",
    STRIPE_SECRET_KEY: "rk_test_fixture_live_embedded",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_PREMIUM_MONTHLY_PRICE_ID: "price_monthly_fixture",
    STRIPE_PREMIUM_YEARLY_PRICE_ID: "price_yearly_fixture",
    APP_ORIGIN: "https://sammlerraum.example",
    BILLING_PLAN_LIMITS: JSON.stringify({ FREE: tier, PREMIUM: tier }),
  };
  expect(parseBillingProviderEnv(ready)).toMatchObject({ liveMode: false });
  expect(
    parseBillingProviderEnv({
      ...ready,
      BILLING_ENVIRONMENT: "live",
      STRIPE_SECRET_KEY: "rk_live_fixture_test_embedded",
    }),
  ).toMatchObject({ liveMode: true });
});
