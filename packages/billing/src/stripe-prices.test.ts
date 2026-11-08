import { it, expect } from "vitest";
import { StripeBillingProvider } from "./stripe-provider";
function fixture(overrides: Record<string, unknown> = {}) {
  const requests: string[] = [];
  const provider = new StripeBillingProvider({
    apiKey: "sk_test_fixture",
    appOrigin: "https://sammlerraum.example",
    monthlyPriceId: "price_monthly_fixture",
    yearlyPriceId: "price_yearly_fixture",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.url);
      const yearly = request.url.includes("price_yearly_fixture");
      return Response.json(
        {
          id: yearly ? "price_yearly_fixture" : "price_monthly_fixture",
          object: "price",
          active: true,
          billing_scheme: "per_unit",
          currency: "eur",
          livemode: false,
          custom_unit_amount: null,
          tiers_mode: null,
          transform_quantity: null,
          type: "recurring",
          unit_amount: yearly ? 29000 : 2900,
          unit_amount_decimal: yearly ? "29000" : "2900",
          recurring: {
            interval: yearly ? "year" : "month",
            interval_count: 1,
            usage_type: "licensed",
            trial_period_days: null,
          },
          product: "prod_private",
          metadata: { private_note: "never-public" },
          tax_behavior: "inclusive",
          ...overrides,
        },
        { headers: { "request-id": "req_fixture" } },
      );
    },
  });
  return { provider, requests };
}
it("obtains closed public monthly/yearly price metadata from the actual official SDK", async () => {
  const { provider, requests } = fixture();
  expect(provider.getPublicPrices).toBeTypeOf("function");
  const prices = await provider.getPublicPrices();
  expect(prices).toEqual([
    {
      cadence: "MONTHLY",
      amountMinor: "2900",
      currency: "EUR",
      minorUnitExponent: 2,
      taxBehavior: "inclusive",
    },
    {
      cadence: "YEARLY",
      amountMinor: "29000",
      currency: "EUR",
      minorUnitExponent: 2,
      taxBehavior: "inclusive",
    },
  ]);
  expect(requests).toEqual([
    "https://api.stripe.com/v1/prices/price_monthly_fixture",
    "https://api.stripe.com/v1/prices/price_yearly_fixture",
  ]);
  expect(JSON.stringify(prices)).not.toMatch(/prod_private|private_note|never-public|sk_test/);
});
it.each([
  { active: false },
  { livemode: true },
  { billing_scheme: "tiered" },
  { type: "one_time" },
  { unit_amount: null },
  { unit_amount_decimal: "2900.5" },
  { currency: "zzz" },
  { recurring: { interval: "day", interval_count: 1, usage_type: "licensed" } },
  { custom_unit_amount: { enabled: true } },
  { transform_quantity: { divide_by: 10, round: "up" } },
])("rejects unavailable or misleading fixed public offers: %j", async (overrides) => {
  await expect(fixture(overrides).provider.getPublicPrices()).rejects.toMatchObject({
    code: "BILLING_UNAVAILABLE",
  });
});
it("uses charge denomination for the documented ISK legacy representation", async () => {
  const prices = await fixture({
    currency: "isk",
    unit_amount: 500,
    unit_amount_decimal: "500",
  }).provider.getPublicPrices();
  expect(prices[0]).toMatchObject({ amountMinor: "500", currency: "ISK", minorUnitExponent: 2 });
});
it("preserves a zero-decimal JPY price without dividing it by one hundred", async () => {
  const prices = await fixture({
    currency: "jpy",
    unit_amount: 500,
    unit_amount_decimal: "500",
  }).provider.getPublicPrices();
  expect(prices[0]).toMatchObject({ amountMinor: "500", currency: "JPY", minorUnitExponent: 0 });
});

it("honors a canceled metadata request before any provider transport", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  await expect(f.provider.getPublicPrices({ signal: controller.signal })).rejects.toMatchObject({
    code: "BILLING_UNAVAILABLE",
  });
  expect(f.requests).toHaveLength(0);
});
