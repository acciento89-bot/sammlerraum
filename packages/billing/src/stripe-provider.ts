import { BillingOfferSchema, type BillingOffer } from "@sammlerraum/contracts/billing-ui";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  verifyStripeWebhook,
  readStripeEventState,
  resolveStripeCustomer,
  assertNoExistingStripeSubscription,
} from "./stripe-sync";
import type { VerifiedBillingEvent } from "@sammlerraum/contracts/billing";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { BillingError } from "@sammlerraum/contracts/billing";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import type { BillingProvider, CheckoutInput, BillingLocale } from "./types";
const key = z.string().uuid(),
  customer = z.string().regex(/^cus_[A-Za-z0-9_-]{1,240}$/u),
  locale = z.enum(["de", "en"]);
const checkout = z.strictObject({
  subjectId: MembershipActorIdSchema,
  customerId: customer,
  cadence: z.enum(["MONTHLY", "YEARLY"]),
  locale,
  requestKey: key,
  expiresAt: z.date(),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const p = schema.safeParse(input);
  if (!p.success) throw new BillingError("BILLING_INVALID_REQUEST");
  return p.data;
}
function safeUrl(value: unknown, host: string): string {
  try {
    const url = new URL(z.string().min(1).max(4096).parse(value));
    if (
      url.protocol !== "https:" ||
      url.hostname !== host ||
      url.port ||
      url.username ||
      url.password
    )
      throw Error();
    return url.href;
  } catch {
    throw new BillingError("BILLING_UNAVAILABLE");
  }
}
/** Official instance SDK, pinned public endpoint, bounded timeout and zero hidden retries. */
export class StripeBillingProvider implements BillingProvider {
  readonly id: string;
  private client: Stripe;
  private requestContext = new AsyncLocalStorage<{ signal: AbortSignal; calls: number }>();
  private origin: string;
  constructor(
    private config: {
      apiKey: string;
      webhookSecret?: string;
      appOrigin: string;
      monthlyPriceId: string;
      yearlyPriceId: string;
      portalConfigurationId?: string;
      fetch?: typeof fetch;
    },
  ) {
    this.id = /^(?:rk|sk)_live_/u.test(config.apiKey) ? "stripe_live" : "stripe_test";
    try {
      const origin = new URL(config.appOrigin);
      if (
        !["https:", "http:"].includes(origin.protocol) ||
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        !/^price_[A-Za-z0-9_]+$/u.test(config.monthlyPriceId) ||
        !/^price_[A-Za-z0-9_]+$/u.test(config.yearlyPriceId) ||
        config.monthlyPriceId === config.yearlyPriceId ||
        !config.apiKey
      )
        throw Error();
      this.origin = origin.origin;
    } catch {
      throw new BillingError("BILLING_UNAVAILABLE");
    }
    this.client = new Stripe(config.apiKey, {
      apiVersion: "2026-10-28.endive",
      host: "api.stripe.com",
      protocol: "https",
      maxNetworkRetries: 0,
      timeout: 15000,
      httpClient: Stripe.createFetchHttpClient(async (input, init) => {
        const context = this.requestContext.getStore();
        if (!context) return (config.fetch ?? globalThis.fetch)(input, init);
        context.signal.throwIfAborted();
        if (++context.calls > 32) throw new BillingError("BILLING_UNAVAILABLE");
        const signals = [context.signal];
        if (init?.signal) signals.push(init.signal);
        return (config.fetch ?? globalThis.fetch)(input, {
          ...init,
          signal: AbortSignal.any(signals),
        });
      }),
    });
  }
  private async invoke<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof BillingError) throw error;
      throw new BillingError("BILLING_UNAVAILABLE");
    }
  }
  /** Whitelisted fixed recurring offers; never return product/customer metadata. */
  async getPublicPrices(options: { signal?: AbortSignal } = {}): Promise<BillingOffer[]> {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000);
    return this.invoke(() =>
      this.requestContext.run({ signal, calls: 0 }, async () => {
        signal.throwIfAborted();
        const result: BillingOffer[] = [];
        for (const cadence of ["MONTHLY", "YEARLY"] as const) {
          const id = cadence === "MONTHLY" ? this.config.monthlyPriceId : this.config.yearlyPriceId;
          const price = await this.client.prices.retrieve(id);
          signal.throwIfAborted();
          const amount = price.unit_amount,
            currency = price.currency?.toUpperCase();
          const decimal = price.unit_amount_decimal?.toString();
          if (
            price.id !== id ||
            !price.active ||
            price.livemode !== (this.id === "stripe_live") ||
            price.type !== "recurring" ||
            price.billing_scheme !== "per_unit" ||
            price.custom_unit_amount ||
            price.tiers_mode ||
            price.transform_quantity ||
            !Number.isSafeInteger(amount) ||
            amount === null ||
            amount < 0 ||
            typeof decimal !== "string" ||
            !/^\d+(?:\.0{1,12})?$/u.test(decimal) ||
            BigInt(decimal.split(".")[0]!) !== BigInt(amount) ||
            !currency ||
            !Intl.supportedValuesOf("currency").includes(currency) ||
            price.recurring?.interval !== (cadence === "MONTHLY" ? "month" : "year") ||
            price.recurring.interval_count !== 1 ||
            price.recurring.usage_type !== "licensed"
          )
            throw new BillingError("BILLING_UNAVAILABLE");
          // Stripe charge representation differs from ISO payout/display units for ISK/UGX.
          // https://docs.stripe.com/currencies#special-cases ; unsupported ambiguous scales fail closed.
          const legacy = currency === "ISK" || currency === "UGX";
          const scale = legacy
            ? 2
            : new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
                .maximumFractionDigits!;
          if (currency === "MGA" || ![0, 2].includes(scale) || (legacy && amount % 100 !== 0))
            throw new BillingError("BILLING_UNAVAILABLE");
          result.push(
            BillingOfferSchema.parse({
              cadence,
              amountMinor: String(amount),
              currency,
              minorUnitExponent: scale,
              taxBehavior: price.tax_behavior ?? "unspecified",
            }),
          );
        }
        return result;
      }),
    );
  }
  async createCustomer(input: { subjectId: string; requestKey: string }) {
    const data = parse(
      z.strictObject({ subjectId: MembershipActorIdSchema, requestKey: key }),
      input,
    );
    return this.invoke(async () =>
      customer.parse(
        (
          await this.client.customers.create(
            { metadata: { subjectId: data.subjectId } },
            { idempotencyKey: "sammlerraum:customer:" + data.requestKey },
          )
        ).id,
      ),
    );
  }
  async createCheckout(input: CheckoutInput) {
    const data = parse(checkout, input);
    return this.invoke(async () => {
      await assertNoExistingStripeSubscription(this.client, data.customerId);
      const suffix = [...createHash("sha256").update(data.requestKey).digest().subarray(0, 8)]
        .map((byte) => String.fromCharCode(97 + (byte % 26)))
        .join("");
      const session = await this.client.checkout.sessions.create(
        {
          mode: "subscription",
          customer: data.customerId,
          line_items: [
            {
              price:
                data.cadence === "MONTHLY" ? this.config.monthlyPriceId : this.config.yearlyPriceId,
              quantity: 1,
            },
          ],
          client_reference_id: data.subjectId,
          metadata: { subjectId: data.subjectId },
          subscription_data: { metadata: { subjectId: data.subjectId } },
          locale: data.locale,
          success_url: `${this.origin}/${data.locale}/account/billing?checkout=success`,
          cancel_url: `${this.origin}/${data.locale}/account/billing?checkout=cancelled`,
          expires_at: Math.floor(data.expiresAt.getTime() / 1000),
          integration_identifier: "sammlerraum_" + suffix,
        },
        { idempotencyKey: "sammlerraum:checkout:" + data.requestKey },
      );
      const id = z
          .string()
          .regex(/^cs_[A-Za-z0-9_-]{1,240}$/u)
          .parse(session.id),
        expires = z.number().int().positive().parse(session.expires_at);
      if (expires * 1000 <= Date.now()) throw new BillingError("BILLING_UNAVAILABLE");
      return {
        id,
        url: safeUrl(session.url, "checkout.stripe.com"),
        expiresAt: new Date(expires * 1000),
      };
    });
  }
  async createPortalSession(input: {
    customerId: string;
    locale: BillingLocale;
    requestKey: string;
  }) {
    const data = parse(z.strictObject({ customerId: customer, locale, requestKey: key }), input);
    return this.invoke(async () => {
      const session = await this.client.billingPortal.sessions.create(
        {
          customer: data.customerId,
          locale: data.locale,
          ...(this.config.portalConfigurationId
            ? { configuration: this.config.portalConfigurationId }
            : {}),
          return_url: `${this.origin}/${data.locale}/account/billing`,
        },
        { idempotencyKey: "sammlerraum:portal:" + data.requestKey },
      );
      if (session.customer !== data.customerId) throw new BillingError("BILLING_UNAVAILABLE");
      return {
        id: z
          .string()
          .regex(/^bps_[A-Za-z0-9_-]{1,240}$/u)
          .parse(session.id),
        url: safeUrl(session.url, "billing.stripe.com"),
      };
    });
  }
  verifyWebhook(raw: Buffer, signature: string) {
    return verifyStripeWebhook(this.client, this.config.webhookSecret, raw, signature);
  }
  async readEventState(
    event: VerifiedBillingEvent,
    customerId: string,
    options: { signal: AbortSignal },
  ) {
    return this.invoke(() =>
      this.requestContext.run({ signal: options.signal, calls: 0 }, () =>
        readStripeEventState(
          this.client,
          event,
          customerId,
          [this.config.monthlyPriceId, this.config.yearlyPriceId],
          options.signal,
        ),
      ),
    );
  }
  async resolveCustomer(event: VerifiedBillingEvent, options: { signal: AbortSignal }) {
    return this.invoke(() =>
      this.requestContext.run({ signal: options.signal, calls: 0 }, () =>
        resolveStripeCustomer(this.client, event, options.signal),
      ),
    );
  }
}
