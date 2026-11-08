import { describe, it, expect } from "vitest";
import { BillingPolicySchema } from "./billing";
const tier = {
  ITEM_CREATE: 2,
  MEDIA_COUNT: 3,
  MEDIA_BYTES: 100,
  AI_MONTHLY: 0,
  IMPORT_PROFILES: 1,
  MARKET_DATA: false,
  EXTENDED_HISTORY: false,
  ADVANCED_ANALYTICS: false,
  XLSX: false,
  ADVANCED_FILTERS: false,
};
describe("explicit bounded billing policy", () => {
  it("accepts explicit zero or unlimited quotas but no hidden defaults", () => {
    expect(
      BillingPolicySchema.parse({ FREE: tier, PREMIUM: { ...tier, ITEM_CREATE: null } }).FREE
        .AI_MONTHLY,
    ).toBe(0);
    expect(BillingPolicySchema.safeParse({ FREE: tier, PREMIUM: {} }).success).toBe(false);
  });
  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid usage boundary %s",
    (value) => {
      expect(
        BillingPolicySchema.safeParse({ FREE: { ...tier, MEDIA_BYTES: value }, PREMIUM: tier })
          .success,
      ).toBe(false);
    },
  );
  it("rejects misspelled fields and a narrower Premium quota", () => {
    expect(
      BillingPolicySchema.safeParse({ FREE: { ...tier, unknown: true }, PREMIUM: tier }).success,
    ).toBe(false);
    expect(
      BillingPolicySchema.safeParse({ FREE: tier, PREMIUM: { ...tier, ITEM_CREATE: 1 } }).success,
    ).toBe(false);
    expect(
      BillingPolicySchema.safeParse({ FREE: { ...tier, ITEM_CREATE: null }, PREMIUM: tier })
        .success,
    ).toBe(false);
  });
});
