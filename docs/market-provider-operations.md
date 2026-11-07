# Market provider operations

The adapters are implemented and tested with fake HTTP only. Both provider flags, both policy approvals, and global market sync default to false. Request budgets default to zero. Credentials alone never enable a provider. Public display remains controlled separately by the existing empty-by-default display policy.

## Supported bindings and values

The curated catalog identifier is compact canonical JSON with four string elements:

- Scrydex namespace `scrydex`, type `pokemon_card_variant`: `["v1","pokemon","base1-4","unlimitedHolofoil"]`, attached to an explicit catalog variant.
- PriceCharting namespace `pricecharting`, type `product_category`: `["v1","cards","1234","Pokemon Base Set"]`. Category is `cards` or `video_games`; product ID and console must match the response exactly.

There is no UPC/text-search ingestion, best-match rebinding, pagination, history retrieval or automatic retry inside an adapter. Every high-level fetch makes one permitted HTTP attempt. Redirects fail. Each queue retry takes a new permit; an already committed poll receipt skips HTTP.

All quotes retain `CATALOG_VALUE`, source metric, source qualifiers and FETCH time. Explicit numeric zero remains zero; absent/null fields remain absent. No completed sale, market-worth guarantee, sample size or grading company is inferred. Exact source numeric tokens are decoded using Node 24 reviver source context, then converted through worker-injected domain Money capabilities. Supported currency definitions and bigint limits are not duplicated.

The Scrydex decoder accepts only the bare Pokémon card object illustrated in [its card documentation](https://scrydex.com/docs/pokemon/cards); that page does not conclusively establish the single-card wire envelope. Unknown envelopes fail closed. [PriceCharting's API documentation](https://www.pricecharting.com/api-documentation) supports the direct product endpoint and integer-penny guide fields. Its CSV USD statement and product-row equivalence support the deliberately USD-only profile; the purchased guide must still be checked. Neither checked document settled guide-price zero sentinel semantics.

## Activation gates — still unverified

An authorized operator must establish and retain evidence for all of these before setting either `*_POLICY_APPROVED=true` and `*_ENABLED=true`:

1. Current subscription and written rights covering storage, retention, private/public display, links and any proposed reuse. Generic caching advice is not redistribution permission. The implementation does not accept licenses or purchase access.
2. The real supported response shape, zero/sentinel meaning and purchased guide currency. The tests use invented contract fixtures, not authenticated provider responses.
3. Every consumer of the same upstream/token uses the same database gate. Team, category, alias and worker instance do not create new scopes. No other service may bypass the gate.
4. Explicit positive hourly/daily attempted-call budgets within hard caps of 60/500, with subscribed limits at least as restrictive. For Scrydex, verify a conservative per-request credit ceiling, plan/overage controls and affordable derived call budgets. Attempt counters are not a monetary spending guarantee.
5. Real runtime/driver cancellation and connection bounds, including all replicas and instrumentation. Never enable request URL/header/body logging: PriceCharting authentication is in its query. A shutdown timeout does not prove physical cancellation.
6. A rehearsed authorized disable, fleet drain, replay barrier, retention purge, verification and reactivation process. This phase does not supply or execute a destructive purge/recovery runner. Those operational gates remain pending integration hardening.

Credentials must be nonempty, unchanged printable ASCII strings with no edge whitespace or control characters. The same accepted token is hashed and submitted. Scrydex team authenticates the request but is excluded from scope. Do not log token fingerprints either.

## Durable admission and accounting

An explicitly enabled, finite positive trusted policy can initialize a missing idle row on its first admission. `INSERT ... ON CONFLICT DO NOTHING` preserves every existing claim, counter and policy; a short locked transaction checks policy, counts the attempt and writes a unique active claim before HTTP. Missing/zero policy does no database admission or HTTP. Changing an existing policy fails closed rather than resetting its budget.

Claims have no TTL and cannot be stolen. The claim spans body completion/cancellation and at least 1,000 milliseconds of monotonic cooldown, then an independent bounded transaction clears only the owner's attempt. No catalog or receipt transaction spans HTTP. A paused sender keeps excluding successors even when its planned start is late. An ignored abort keeps the physical operation pending; the worker's 15-second watchdog fails shutdown and withholds database disconnect.

Counters charge admissions conservatively, including failed and cancelled attempts, without refunds. They use fixed UTC hour/day windows. If a holder crosses a window before clearing, its attempt is carried as one count into each advanced current window; a same-day count remains intact for hour-only rollover. Clock regression fails closed. These are conservative admission/carry counts, not exact physical-start analytics, rolling-window quotas or spend limits.

An ambiguous admission acknowledgement never starts HTTP. If committed, its claim remains held. After physical settlement and cooldown, an ambiguous clear acknowledgement can mean either a still-held claim or a successfully cleared idle row; a safe successor may then admit. In both cases the old local lifecycle latches uncertainty and fails stop, even if its handler already settled. Never claim an ambiguously successful clear leaves a globally blocked row.

## Authorized drain and recovery procedure

1. Disable new market fetching and separately disable provider reads on **every** replica. Prevent queue redrive, scheduled dispatch, manual replay and stale deployment restart. Record the affected service/token scope without exposing secrets.
2. Stop all credential consumers. Await actual HTTP/body settlement, cooldown and claim cleanup. Verify all old processes are terminated or unable to send. A successful local stop is not fleet-wide drain. If any possible sender remains, keep the scope disabled and do not clear its claim.
3. Inspect database-authoritative active attempt and counters. Reconcile ambiguous acknowledgements against the specific attempt. Recovery may compare-clear that exact claim only after separately authorized verified fleet drain. Never delete an operational gate merely to unblock service; never reset counters as a side effect of recovery.
4. If rights require removal, obtain separate purge authorization. Purge the required provider observations, receipts, caches and materialized displays under the replay barrier, then verify absence. Keep operational token gates/counters independent of observation retention. No operation here authorizes deletion of private/manual valuations.
5. Before reactivation, verify rights, sentinel/currency facts, finite quotas, exclusive token routing, absence of stale senders and the old-poll replay barrier. Privileged replay of a previously saved payload is not prevented by a license generation mechanism in this version. If that barrier cannot be guaranteed, remain disabled.

Automated tests exercise claim ownership, failures, accounting and local lifecycle behavior on an owned `_test` PostgreSQL database with fake credentials. They do not constitute subscription validation, fleet-drain proof, purge authorization or live-provider readiness.
