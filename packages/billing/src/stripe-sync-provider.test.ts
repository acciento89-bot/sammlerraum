import { createHash } from "node:crypto";
import Stripe from "stripe";
import { it, expect } from "vitest";
const secret = "whsec_owned_fixture";
const rawEvent = () => ({
  id: "evt_owned",
  type: "customer.subscription.updated",
  created: 100,
  livemode: false,
  data: {
    object: {
      id: "sub_owned",
      customer: "cus_owned",
      metadata: { subjectId: "forged-subject", email: "private@example.invalid" },
      status: "active",
    },
  },
});
async function fixture(options: { status?: string; customer?: string; price?: string } = {}) {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Response.json({
      id: "sub_owned",
      customer: options.customer ?? "cus_owned",
      status: options.status ?? "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: "si_owned",
            price: { id: options.price ?? "price_monthly_fixture" },
            quantity: 1,
            current_period_start: Math.floor(Date.now() / 1000) - 3600,
            current_period_end: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
        has_more: false,
      },
    });
  };
  const path = "./stripe-provider",
    m = await import(path);
  const provider = new m.StripeBillingProvider({
    apiKey: "fixture-not-a-real-key",
    webhookSecret: secret,
    appOrigin: "https://sammlerraum.example",
    monthlyPriceId: "price_monthly_fixture",
    yearlyPriceId: "price_yearly_fixture",
    fetch: transport,
  });
  return { provider, requests };
}
function signed(payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}
it("verifies actual SDK HMAC before extracting only bounded opaque event hints", async () => {
  const { provider, requests } = await fixture(),
    payload = JSON.stringify(rawEvent());
  expect(provider.verifyWebhook, "actual signature verifier").toBeTypeOf("function");
  const event = provider.verifyWebhook(Buffer.from(payload), signed(payload));
  expect(event).toMatchObject({
    eventId: "evt_owned",
    type: "customer.subscription.updated",
    customerId: "cus_owned",
    subscriptionId: "sub_owned",
    liveMode: false,
    digest: createHash("sha256").update(payload).digest("hex"),
  });
  expect(JSON.stringify(event)).not.toContain("forged-subject");
  expect(JSON.stringify(event)).not.toContain("private@example.invalid");
  expect(requests).toHaveLength(0);
});
it("rejects altered or stale signatures without any provider request", async () => {
  const { provider, requests } = await fixture(),
    payload = JSON.stringify(rawEvent());
  expect(() => provider.verifyWebhook(Buffer.from(payload + " "), signed(payload))).toThrow(
    "BILLING_INVALID_SIGNATURE",
  );
  expect(() =>
    provider.verifyWebhook(
      Buffer.from(payload),
      signed(payload, Math.floor(Date.now() / 1000) - 1000),
    ),
  ).toThrow("BILLING_INVALID_SIGNATURE");
  expect(requests).toHaveLength(0);
});
it("reads canonical canceled state and modern item periods, never event metadata or old active status", async () => {
  const { provider, requests } = await fixture({ status: "canceled" }),
    payload = JSON.stringify(rawEvent()),
    event = provider.verifyWebhook(Buffer.from(payload), signed(payload));
  const states = await provider.readEventState(event, "cus_owned", {
    signal: new AbortController().signal,
  });
  expect(states).toHaveLength(1);
  expect(states[0]).toMatchObject({
    subscriptionId: "sub_owned",
    customerId: "cus_owned",
    status: "CANCELED",
    planEligible: true,
  });
  expect(states[0].currentPeriodEnd).toBeInstanceOf(Date);
  expect(new URL(requests[0]!.url).pathname).toBe("/v1/subscriptions/sub_owned");
});
it("never treats an unmanaged active price as the Premium offer", async () => {
  const { provider } = await fixture({ price: "price_foreign" }),
    payload = JSON.stringify(rawEvent()),
    event = provider.verifyWebhook(Buffer.from(payload), signed(payload));
  expect(
    (
      await provider.readEventState(event, "cus_owned", { signal: new AbortController().signal })
    )[0],
  ).toMatchObject({ planEligible: false });
});
it("rejects a canonical foreign customer even if signed event hints name the local customer", async () => {
  const { provider } = await fixture({ customer: "cus_foreign" }),
    payload = JSON.stringify(rawEvent()),
    event = provider.verifyWebhook(Buffer.from(payload), signed(payload));
  await expect(
    provider.readEventState(event, "cus_owned", { signal: new AbortController().signal }),
  ).rejects.toMatchObject({ code: "BILLING_UNAVAILABLE" });
});
it("ignores unsupported signed events without storing arbitrary customer content", async () => {
  const { provider } = await fixture(),
    payload = JSON.stringify({ ...rawEvent(), type: "customer.updated" });
  expect(provider.verifyWebhook(Buffer.from(payload), signed(payload))).toBeNull();
});

