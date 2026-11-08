# Official documentation checked2026-11-08

- https://github.com/stripe/stripe-node/releases/tag/v23.1.0 — official latest stable release,29October; prerelease23.2 excluded. Recheck when actually pinning the adapter.
- https://docs.stripe.com/api/checkout/sessions/create — current API example2026-10-28.endive; subscription mode, configured Price IDs, integration_identifier supported. SDK types must verify actual parameter shapes. Do not copy payment_method_types from examples; use dynamic methods.
- https://docs.stripe.com/billing/subscriptions/webhooks — handle subscription/invoice lifecycle and refund/dispute/fraud events. Modern risk resolution follows PaymentIntent→paid InvoicePayments (paginate)→Invoice.parent.subscription_details.subscription, then locally owned mapping; not metadata authorization.
- https://docs.stripe.com/webhooks — signature verification, duplicate/out-of-order delivery, asynchronous durable handling and retry semantics. Webhook signature replaces cookie/CSRF auth for this one machine endpoint; checkout/portal retain normal origin/session checks.

Flat-rate Premium plan, not usage invoicing; no Metronome provisioning. Provider-reported usage is quota/operation measurement. No actual SDK calls, payments, account resources, webhook registrations or keys were used. Tax collection must not be advertised as active or enabled before concrete operator configuration/registration; read the tax reference before configuring automatic_tax. This is preparation, not an implementation or launch claim.
