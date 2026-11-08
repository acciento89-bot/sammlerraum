import { createHash } from "node:crypto";
// Loaded only by the owned browser-test runner, never by application/deploy code.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.RUN_BILLING_E2E !== "1" ||
  process.env.BILLING_ENVIRONMENT !== "test" ||
  process.env.STRIPE_SECRET_KEY !== "sk_test_sammlerraum_offline_fixture" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  !database.pathname.endsWith("_test")
)
  throw Error("Refusing unguarded offline billing fixture");
const original = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "api.stripe.com") return original(input, init);
  // Every Stripe-host request is intercepted or rejected; none can reach Stripe.
  const request = new Request(input, init),
    path = url.pathname;
  const response = (value) =>
    Response.json(value, { headers: { "request-id": "req_offline_fixture" } });
  if (
    request.method === "GET" &&
    ["/v1/prices/price_monthly_fixture", "/v1/prices/price_yearly_fixture"].includes(path)
  ) {
    const yearly = path.endsWith("price_yearly_fixture"),
      amount = yearly ? 29000 : 2900;
    return response({
      id: yearly ? "price_yearly_fixture" : "price_monthly_fixture",
      object: "price",
      active: true,
      livemode: false,
      billing_scheme: "per_unit",
      currency: "eur",
      custom_unit_amount: null,
      tiers_mode: null,
      transform_quantity: null,
      type: "recurring",
      unit_amount: amount,
      unit_amount_decimal: String(amount),
      product: "prod_offline_fixture",
      recurring: { interval: yearly ? "year" : "month", interval_count: 1, usage_type: "licensed" },
      tax_behavior: "inclusive",
    });
  }
  if (request.method === "GET" && path === "/v1/subscriptions")
    return response({ object: "list", data: [], has_more: false });
  const form = new URLSearchParams(await request.text()),
    idempotency = request.headers.get("idempotency-key") ?? "";
  const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 32);
  if (request.method === "POST" && path === "/v1/customers") {
    const subject = form.get("metadata[subjectId]");
    if (!subject || !idempotency) throw Error("Invalid offline customer request");
    return response({ id: "cus_" + hash(subject), object: "customer" });
  }
  if (request.method === "POST" && path === "/v1/checkout/sessions") {
    const price = form.get("line_items[0][price]"),
      expires = Number(form.get("expires_at"));
    if (
      form.get("mode") !== "subscription" ||
      !["price_monthly_fixture", "price_yearly_fixture"].includes(price) ||
      !form.get("customer")?.startsWith("cus_") ||
      !Number.isSafeInteger(expires) ||
      !idempotency
    )
      throw Error("Invalid offline checkout request");
    return response({
      id: "cs_" + hash(idempotency),
      object: "checkout.session",
      url: "https://checkout.stripe.com/c/pay/offline_" + hash(idempotency),
      expires_at: expires,
    });
  }
  if (request.method === "POST" && path === "/v1/billing_portal/sessions") {
    if (!form.get("customer")?.startsWith("cus_") || !idempotency)
      throw Error("Invalid offline portal request");
    return response({
      id: "bps_" + hash(idempotency),
      customer: form.get("customer"),
      url: "https://billing.stripe.com/p/session/offline_" + hash(idempotency),
    });
  }
  throw Error("Unexpected offline Stripe request");
};