async function riskFixture(type = "charge.refunded", fullRefund = true) {
  const requests: Request[] = [],
    now = Math.floor(Date.now() / 1000);
  const path = "./stripe-provider",
    m = await import(path);
  const provider = new m.StripeBillingProvider({
    apiKey: "fixture-not-a-real-key",
    webhookSecret: secret,
    appOrigin: "https://sammlerraum.example",
    monthlyPriceId: "price_monthly_fixture",
    yearlyPriceId: "price_yearly_fixture",
    fetch: async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const url = new URL(request.url),
        last = url.pathname.split("/").at(-1)!;
      if (url.pathname.includes("/disputes/"))
        return Response.json({ id: "dp_owned", charge: "ch_owned", status: "needs_response" });
      if (url.pathname.includes("/early_fraud_warnings/"))
        return Response.json({ id: "issfr_owned", charge: "ch_owned", actionable: true });
      if (url.pathname.includes("/charges/"))
        return Response.json({
          id: "ch_owned",
          customer: "cus_owned",
          amount: 1000,
          amount_refunded: fullRefund ? 1000 : 500,
          payment_intent: "pi_owned",
        });
      if (url.pathname.endsWith("/invoice_payments"))
        return Response.json({
          object: "list",
          data: [
            {
              id: url.searchParams.has("starting_after") ? "inpay_two" : "inpay_one",
              status: "paid",
              invoice: url.searchParams.has("starting_after") ? "in_two" : "in_one",
              payment: { type: "payment_intent", payment_intent: "pi_owned" },
            },
          ],
          has_more: !url.searchParams.has("starting_after"),
        });
      if (url.pathname.includes("/invoices/"))
        return Response.json({
          id: last,
          customer: "cus_owned",
          period_end: now - 2000,
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: last === "in_one" ? "sub_one" : "sub_two" },
          },
        });
      if (url.pathname.includes("/subscriptions/"))
        return Response.json({
          id: last,
          customer: "cus_owned",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              {
                id: "si_owned",
                price: { id: "price_monthly_fixture" },
                quantity: 1,
                current_period_start: now - 1000,
                current_period_end: now + 3600,
              },
            ],
            has_more: false,
          },
        });
      throw new Error("Unexpected synthetic graph request");
    },
  });
  const object =
    type === "charge.refunded"
      ? { id: "ch_owned", customer: "cus_owned", payment_intent: "pi_owned" }
      : type === "charge.dispute.created"
        ? { id: "dp_owned", charge: "ch_owned" }
        : { id: "issfr_owned", charge: "ch_owned" };
  const payload = JSON.stringify({ ...rawEvent(), type, data: { object } }),
    event = provider.verifyWebhook(Buffer.from(payload), signed(payload));
  return { provider, event, requests };
}
it("resolves every paid invoice page through the first-class PaymentIntent graph for full refunds", async () => {
  const f = await riskFixture(),
    states = await f.provider.readEventState(f.event, "cus_owned", {
      signal: new AbortController().signal,
    });
  expect(states.map((s: any) => s.subscriptionId).sort()).toEqual(["sub_one", "sub_two"]);
  expect(
    states.every((s: any) => s.risk?.reason === "REFUND" && s.risk.through instanceof Date),
  ).toBe(true);
  const pages = f.requests.filter((r) => new URL(r.url).pathname.endsWith("/invoice_payments"));
  expect(pages).toHaveLength(2);
  for (const page of pages) {
    const q = new URL(page.url).searchParams;
    expect(q.get("payment[type]")).toBe("payment_intent");
    expect(q.get("payment[payment_intent]")).toBe("pi_owned");
    expect(q.get("status")).toBe("paid");
  }
});
it("does not treat a partial refund as a full-period revocation", async () => {
  const f = await riskFixture("charge.refunded", false),
    states = await f.provider.readEventState(f.event, "cus_owned", {
      signal: new AbortController().signal,
    });
  expect(states).toHaveLength(2);
  expect(states.every((s: any) => s.risk === null)).toBe(true);
});
it.each(["charge.dispute.created", "radar.early_fraud_warning.created"])(
  "resolves %s through actual charge/customer/invoice bindings",
  async (type) => {
    const f = await riskFixture(type);
    expect(
      await f.provider.resolveCustomer(f.event, { signal: new AbortController().signal }),
    ).toBe("cus_owned");
    const states = await f.provider.readEventState(f.event, "cus_owned", {
      signal: new AbortController().signal,
    });
    expect(states).toHaveLength(2);
    expect(
      states.every(
        (s: any) =>
          s.risk?.reason === (type.startsWith("radar") ? "FRAUD" : "DISPUTE") &&
          s.risk.through === null,
      ),
    ).toBe(true);
  },
);

