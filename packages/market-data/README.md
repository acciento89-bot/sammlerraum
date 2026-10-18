# Global market provider boundary

This package contains provider types, an explicit server-side registry, and the Scrydex and PriceCharting production adapter factories. The registry constructor defaults to empty. The factories perform bounded HTTP only when explicitly enabled and supplied with a request permit and Money capabilities; constructing a registry or factory grants no license, activation or display entitlement.

A request binds one canonical catalog entry, optional exact variant and exact provider identifier at a specific revision. Its UUID `pollId` must be created before enqueueing and persisted in job data. Providers return only source facts: one of seven separate observation kinds, exact bigint minor units, currency, named source metric, authored qualifiers and explicit timestamp provenance. There are no personal-item fields, grading conversions, foreign exchange or blended estimates.

`EVENT` uses a documented stable upstream event ID scoped to its source product; `POLL` uses the persisted request poll ID. Recurring guide product IDs are not sale event IDs. Source `DAY` and `SECOND` precision remains explicit. Current guides without source timestamps use `FETCH`; this is retrieval time, never an invented sale date. Missing prices produce no observation. Zero is a value.

The domain market service validates and snapshots all input before database work, applies pinned ISO scale metadata, revalidates exact active catalog mappings under entry-before-variant locks and appends immutable observations. Equal retries return original IDs/timestamps; changed same-key content aborts the entire batch. Returned IDs are sorted by canonical identity; identical duplicates within a batch count once. Empty batches still validate and lock the current target.

`recordObservationsInTransaction` participates in the caller's transaction and never commits it; errors must abort the caller. The worker inserts its committed-sync receipt in that same transaction, including empty successes, and checks that receipt before catalog checks or HTTP. The worker owns receipt storage, scheduling, queue retries and lifecycle orchestration; adapters honor the supplied cancellation signal. Neither layer guarantees exactly-once HTTP. A caller-owned transaction must use ReadCommitted and preserve the documented parent-lock order. UTC is set locally for accurate PostgreSQL adapter timestamp decoding.

History reads require an explicit registered provider and are bounded. The owner comparison API independently enforces provider display entitlement through an empty-by-default policy; ingestion activation does not grant private or public display. Bigints remain internal. The current JSON DTOs serialize them as decimal strings together with the stored minor-unit exponent and timestamp basis/precision.

Native UPDATE is prohibited. Privileged provider-scoped DELETE remains possible for contractual purge, with no normal delete method. Before real-provider activation, verify licensing/public display, fetch/read disablement, queued/in-flight work draining, observations/receipt/cache purge and a replay barrier before reactivation. No current retention duration or redistribution permission is assumed. No raw responses, authenticated API URLs, credentials or private facts belong in observation provenance.

## Scheduled synchronization boundary

The worker composes `market.sync` in `apps/worker/src/run.ts`, using
`createProductionMarketProviders` to supply the real factories, explicit registrations,
existing domain Money capabilities and a shared request permit/lifecycle. Global sync,
both provider flags and both policy approvals default to false; hourly/daily budgets
default to zero. Validated activation requires the global and provider flags, explicit
policy approval, positive finite budgets and valid credentials. Credentials or the global
flag alone do not register an adapter. Requests contain only an exact global catalog
target, provider ID and poll UUID generated before enqueue. Retries retain the same payload.

A successful `MarketSyncReceipt` is immutable and commits with the observation batch,
including an empty result. `recordedAt` is database insertion time, not an exact
PostgreSQL commit timestamp. Equal committed receipts skip fetching before current
catalog validation; changed requests using the same provider/poll conflict. Uncommitted
concurrent deliveries may still fetch twice: receipt idempotency does not guarantee
exactly-once network calls before commit. The real adapters report exactly one actual
body-receipt time through the optional `reportFetchedAt` callback, before decoding and
permit cooldown. The handler validates and freezes that timestamp; legacy providers
without the callback retain an explicit fetch-completion fallback. No source sale time
is inferred.

