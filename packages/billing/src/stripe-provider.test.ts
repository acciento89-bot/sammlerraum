import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
async function fixture(status = 200, override?: unknown, portalConfigurationId?: string) {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    const result = path.endsWith("/subscriptions")
      ? { object: "list", data: [], has_more: false }
      : path.endsWith("/customers")
        ? { id: "cus_owned", object: "customer" }
        : path.endsWith("/billing_portal/sessions")
          ? {
              id: "bps_owned",
              url: "https://billing.stripe.com/p/session/owned",
              customer: "cus_owned",
            }
          : {
              id: "cs_owned",
              url: "https://checkout.stripe.com/c/pay/owned",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            };
    return Response.json(override ?? result, { status, headers: { "request-id": "req_fixture" } });
  };
  const path = "./stripe-provider",
    module = await import(path).catch(() => null);
  expect(module?.StripeBillingProvider, "actual official SDK adapter must exist").toBeTypeOf(
    "function",
  );
  return {
    requests,
    provider: new module!.StripeBillingProvider({
      apiKey: "fixture-not-a-real-key",
      appOrigin: "https://sammlerraum.example",
      monthlyPriceId: "price_monthly_fixture",
      yearlyPriceId: "price_yearly_fixture",
      portalConfigurationId,
      fetch: transport,
    }),
  };
}
const input = () => ({
  subjectId: "own-subject",
  customerId: "cus_owned",
  cadence: "MONTHLY",
  locale: "de",
  requestKey: randomUUID(),
  expiresAt: new Date(Date.now() + 3600000),
});
it("creates hosted subscription Checkout with configured price and owner-bound metadata", async () => {
  const { provider, requests } = await fixture();
  const result = await provider.createCheckout(input());
  expect(result).toMatchObject({ id: "cs_owned", url: "https://checkout.stripe.com/c/pay/owned" });
  const request = requests.find((request) =>
      new URL(request.url).pathname.endsWith("/checkout/sessions"),
    )!,
    params = new URLSearchParams(await request.text());
  expect(new URL(request.url).origin).toBe("https://api.stripe.com");
  expect(params.get("mode")).toBe("subscription");
  expect(params.get("customer")).toBe("cus_owned");
  expect(params.get("line_items[0][price]")).toBe("price_monthly_fixture");
  expect(params.get("line_items[0][quantity]")).toBe("1");
  expect(params.get("subscription_data[metadata][subjectId]")).toBe("own-subject");
  expect(params.get("success_url")).toBe(
    "https://sammlerraum.example/de/account/billing?checkout=success",
  );
  expect(params.get("payment_method_types[0]")).toBeNull();
  expect(params.get("automatic_tax[enabled]")).toBeNull();
  expect(params.get("integration_identifier")).toMatch(/^sammlerraum_[a-z]{8}$/u);
  expect(request.headers.get("stripe-version")).toBe("2026-10-28.endive");
  expect(request.headers.get("stripe-account")).toBeNull();
  expect(request.headers.get("idempotency-key")).toMatch(/^sammlerraum:checkout:/u);
});
it("reuses the exact operation key and integration identifier for retries", async () => {
  const { provider, requests } = await fixture(),
    operation = input();
  await provider.createCheckout(operation);
  await provider.createCheckout(operation);
  const posts = requests.filter((request) => request.method === "POST");
  expect(await posts[0]!.text()).toBe(await posts[1]!.text());
  expect(posts[0]!.headers.get("idempotency-key")).toBe(posts[1]!.headers.get("idempotency-key"));
});
it("creates customers with only immutable local subject metadata", async () => {
  const { provider, requests } = await fixture();
  expect(
    await provider.createCustomer({ subjectId: "own-subject", requestKey: randomUUID() }),
  ).toBe("cus_owned");
  const body = new URLSearchParams(await requests[0]!.text());
  expect(body.get("metadata[subjectId]")).toBe("own-subject");
  expect(body.get("email")).toBeNull();
});
it("creates an owned hosted portal with a server-derived return origin", async () => {
  const { provider, requests } = await fixture();
  await provider.createPortalSession({
    customerId: "cus_owned",
    locale: "en",
    requestKey: randomUUID(),
  });
  const body = new URLSearchParams(await requests[0]!.text());
  expect(body.get("customer")).toBe("cus_owned");
  expect(body.get("return_url")).toBe("https://sammlerraum.example/en/account/billing");
});
it("uses the dedicated app portal instead of the account-wide default", async () => {
  const { provider, requests } = await fixture(200, undefined, "bpc_sammlerraum");
  await provider.createPortalSession({
    customerId: "cus_owned",
    locale: "de",
    requestKey: randomUUID(),
  });
  const body = new URLSearchParams(await requests[0]!.text());
  expect(body.get("configuration")).toBe("bpc_sammlerraum");
});
it.each([
  "https://evil.example/checkout",
  "http://checkout.stripe.com/c/pay/x",
  "https://checkout.stripe.com.evil.example/pay",
  "https://user@checkout.stripe.com/pay",
])("rejects unsafe provider redirect %s", async (url) => {
  const { provider } = await fixture(200, {
    id: "cs_owned",
    url,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  await expect(provider.createCheckout(input())).rejects.toMatchObject({
    code: "BILLING_UNAVAILABLE",
  });
});
it("rejects invalid cadence before any network request", async () => {
  const { provider, requests } = await fixture();
  await expect(
    provider.createCheckout({ ...input(), cadence: "client-price" }),
  ).rejects.toMatchObject({ code: "BILLING_INVALID_REQUEST" });
  expect(requests).toHaveLength(0);
});
it("sanitizes provider errors and disables hidden SDK retries", async () => {
  const { provider, requests } = await fixture(500, {
    error: { message: "private-provider-secret", type: "api_error" },
  });
  await expect(provider.createCheckout(input())).rejects.toMatchObject({
    code: "BILLING_UNAVAILABLE",
    message: "BILLING_UNAVAILABLE",
  });
  expect(requests).toHaveLength(1);
});

it("prevents a second purchase when an active provider subscription exists before its local webhook", async () => {
  const requests: Request[] = [];
  const path = "./stripe-provider",
    m = await import(path);
  const provider = new m.StripeBillingProvider({
    apiKey: "fixture-not-a-real-key",
    appOrigin: "https://sammlerraum.example",
    monthlyPriceId: "price_monthly_fixture",
    yearlyPriceId: "price_yearly_fixture",
    fetch: async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return Response.json({
        object: "list",
        data: [{ id: "sub_existing", status: "active" }],
        has_more: false,
      });
    },
  });
  await expect(provider.createCheckout(input())).rejects.toMatchObject({
    code: "BILLING_CONFLICT",
  });
  expect(requests.every((r) => r.method === "GET")).toBe(true);
});
