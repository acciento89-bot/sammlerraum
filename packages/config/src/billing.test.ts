import { it, expect } from "vitest";
import { parseBillingPolicyEnv } from "./server";
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
