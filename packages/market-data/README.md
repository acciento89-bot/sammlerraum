# Global market provider boundary

This package contains provider types and explicit server-side registration. The default registry is empty. It performs no HTTP calls and grants no license, activation or public-display entitlement.

A request binds one canonical catalog entry, optional exact variant and exact provider identifier at a specific revision. Its UUID `pollId` must be created before enqueueing and persisted in job data. Providers return only source facts: one of seven separate observation kinds, exact bigint minor units, currency, named source metric, authored qualifiers and explicit timestamp provenance. There are no personal-item fields, grading conversions, foreign exchange or blended estimates.

`EVENT` uses a documented stable upstream event ID scoped to its source product; `POLL` uses the persisted request poll ID. Recurring guide product IDs are not sale event IDs. Source `DAY` and `SECOND` precision remains explicit. Current guides without source timestamps use `FETCH`; this is retrieval time, never an invented sale date. Missing prices produce no observation. Zero is a value.

The domain market service validates and snapshots all input before database work, applies pinned ISO scale metadata, revalidates exact active catalog mappings under entry-before-variant locks and appends immutable observations. Equal retries return original IDs/timestamps; changed same-key content aborts the entire batch. Returned IDs are sorted by canonical identity; identical duplicates within a batch count once. Empty batches still validate and lock the current target.

`recordObservationsInTransaction` participates in the caller's transaction and never commits it; errors must abort the caller. Task3 must insert its committed-sync receipt in that same transaction, including empty successes, and check that receipt before catalog checks or HTTP. This package alone does not provide receipt storage, scheduling, retries, cancellation or exactly-once HTTP. A caller-owned transaction must use ReadCommitted and preserve the documented parent-lock order. UTC is set locally for accurate PostgreSQL adapter timestamp decoding.

History reads require an explicit registered provider and are bounded; the future API must additionally enforce provider display entitlement. Bigints remain internal. Future JSON DTOs must serialize them as decimal strings together with the stored minor-unit exponent and timestamp basis/precision.

Native UPDATE is prohibited. Privileged provider-scoped DELETE remains possible for contractual purge, with no normal delete method. Before real-provider activation, verify licensing/public display, fetch/read disablement, queued/in-flight work draining, observations/receipt/cache purge and a replay barrier before reactivation. No current retention duration or redistribution permission is assumed. No raw responses, authenticated API URLs, credentials or private facts belong in observation provenance.

## Scheduled synchronization boundary

The worker composes `market.sync` in `apps/worker/src/run.ts`. Its production registry
is empty and `MARKET_SYNC_ENABLED` defaults to false. Credentials or that flag alone
do not register an adapter. Requests contain only an exact global catalog target,
provider ID and poll UUID generated before enqueue. Retries retain the same payload.

A successful `MarketSyncReceipt` is immutable and commits with the observation batch,
including an empty result. `recordedAt` is database insertion time, not an exact
PostgreSQL commit timestamp. Equal committed receipts skip fetching before current
catalog validation; changed requests using the same provider/poll conflict. Uncommitted
concurrent deliveries may still fetch twice. The worker currently timestamps completion
of `fetch`; Task6 must preserve actual HTTP body receipt time before decoding/permit
cooldown when those differ. No source sale time is inferred.

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
day and terminal queue retention seven days. Catalog changes/retirement and validated
conflicts are terminal classified skips, without a successful receipt. Transient or
unexpected provider errors become constant broker error codes; raw errors, headers,
URLs, credentials and bodies are not persisted or logged. History rows and receipts
have no automatic deletion policy in this task.

Opt-in queue handlers receive the actual broker AbortSignal. Adapters must honor
it and settle transport work; merely racing a promise is insufficient. The worker
aborts market work before shutdown and awaits settlement before disconnecting its
bounded database client. If market work does not settle, shutdown fails and the
DB is deliberately retained. Query/transaction/connection deadlines are distinct;
an uncooperative transport is not claimed to meet a graceful wall-clock guarantee.

Task6 must inject `MarketRequestPermit` around **every HTTP attempt and page**, scoped
to the actual credential across processes, with verified spacing, cancellation and
an independent call/spend budget. A process timer, provider-ID semaphore, queue
singleton or successful receipt is not a distributed per-token limiter. No real
permit or adapter is implemented here.

Before any licensed provider is activated, Task6/Phase13 must verify fetch and read
entitlement and an authorized drain/purge runbook. Termination disables both policies
on all replicas, stops admission, cancels and drains in-flight work and all queued,
retry, failed, dead-letter and operator replay sources, then purges observations,
receipts and derived caches provider-scoped. Reactivation requires verified absence
of old work and uses fresh polls. Drain-only does not reject a privileged operator
later reimporting an old saved payload. Receipt UPDATE guards permit scoped DELETE;
no live purge or license/account subsystem is supplied by this task.
