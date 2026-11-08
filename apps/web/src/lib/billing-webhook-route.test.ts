import { it, expect } from "vitest";
import { BillingError } from "@sammlerraum/contracts/billing";
async function implementation() {
  const path = "./billing-webhook-route",
    m = await import(path).catch(() => null);
  expect(m?.createBillingWebhookRoute, "signed machine endpoint").toBeTypeOf("function");
  return m!.createBillingWebhookRoute;
}
function request(body = "{}", signature = "sig_fixture") {
  return new Request("https://sammlerraum.example/api/v1/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body,
  });
}
it("acknowledges only actual durable receipt insertion, without cookie/origin requirements", async () => {
  const create = await implementation();
  let received = 0;
  const route = create({
    verify: () => ({ eventId: "evt_fixture" }),
    receive: async () => {
      received++;
      return { id: "receipt", status: "PENDING" };
    },
  });
  const result = await route(request());
  expect(result.status).toBe(202);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(received).toBe(1);
  expect(await result.json()).toMatchObject({ received: true, status: "PENDING" });
});
it("never queues an invalid signature and returns a retryable failure if persistence fails", async () => {
  const create = await implementation();
  let received = 0;
  const receive = async () => {
    received++;
    throw new BillingError("BILLING_UNAVAILABLE");
  };
  expect(
    (
      await create({
        verify: () => {
          throw new BillingError("BILLING_INVALID_SIGNATURE");
        },
        receive,
      })(request())
    ).status,
  ).toBe(400);
  expect(received).toBe(0);
  expect(
    (await create({ verify: () => ({ eventId: "evt_fixture" }), receive })(request())).status,
  ).toBe(503);
  expect(received).toBe(1);
});
it("caps ingress before parsing and ignores supported-verifier null without persistence", async () => {
  const create = await implementation();
  let calls = 0;
  const route = create({
    verify: () => {
      calls++;
      return null;
    },
    receive: async () => {
      throw Error("unexpected");
    },
  });
  expect((await route(request("x".repeat(262145)))).status).toBe(413);
  expect(calls).toBe(0);
  expect((await route(request())).status).toBe(200);
  expect(calls).toBe(1);
});
