import { it, expect } from "vitest";
async function handlers() {
  const path = "./billing-routes",
    m = await import(path).catch(() => null);
  expect(m?.createBillingRouteHandlers, "real authenticated billing routes").toBeTypeOf("function");
  return m!.createBillingRouteHandlers;
}
function request(body: unknown, origin = "https://sammlerraum.example") {
  return new Request("https://sammlerraum.example/api/v1/billing/checkout", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const input = {
  requestKey: "0c29b89f-3bda-48ea-bd11-6be5ac9806a3",
  cadence: "MONTHLY",
  locale: "de",
};
it("requires a fresh authenticated own session and same origin", async () => {
  const calls: unknown[] = [];
  const create = await handlers();
  const dependencies = {
    appOrigin: "https://sammlerraum.example",
    getSession: async () => null,
    getService: () => ({
      checkout: async (...args: unknown[]) => {
        calls.push(args);
        return {};
      },
    }),
  };
  expect((await create(dependencies).CHECKOUT(request(input))).status).toBe(401);
  expect(
    (
      await create({ ...dependencies, getSession: async () => ({ user: { id: "own" } }) }).CHECKOUT(
        request(input, "https://foreign.example"),
      )
    ).status,
  ).toBe(403);
  expect(calls).toHaveLength(0);
});
it("uses only the session actor and rejects caller supplied customer, price and return URL", async () => {
  const create = await handlers();
  let received: unknown;
  const service = {
    checkout: async (actor: unknown, body: unknown) => {
      received = { actor, body };
      return { url: "https://checkout.stripe.com/c/pay/fixture" };
    },
    portal: async () => ({}),
  };
  const routes = create({
    appOrigin: "https://sammlerraum.example",
    getSession: async () => ({ user: { id: "actual-owner" } }),
    getService: () => service,
  });
  for (const extra of [
    { customerId: "cus_foreign" },
    { priceId: "price_foreign" },
    { returnUrl: "https://evil.example" },
  ])
    expect((await routes.CHECKOUT(request({ ...input, ...extra }))).status).toBe(400);
  const result = await routes.CHECKOUT(request(input));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(received).toEqual({ actor: { userId: "actual-owner" }, body: input });
});