One mutable `MarketSyncDispatchState` row serializes cursor advancement and pg-boss
insertion in a shared transaction. Hard maxima are 32 candidates per global tick,
at least 60 seconds between ticks, and 256 created/retry/active jobs. Each mapping
also has an hourly database-time scheduling slot. These bounds are not provider
quotas or spend guarantees. They trade immediate catalog-wide freshness for bounded
work, restart fairness and backpressure. Every normal market enqueue must use this
admission path. The internal backend is pinned to pg-boss 12.33.2 and its default
`pgboss` schema; alternate backends without caller-owned transactions fail closed.

There are at most three attempts per delivery, with 30-second exponential retry
backoff capped at 300 seconds. Active expiry is 120 seconds, waiting retention one
day and terminal queue retention seven days. Catalog changes/retirement, validated
conflicts, malformed responses and permanent provider denials are terminal classified
skips, without a successful receipt. Transient or unexpected provider errors become constant broker error codes; raw errors, headers,
URLs, credentials and bodies are not persisted or logged. History rows and receipts
have no automatic deletion policy in this task.

Opt-in queue handlers receive the actual broker AbortSignal. Adapters must honor
it and settle transport work; merely racing a promise is insufficient. The worker
aborts market work before shutdown and awaits settlement before disconnecting its
bounded database client. If market work does not settle, shutdown fails and the
DB is deliberately retained. Query/transaction/connection deadlines are distinct;
an uncooperative transport is not claimed to meet a graceful wall-clock guarantee.

The factories use one `MarketRequestPermit` per HTTP attempt, with no internal retry,
redirect or pagination. Any future additional request/page must acquire another permit.
Scrydex accepts an exact Pokémon card/print-variant binding; PriceCharting accepts an
exact product/category/console binding. Neither performs UPC/text-search resolution.
Both preserve exact source numeric tokens, explicit zero and CATALOG_VALUE metrics.

The production permit uses a durable PostgreSQL claim scoped to upstream service plus
the exact accepted token bytes across processes. Team, category, alias and replica do
not create separate quota scopes. A positive validated policy can initialize only a
missing idle row; existing claim/counters/policy are preserved and mismatches fail closed.
The non-expiring claim spans physical transport/body settlement plus at least 1,000 ms
monotonic cooldown, followed by independent own-attempt compare-clear. There is no TTL,
automatic takeover or refund. Fixed UTC hour/day counters conservatively charge admissions
and carry one attempt into each advanced bucket before clearing. These are attempted-call
limits, not exact physical-start analytics, rolling quotas or monetary spend guarantees.

The permit lifecycle closes admission synchronously, propagates stop cancellation to
actual transport, waits settlement/cooldown/cleanup and latches uncertainty even after
a handler finishes. Ambiguous admission never sends; a committed claim remains held.
An ambiguously acknowledged clear may have committed and left the DB idle, allowing a
safely spaced successor, while the old local stop still fails. The existing shutdown
watchdog reports failure and withholds DB disconnect when safe settlement is unproven;
local stop does not establish fleet-wide drain.

Before either provider is activated, verify the real response shape, zero/sentinel
semantics, purchased-guide currency, storage/retention/private/public-display/link rights,
exclusive shared-token routing, subscribed request/credit/overage controls and real
runtime/driver cancellation bounds. Scrydex's single-card envelope and both providers'
zero semantics remain unverified; PriceCharting's supported profile is deliberately
USD-only pending purchased-guide verification. Fake HTTP/native tests do not establish
live-provider readiness. The [market provider operations runbook](../../docs/market-provider-operations.md)
details these unresolved gates and the required authorized drain/replay/purge/recovery
rehearsal. Termination disables fetch and read policies on all replicas, stops admission,
cancels and drains in-flight work and all queued,
retry, failed, dead-letter and operator replay sources, then purges observations,
receipts and derived caches provider-scoped. Reactivation requires verified absence
of old work and uses fresh polls. Drain-only does not reject a privileged operator
later reimporting an old saved payload. Receipt UPDATE guards permit scoped DELETE;
no destructive purge/recovery runner or license/account subsystem is supplied by this phase.
