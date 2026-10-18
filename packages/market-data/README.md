# Global market provider boundary

This package contains provider types and explicit server-side registration. The default registry is empty. It performs no HTTP calls and grants no license, activation or public-display entitlement.

A request binds one canonical catalog entry, optional exact variant and exact provider identifier at a specific revision. Its UUID `pollId` must be created before enqueueing and persisted in job data. Providers return only source facts: one of seven separate observation kinds, exact bigint minor units, currency, named source metric, authored qualifiers and explicit timestamp provenance. There are no personal-item fields, grading conversions, foreign exchange or blended estimates.

`EVENT` uses a documented stable upstream event ID scoped to its source product; `POLL` uses the persisted request poll ID. Recurring guide product IDs are not sale event IDs. Source `DAY` and `SECOND` precision remains explicit. Current guides without source timestamps use `FETCH`; this is retrieval time, never an invented sale date. Missing prices produce no observation. Zero is a value.

The domain market service validates and snapshots all input before database work, applies pinned ISO scale metadata, revalidates exact active catalog mappings under entry-before-variant locks and appends immutable observations. Equal retries return original IDs/timestamps; changed same-key content aborts the entire batch. Returned IDs are sorted by canonical identity; identical duplicates within a batch count once. Empty batches still validate and lock the current target.

`recordObservationsInTransaction` participates in the caller's transaction and never commits it; errors must abort the caller. Task3 must insert its committed-sync receipt in that same transaction, including empty successes, and check that receipt before catalog checks or HTTP. This package alone does not provide receipt storage, scheduling, retries, cancellation or exactly-once HTTP. A caller-owned transaction must use ReadCommitted and preserve the documented parent-lock order. UTC is set locally for accurate PostgreSQL adapter timestamp decoding.

History reads require an explicit registered provider and are bounded; the future API must additionally enforce provider display entitlement. Bigints remain internal. Future JSON DTOs must serialize them as decimal strings together with the stored minor-unit exponent and timestamp basis/precision.

Native UPDATE is prohibited. Privileged provider-scoped DELETE remains possible for contractual purge, with no normal delete method. Before real-provider activation, verify licensing/public display, fetch/read disablement, queued/in-flight work draining, observations/receipt/cache purge and a replay barrier before reactivation. No current retention duration or redistribution permission is assumed. No raw responses, authenticated API URLs, credentials or private facts belong in observation provenance.
