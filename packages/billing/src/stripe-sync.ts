import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  BillingError,
  VerifiedBillingEventSchema,
  BillingSubscriptionSnapshotSchema,
  type VerifiedBillingEvent,
  type BillingSubscriptionSnapshot,
} from "@sammlerraum/contracts/billing";
const supported = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "charge.refunded",
  "charge.dispute.created",
  "radar.early_fraud_warning.created",
]);
function id(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,255}$/u.test(value)
    ? value
    : value && typeof value === "object" && "id" in value
      ? id(value.id)
      : null;
}
export function verifyStripeWebhook(
  client: Stripe,
  secret: string | undefined,
  raw: Buffer,
  signature: string,
): VerifiedBillingEvent | null {
  if (!secret) throw new BillingError("BILLING_UNAVAILABLE");
  let event: Stripe.Event;
  try {
    if (raw.length > 262144 || signature.length > 4096) throw Error();
    event = client.webhooks.constructEvent(raw, signature, secret, 300);
  } catch {
    throw new BillingError("BILLING_INVALID_SIGNATURE");
  }
  if (!supported.has(event.type) && !event.type.startsWith("customer.subscription.")) return null;
  const object = event.data.object as unknown as Record<string, unknown>,
    type = event.type;
  const customerId = id(object.customer),
    objectId = id(object.id);
  const parsed = VerifiedBillingEventSchema.safeParse({
    eventId: event.id,
    type,
    created: event.created,
    liveMode: event.livemode,
    customerId,
    objectId,
    subscriptionId: type.startsWith("customer.subscription.")
      ? objectId
      : type.startsWith("checkout.session.")
        ? id(object.subscription)
        : null,
    invoiceId: type.startsWith("invoice.") ? objectId : null,
    chargeId:
      type === "charge.refunded"
        ? objectId
        : type === "charge.dispute.created" || type.startsWith("radar.")
          ? id(object.charge)
          : null,
    paymentIntentId: id(object.payment_intent),
    digest: createHash("sha256").update(raw).digest("hex"),
  });
  if (!parsed.success) throw new BillingError("BILLING_INVALID_REQUEST");
  return parsed.data;
}
export async function readStripeSubscription(
  client: Stripe,
  subscriptionId: string,
  customerId: string,
  priceIds: readonly string[],
): Promise<BillingSubscriptionSnapshot> {
  const sub = await client.subscriptions.retrieve(subscriptionId),
    items = sub.items.data;
  if (id(sub.customer) !== customerId || sub.items.has_more || items.length !== 1)
    throw new BillingError("BILLING_UNAVAILABLE");
  const item = items[0]!;
  return BillingSubscriptionSnapshotSchema.parse({
    subscriptionId: sub.id,
    customerId,
    status: sub.status.toUpperCase(),
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    planEligible: priceIds.includes(item.price.id) && item.quantity === 1,
    risk: null,
  });
}
/** Detect a still-open subscription before a new purchase, even if its webhook is delayed. */
export async function assertNoExistingStripeSubscription(client: Stripe, customerId: string) {
  let after: string | undefined;
  for (let page = 0; page < 3; page++) {
    const result = await client.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      ...(after ? { starting_after: after } : {}),
    });
    if (
      result.data.some(
        (subscription) => !["canceled", "incomplete_expired"].includes(subscription.status),
      )
    )
      throw new BillingError("BILLING_CONFLICT");
    if (!result.has_more) return;
    const last = result.data.at(-1)?.id;
    if (!last || last === after) throw new BillingError("BILLING_UNAVAILABLE");
    after = last;
  }
  throw new BillingError("BILLING_UNAVAILABLE");
}
/** Invoice.period_end is an association timestamp, not the purchased service period. */
async function refundedServicePeriodEnd(
  client: Stripe,
  invoiceId: string,
  subscriptionId: string,
  priceIds: readonly string[],
  signal: AbortSignal,
): Promise<Date> {
  let after: string | undefined,
    through = 0;
  const seen = new Set<string>();
  for (let page = 0; page < 10; page++) {
    signal.throwIfAborted();
    const lines = await client.invoices.listLineItems(invoiceId, {
      limit: 100,
      ...(after ? { starting_after: after } : {}),
    });
    for (const line of lines.data) {
      if (!id(line.id) || seen.has(line.id) || id(line.invoice) !== invoiceId)
        throw new BillingError("BILLING_UNAVAILABLE");
      seen.add(line.id);
      const subscription =
        line.parent?.type === "subscription_item_details"
          ? id(line.parent.subscription_item_details?.subscription)
          : null;
      const price =
        line.pricing?.type === "price_details" ? id(line.pricing.price_details?.price) : null;
      if (subscription !== subscriptionId || !price || !priceIds.includes(price)) continue;
      if (
        !Number.isSafeInteger(line.period.start) ||
        !Number.isSafeInteger(line.period.end) ||
        line.period.start < 0 ||
        line.period.end <= line.period.start ||
        !Number.isSafeInteger(line.amount) ||
        line.amount < 0
      )
        throw new BillingError("BILLING_UNAVAILABLE");
      through = Math.max(through, line.period.end);
    }
    if (!lines.has_more) {
      const result = new Date(through * 1000);
      if (!through || !Number.isFinite(result.getTime()))
        throw new BillingError("BILLING_UNAVAILABLE");
      return result;
    }
    const last = lines.data.at(-1)?.id;
    if (!last || last === after) throw new BillingError("BILLING_UNAVAILABLE");
    after = last;
  }
  throw new BillingError("BILLING_UNAVAILABLE");
}
export async function readStripeEventState(
  client: Stripe,
  event: VerifiedBillingEvent,
  customerId: string,
  priceIds: readonly string[],
  signal: AbortSignal,
): Promise<BillingSubscriptionSnapshot[]> {
  signal.throwIfAborted();
  if (
    event.chargeId &&
    (event.type === "charge.refunded" ||
      event.type === "charge.dispute.created" ||
      event.type === "radar.early_fraud_warning.created")
  ) {
    let chargeId = event.chargeId,
      reason: "REFUND" | "DISPUTE" | "FRAUD" | null = null;
    if (event.type === "charge.dispute.created") {
      if (!event.objectId) throw new BillingError("BILLING_UNAVAILABLE");
      const dispute = await client.disputes.retrieve(event.objectId);
      if (id(dispute.charge) !== chargeId) throw new BillingError("BILLING_UNAVAILABLE");
      if (!["won", "warning_closed"].includes(dispute.status)) reason = "DISPUTE";
    } else if (event.type.startsWith("radar.")) {
      if (!event.objectId) throw new BillingError("BILLING_UNAVAILABLE");
      const warning = await client.radar.earlyFraudWarnings.retrieve(event.objectId);
      if (id(warning.charge) !== chargeId) throw new BillingError("BILLING_UNAVAILABLE");
      if (warning.actionable === true) reason = "FRAUD";
    }
    signal.throwIfAborted();
    const charge = await client.charges.retrieve(chargeId);
    if (id(charge.customer) !== customerId) throw new BillingError("BILLING_UNAVAILABLE");
    if (event.type === "charge.refunded") {
      if (
        !Number.isSafeInteger(charge.amount) ||
        !Number.isSafeInteger(charge.amount_refunded) ||
        charge.amount < 0 ||
        charge.amount_refunded < 0
      )
        throw new BillingError("BILLING_UNAVAILABLE");
      if (charge.amount > 0 && charge.amount_refunded >= charge.amount) reason = "REFUND";
    }
    const paymentIntent = id(charge.payment_intent);
    if (!paymentIntent) throw new BillingError("BILLING_UNAVAILABLE");
    const invoices = new Set<string>(),
      seen = new Set<string>();
    let after: string | undefined;
    for (let page = 0; ; page++) {
      signal.throwIfAborted();
      if (page >= 10) throw new BillingError("BILLING_UNAVAILABLE");
      const result = await client.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: paymentIntent },
        status: "paid",
        limit: 100,
        ...(after ? { starting_after: after } : {}),
      });
      for (const payment of result.data) {
        if (
          seen.has(payment.id) ||
          payment.status !== "paid" ||
          payment.payment.type !== "payment_intent" ||
          id(payment.payment.payment_intent) !== paymentIntent
        )
          throw new BillingError("BILLING_UNAVAILABLE");
        seen.add(payment.id);
        const invoiceId = id(payment.invoice);
        if (!invoiceId) throw new BillingError("BILLING_UNAVAILABLE");
        invoices.add(invoiceId);
        if (invoices.size > 100) throw new BillingError("BILLING_UNAVAILABLE");
      }
      if (!result.has_more) break;
      const last = result.data.at(-1)?.id;
      if (!last || last === after) throw new BillingError("BILLING_UNAVAILABLE");
      after = last;
    }
    const states = new Map<string, BillingSubscriptionSnapshot>();
    for (const invoiceId of invoices) {
      signal.throwIfAborted();
      const invoice = await client.invoices.retrieve(invoiceId);
      if (id(invoice.customer) !== customerId) throw new BillingError("BILLING_UNAVAILABLE");
      const subscriptionId =
        invoice.parent?.type === "subscription_details"
          ? id(invoice.parent.subscription_details?.subscription)
          : null;
      if (!subscriptionId) continue;
      const state = await readStripeSubscription(client, subscriptionId, customerId, priceIds);
      if (reason) {
        state.risk = {
          reason,
          through:
            reason === "REFUND"
              ? await refundedServicePeriodEnd(client, invoiceId, subscriptionId, priceIds, signal)
              : null,
        };
        const prior = states.get(subscriptionId)?.risk;
        if (
          prior?.reason === "REFUND" &&
          prior.through &&
          state.risk.through &&
          prior.through > state.risk.through
        )
          state.risk.through = prior.through;
      }
      states.set(subscriptionId, state);
    }
    signal.throwIfAborted();
    return [...states.values()];
  }
  let subscriptionId = event.subscriptionId;
  if (event.type.startsWith("checkout.session.")) {
    if (!event.objectId) throw new BillingError("BILLING_UNAVAILABLE");
    const session = await client.checkout.sessions.retrieve(event.objectId);
    if (id(session.customer) !== customerId) throw new BillingError("BILLING_UNAVAILABLE");
    if (
      session.mode !== "subscription" ||
      !["paid", "no_payment_required"].includes(session.payment_status)
    )
      return [];
    subscriptionId = id(session.subscription);
  }
  if (!subscriptionId && event.invoiceId) {
    const invoice = await client.invoices.retrieve(event.invoiceId);
    if (id(invoice.customer) !== customerId) throw new BillingError("BILLING_UNAVAILABLE");
    subscriptionId =
      invoice.parent?.type === "subscription_details"
        ? id(invoice.parent.subscription_details?.subscription)
        : null;
    if (!subscriptionId) return [];
  }
  if (!subscriptionId) throw new BillingError("BILLING_UNAVAILABLE");
  signal.throwIfAborted();
  const state = await readStripeSubscription(client, subscriptionId, customerId, priceIds);
  signal.throwIfAborted();
  return [state];
}
export async function resolveStripeCustomer(
  client: Stripe,
  event: VerifiedBillingEvent,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (event.customerId) return event.customerId;
  if (event.chargeId) {
    const charge = await client.charges.retrieve(event.chargeId);
    signal.throwIfAborted();
    return id(charge.customer);
  }
  return null;
}
