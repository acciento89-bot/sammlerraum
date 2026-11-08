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
  readonly id = "stripe";
  private client: Stripe;
  private origin: string;
  constructor(
    private config: {
      apiKey: string;
      appOrigin: string;
      monthlyPriceId: string;
      yearlyPriceId: string;
      fetch?: typeof fetch;
    },
  ) {
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
      httpClient: Stripe.createFetchHttpClient(config.fetch),
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
}