it("aborts an actual native-fetch response body after headers without leaking the transport error", async () => {
  const { createServer } = await import("node:http");
  let headers!: () => void, closed!: () => void;
  const received = new Promise<void>((r) => (headers = r)),
    finished = new Promise<void>((r) => (closed = r));
  const server = createServer((_request, response) => {
    response.on("close", closed);
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"id":"sub_owned",');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("owned test port missing");
    const path = "./stripe-provider",
      m = await import(path);
    const provider = new m.StripeBillingProvider({
      apiKey: "fixture-not-a-real-key",
      webhookSecret: secret,
      appOrigin: "https://sammlerraum.example",
      monthlyPriceId: "price_monthly_fixture",
      yearlyPriceId: "price_yearly_fixture",
      fetch: async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const response = await fetch(`http://127.0.0.1:${address.port}/owned-fixture`, init);
        headers();
        return response;
      },
    });
    const payload = JSON.stringify(rawEvent()),
      event = provider.verifyWebhook(Buffer.from(payload), signed(payload)),
      controller = new AbortController();
    const work = provider.readEventState(event, "cus_owned", { signal: controller.signal });
    await received;
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    await expect(work).rejects.toMatchObject({
      code: "BILLING_UNAVAILABLE",
      message: "BILLING_UNAVAILABLE",
    });
    await finished;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it("an unpaid canonical Checkout cannot fulfill even if its signed hint says an active subscription", async () => {
  const path = "./stripe-provider",
    m = await import(path),
    now = Math.floor(Date.now() / 1000);
  const provider = new m.StripeBillingProvider({
    apiKey: "fixture-not-a-real-key",
    webhookSecret: secret,
    appOrigin: "https://sammlerraum.example",
    monthlyPriceId: "price_monthly_fixture",
    yearlyPriceId: "price_yearly_fixture",
    fetch: async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname.includes("/checkout/sessions/"))
        return Response.json({
          id: "cs_owned",
          customer: "cus_owned",
          mode: "subscription",
          subscription: "sub_owned",
          payment_status: "unpaid",
        });
      return Response.json({
        id: "sub_owned",
        customer: "cus_owned",
        status: "active",
        cancel_at_period_end: false,
        items: {
          data: [
            {
              id: "si_owned",
              price: { id: "price_monthly_fixture" },
              quantity: 1,
              current_period_start: now - 1000,
              current_period_end: now + 1000,
            },
          ],
          has_more: false,
        },
      });
    },
  });
  const payload = JSON.stringify({
    ...rawEvent(),
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_owned",
        customer: "cus_owned",
        mode: "subscription",
        subscription: "sub_owned",
      },
    },
  });
  const event = provider.verifyWebhook(Buffer.from(payload), signed(payload));
  expect(
    await provider.readEventState(event, "cus_owned", { signal: new AbortController().signal }),
  ).toEqual([]);
});
