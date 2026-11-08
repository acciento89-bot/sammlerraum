# Premium billing operations

Status: source implementation in progress. Payments are disabled by default. No live credentials,
provider accounts, purchases or webhook registrations are created by the local checks.
Domain-wide feature enforcement and the localized pricing/account UI are separate remaining gates.

## Configuration and isolation

- `BILLING_ENABLED=false` disables payment I/O and the billing worker. Feature quotas remain a
  separate policy and must never be bypassed by this switch.
- `BILLING_ENVIRONMENT` is `test` or `live`. Without an explicit value, production selects live;
  development/test selects test. An enabled payment key must match the selected environment.
- Keys are interpreted by their anchored `rk_test_`/`sk_test_` or `rk_live_`/`sk_live_` prefix.
  An embedded suffix does not change the environment.
- Actual Stripe bindings are namespaced as `stripe_test` and `stripe_live`. Entitlement reads
  require an explicit allowed provider context, independent of payment I/O activation. A test
  subscription cannot grant live access, and test customer/session IDs are not reused for live API calls.
- Keep separate Stripe sandboxes and deployment databases for development and CI as well.
  Do not guess the environment of an older unclassified binding or reassign customer ownership.
- `BILLING_PLAN_LIMITS` is a complete validated JSON object with `FREE` and `PREMIUM` tiers.
  Quotas: `ITEM_CREATE`, `MEDIA_COUNT`, `MEDIA_BYTES`, `AI_MONTHLY`, `IMPORT_PROFILES`.
  Features: `MARKET_DATA`, `EXTENDED_HISTORY`, `ADVANCED_ANALYTICS`, `XLSX`, `ADVANCED_FILTERS`.
  Zero means no new admissions; null explicitly means unlimited. Premium cannot narrow Free.
  No production quota values or price amounts are guessed by source code.
- Enabled payments require `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and distinct monthly/yearly
  Price IDs. Prefer a restricted server key. No key or session URL belongs in client configuration or logs.
- Do not change prices/origin while a Checkout is pending. Provider idempotency conflicts fail
  closed; the application never changes an operation key to work around a possible completed payment.

## Hosted sessions

Authenticated same-origin routes accept only locale, cadence (Checkout) and request UUID.
Customer IDs, Price IDs and return URLs cannot be supplied by clients. Customers are created with
an owner-bound durable idempotency key; the non-null local customer binding cannot be reassigned.
No profile name, inventory data or private notes are sent to customer creation.

Only one unexpired Checkout is admitted per owner/provider context. A canonical provider subscription
check also prevents a second purchase if a prior webhook is delayed. Retries retain the original
operation key and request parameters. A READY receipt is private to a fresh own session.
Pending Checkout initiation stops before its expiry window becomes invalid; abandoning/failing
one can temporarily require waiting rather than opening another potential charge session.

Checkout/Portal use hosted official HTTPS origins and server-derived return paths. Return query
strings, Checkout responses and arbitrary metadata never grant Premium.

## Webhook ingestion and synchronization

Endpoint: `/api/v1/billing/webhook` under the configured application origin.
It is the one machine endpoint without cookie/origin authentication. The official SDK verifies the
raw HMAC signature and its timestamp before event extraction. Ingress is capped at 256 KiB.

Supported events include subscription lifecycle events, `invoice.paid`, `invoice.payment_failed`,
Checkout completion/async success, full/partial refund notifications, dispute creation and early fraud warnings.
Unsupported valid events are ignored. Test/live crossover is rejected.

- A new valid event is acknowledged with 202 only after its durable receipt exists.
- Duplicate event IDs must retain the exact signed payload digest. A conflicting body is not reapplied.
- Unsupported events return 200/IGNORED; ingress/config/persistence failures do not falsely acknowledge success.
- Receipt payloads contain only bounded opaque references, type/time/mode and a digest. Raw provider
  bodies, private metadata, addresses and provider error messages are not stored in the queue or receipt.
- The queue contains only a receipt UUID. Periodic durable discovery recovers missed wakeups and expired claims.
- A provider outage leaves a PENDING receipt, with durable backoff from 30 seconds up to one hour.
  This is pending synchronization, not a successful application or an automatic free grant.
- Each account has a fenced claim; receipt/account leases use the database UTC clock. Provider reads
  run outside transactions. A stale worker cannot apply after another worker has reconciled the account.
- Actual provider work has a 60-second outer cancellation budget, bounded request counts and SDK
  timeouts. Abort reaches native fetch response bodies; worker shutdown forwards cancellation.
- Event creation timestamps are audit information, not ordering authority. Reordered events read
  current canonical provider state under the account fence.

Canonical subscription customer, approved offer, status and current item periods determine local
eligibility. An unpaid canonical Checkout does not fulfill a subscription. Only locally owned customer
bindings are accepted; webhook metadata cannot create/reassign an account. Unknown active offers
have no Premium eligibility. Normal feature checks use the local database, not a provider request.

## Refunds and risk

Resolve refunds/disputes/fraud through the actual Charge/PaymentIntent, all paid InvoicePayment pages,
Invoice parent subscription relation, and matching customer/subscription. Never use arbitrary metadata
as the ownership or invoice relationship. A bounded traversal failure retries the whole receipt;
partial results are not committed as a complete reconciliation.

A partial refund does not become a full-period revocation. A full refunded period does not revoke a
newer fully paid period. Dispute/fraud holds remain across ordinary delayed active updates and need
operator review; they are not cleared by a client request or a generic subscription update.
Risk clearance is not self-service: verify the provider case and arrange an explicitly authorized,
audited correction. No blanket SQL reset or fabricated paid status is provided.

## Support and privacy

Inspect PENDING receipt age, bounded last-error code and lease state when a customer reports delayed
activation. Use UTC when comparing timestamp-without-zone database columns. Do not copy raw provider
objects/session URLs into public support messages. Replay/reconcile current provider state rather than
editing a subscription to ACTIVE manually.

Mapped receipts, accounts and local subscriptions cascade on actual account erasure. The full account
removal flow must also settle/cancel any paid renewal before dropping its binding; that integration is a
release gate, not a claim that deleting a local row cancels an external subscription. No customer data
is deleted by ordinary plan downgrade. Free core/read access remains available according to product policy.
