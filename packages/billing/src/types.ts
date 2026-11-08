export type BillingLocale = "de" | "en";
export type BillingCadence = "MONTHLY" | "YEARLY";
export type CheckoutInput = {
  subjectId: string;
  customerId: string;
  cadence: BillingCadence;
  locale: BillingLocale;
  requestKey: string;
  expiresAt: Date;
};
export type BillingSession = { id: string; url: string };
export interface BillingProvider {
  readonly id: string;
  createCustomer(input: { subjectId: string; requestKey: string }): Promise<string>;
  createCheckout(input: CheckoutInput): Promise<BillingSession & { expiresAt: Date }>;
  createPortalSession(input: {
    customerId: string;
    locale: BillingLocale;
    requestKey: string;
  }): Promise<BillingSession>;
}

import type {
  VerifiedBillingEvent,
  BillingSubscriptionSnapshot,
} from "@sammlerraum/contracts/billing";
export type {
  VerifiedBillingEvent,
  BillingSubscriptionSnapshot,
} from "@sammlerraum/contracts/billing";
export interface BillingSyncProvider {
  readonly id: string;
  resolveCustomer(
    event: VerifiedBillingEvent,
    options: { signal: AbortSignal },
  ): Promise<string | null>;
  readEventState(
    event: VerifiedBillingEvent,
    customerId: string,
    options: { signal: AbortSignal },
  ): Promise<BillingSubscriptionSnapshot[]>;
}
