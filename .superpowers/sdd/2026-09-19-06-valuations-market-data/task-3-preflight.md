# Phase06 Task3 architecture preflight — no implementation GO

Prepared against committed BASE `d55c86a4cfb60561e98eec996f0d72643a022df4`, the Task3 brief/context, approved Task2 rulings, Task2 contract proposal, Phase06 shared-boundary table and supplied provider evidence. Task2 remains the sole source/schema/test/DB mutator. Its partial implementation was not read as a final contract. Only this report is written; no source/tests/schema/index/HEAD changes, suites, generation, database operations, provider calls, accounts, credentials or children.

Goal: scheduled, bounded, default-OFF synchronization of exact global catalog mappings, with durable retry identity and atomic successful receipts. Personal item facts never enter requests. Task1 is verified at canonical35/91; Task2 completion, review, exact CI, checkoff, push, main sync and a new explicit root GO/BASE remain prerequisites to Task3 implementation. The existing product design is approved; the questions below are root integration decisions, not a new user approval cycle.

## Recommended minimum and costs

1. Task2's exact request/preparation and transaction-scoped ingestion, plus a Task3 `MarketSyncReceipt` keyed by provider+poll UUID. Receipt and observations commit together, including an empty response. No STARTED state, raw response store or generic job framework.
2. A real worker producer, one small durable global dispatch cursor/next-run row, and a narrow transactional pg-boss producer surface. This second row is scheduler state, not an observation or per-job state. It buys cross-replica admission bounds, restart fairness and atomic cursor+enqueue; it avoids an outbox or a persistent row per catalog target. The smaller memory-only alternative removes one row/model and its admission transaction coupling, but each restart can revisit the first32 targets and N replicas can scan/admit up to32*N candidates/minute; repeated restarts can starve later targets. A backlog cap alone does not repair that cadence/fairness gap.
3. Explicit opt-in cancellation propagation, bounded retry policy and lifecycle integration in actual `run.ts`/`main.ts`. Existing payload-only handlers keep their contract. No real adapters or live provider activation.
4. A strict drain-before-purge-and-reactivation prerequisite. No license/account subsystem and no claim that deleting receipts makes replay safe. An activation generation would be stronger against arbitrary privileged old-payload resubmission, but adds a second configuration/versioning contract; defer it unless root prefers that alternative.

Rejected alternatives: provider+product uniqueness loses recurring guide history; generating poll UUID during handling loses retry identity; singleton alone neither records successful empty polls nor proves exactly-once HTTP; memory-only cursors reset on restart and cannot enforce one global scan cadence; unbounded `findJobs()`/cached queue statistics cannot prove admission capacity.

## Verified existing APIs and limits

| Existing surface at BASE | Evidence and consequence |
| --- | --- |
| `packages/queue/src/types.ts` | `QueueClient.enqueue(name,payload,{singletonKey?,retryLimit?,priority?}):Promise<string>`; `JobHandler<T>=(payload:T)=>Promise<void>`. No retry delay/expiration/admission/cancellation API. |
| `packages/queue/src/runtime.ts` | `WorkerRegistry.register()` is locked by `QueueRuntime.start()`. Runtime calls `backend.work(name, jobs => Promise.all(jobs.map(job => handle(job.data))))`; job ID and signal are discarded. `stop()` calls bare backend.stop(). |
| `packages/queue/src/pg-boss-queue.ts` | Ensures persisted `exclusive` policy. Enqueue defaults to retryLimit5. `send()` returning null is resolved through `findJobs(key)` and nonterminal states; this fallback cannot represent retained terminal throttle suppression. Keep image enqueue behavior unchanged. |
| `packages/queue/src/index.ts` | `createPgBossServices()` constructs one PgBoss and exposes client/registry/runtime only. A new producer backend is an explicit additive surface, not an API assumed already present. |
| `apps/worker/src/run.ts` | Actual production composition, registration before startWorker, config/DB/storage/queue injection. `main.ts` alone cannot create scheduled market work. |
| `apps/worker/src/main.ts` | Starts queue before dispatchers; stops health, cleanup, image dispatcher, queue, then DB. Existing stop can skip later cleanup when an earlier stop throws; Task3 lifecycle tests must cover its new cleanup path and ensure DB is not disconnected under an unsettled market transaction. |
| `apps/worker/src/jobs/image-dispatcher.ts` | Immediate tick, interval, one running promise, 32 candidate limit, stop clears timer then awaits the running tick. Useful lifecycle pattern, but not a distributed market admission/cadence guarantee. |
| `apps/worker/src/main.test.ts` | Existing real lifecycle-order, error-redaction and startup rollback tests. There is no committed `run.test.ts`; add composition coverage instead of citing nonexistent coverage. |
| `packages/db/prisma/schema.prisma` | CatalogEntry has revision but no retired flag. Variant/identifier have active flags; identifier has exact namespace/type/value/entry/optional variant. Current indexes do not directly serve namespace/type/id keyset scanning. |
| `packages/domain/src/valuations/valuation-service.ts` | ReadCommitted wrapper sets LOCAL TimeZone UTC; clock_timestamp is read after locks; ISO dates are bound as explicit timestamptz. Reuse this finalized Task1 boundary through Task2. |

Pinned dependency evidence was read locally, without executing it: `packages/queue/package.json` pins pg-boss12.33.2, matching `node_modules/.pnpm/pg-boss@12.33.2/node_modules/pg-boss/dist/`. `types.d.ts`, `plans.js`, `manager.js`, `index.js` confirm:

- `send(name,data,SendOptions)` accepts `db`, `retryLimit`, `retryDelay`, `retryBackoff`, `retryDelayMax`, `expireInSeconds`, `retentionSeconds`, `deleteAfterSeconds`, `singletonSeconds`. `getDb().beginTransaction()` returns `{db,commit,rollback}`. Check existence/fail closed during composition; this is a capability, not mandatory on arbitrary custom test backends.
- `Job` carries `signal:AbortSignal`. Manager sets it and aborts on timeout/forced shutdown. Promise timeout alone does not stop a transport that ignores its signal.
- Defaults absent explicit options: active expiration900s; queued/retry retention14days; terminal deletion7days; retryDelay0; retryBackofffalse. Wrapper overrides retry count to5. These defaults are too loose for market sync.
- `exclusive` native index covers created/retry/active jobs with one singleton key. Throttle index additionally covers the time slot even after completion/failure, excluding cancelled jobs. `singletonSeconds` uses database time buckets, not a rolling spacing guarantee.
- `findJobs({queued:true})` means state before active and has no LIMIT; it excludes active work. `getQueueStats()` is cached by default. Neither is the hard cap implementation proposed here.
- `stop()` defaults to graceful true, timeout30000ms and close true; manager stops fetching, then fails/aborts work remaining at shutdown. Bare `cancel()` must not be assumed to have physically stopped external HTTP.

## Strict durable job and receipt

Proposed job JSON, reusing finalized Task2 names after its verified BASE:

```ts
type MarketSyncPayload = {
  providerId: string;
  pollId: string; // native UUID, generated before send, retained unchanged on retry
  target: {
    entryId: string;
    variantId: string | null;
    revision: number;
    identifierId: string;
    namespace: string;
    identifierType: string;
    externalId: string;
  };
};
```

Strict object at every level: reject unknown/private fields, missing/null mismatches and supplied undefined; native UUIDs canonicalize; preserve exact case-sensitive identifier strings. Use Task2's provider grammar and exact target bounds, not a duplicate interpretation: provider max64 lowercase ASCII, namespace/type bounded to catalog/registry contract, external ID max256 UTF-8 bytes, positive safe int revision within PostgreSQL int. Complete canonical job/request JSON <=2048 UTF-8 bytes. No bigint in job JSON; only observations carry native bigint inside the process. No URLs, credentials, private ownership or provider error objects are queued.

Additive `MarketSyncReceipt` migration: `(providerId text,pollId uuid)` primary key; `request jsonb NOT NULL` containing the full canonical strict payload; `fetchedAt timestamptz(3)`, `committedAt timestamptz(3)`, `observationCount int`. Count is Task2's unique inserted+reused count, 0..100, excluding repeated identical inputs. No IDs list is necessary for a void queue handler. Empty success is count0, never absence of a receipt. Task3 consumes Task2's count semantics without redefining observation identity.

Native checks validate exact JSON keys/types/nested keys, size/field bounds, normalized UUID spellings, request provider/poll equal to PK, positive int revision, canonical target variant null/UUID, finite year0001..9999 times and fetchedAt<=committedAt. No invented source timestamp lives in this table. Canonical request comparison is exact JSONB equality after validated normalization; revision and identifier UUID ARE part of receipt equality even though Task2 deliberately excludes some audit fields from EVENT observation retry equality. Same provider+poll with any different persisted request is `MARKET_SYNC_IDENTITY_CONFLICT`.

A BEFORE UPDATE trigger rejects every UPDATE, including no-op; privileged provider-scoped DELETE remains possible. PK already supports provider-scoped deletion; no observation-to-receipt FK and no current-active catalog guard on receipts. Catalog validity is established by Task2 ingestion in the same transaction. A receipt must still be readable after later catalog retirement, otherwise the crash/ACK skip is broken. The app exposes no standalone receipt-write endpoint. Native constraints protect shape, not arbitrary privileged SQL fabricating evidence; test the actual atomic composition.

Use LOCAL UTC, explicit ISO `::timestamptz` bindings and database clock after locks for committedAt. `committedAt` is database-authored insertion time immediately before commit, not an assertion of the exact PostgreSQL commit LSN/time. Its name/semantics must be documented. No duplicate money parser/currency table/native currency-pair strategy.

## Handler, transaction and failure sequence

1. Validate the persisted payload and trusted provider activation. Disabled/unregistered providers terminate with a sanitized classification and no fetch. Check receipt before any current-catalog validation or network work. Equal committed request returns immediately; unequal request is terminal identity conflict. Do not emit provider-derived content when read entitlement has been removed.
2. Validate the still-current exact Task2 request. Never call preparation in a way that replaces expected revision/identifier during a retry. A missing entry, changed revision, inactive selected variant or identifier is `stale_target`, a terminal acknowledged skip. There is no entry-retired field to query. A later scheduling pass may prepare a new poll under the current revision.
3. Acquire cancellable provider request permission, fetch the exact request, capture fetchedAt immediately on successful provider fetch completion (the approved Task2 fetch boundary), then validate the bounded full batch. No catalog/item/collection locks, receipt transaction or admission transaction is held across HTTP. Task6 must preserve actual response-receipt time if it introduces parsing/pagination that separates HTTP receipt from completion; never substitute enqueue/retry time or invent sale precision.
4. Open ReadCommitted transaction; set LOCAL UTC and finite lock/statement/transaction limits; take `pg_advisory_xact_lock` on a stable namespace/provider/poll hash. Hash collisions only serialize; equality always uses real keys/request JSON. Re-read receipt AFTER acquiring lock. Equal winner returns without catalog recheck or ingestion; conflicting request aborts. Thus a concurrent winner remains usable even if the catalog changed afterwards.
5. With no receipt, call finalized `recordObservationsInTransaction(tx,providerId,observations,{request,fetchedAt})`. It revalidates current target and preserves entry SHARE→variant SHARE lock order and original EVENT history. Then insert the receipt and commit. Empty batches must still undergo Task2 target validation before inserting their count0 receipt. If the finalized API does not validate empty requests, add explicit Task2 validation in the same transaction by an approved seam; do not assume an empty for-loop establishes catalog validity.
6. Return only after commit. An ACK failure or process death after commit retries the same job.data and takes step1 without refetch. Failure before commit leaves no receipt or partial new observation batch. Concurrent precommit jobs can both fetch: one commits, the second reuses its receipt; the receipt does not guarantee exactly-once external I/O. If the first transaction rolls back, the other may commit its later response. Divergent same observation identity follows Task2's whole-batch conflict policy.

Terminal acknowledged outcomes: invalid payload/provider output, unsupported mapping, disabled provider, stale target, request identity conflict, observation identity conflict and known permanent provider denial. No success receipt for any of these. These are classified skips/failures in bounded logs, not successful market results. Broker completion represents handled delivery, not a successful observation receipt. Transient transport/429/5xx, permit timeout, database deadlock/serialization/connection failure and shutdown interruption throw a freshly constructed constant-code error so pg-boss retries; unexpected exceptions also become a generic retryable code, capped by policy. Never attach cause, raw URL/body/header, request object or original stack to persisted broker errors. Allowlisted providerId and fixed error code are sufficient log context; no external ID or token necessary.

## Real default-OFF bounded producer

Production registry and enabled-provider policy are empty by default. `MARKET_SYNC_ENABLED` parses only explicit true/false, defaults false. Merely setting it true or adding credentials does not instantiate a real adapter. Task3 fake providers are injected through the real registry/composition in tests. At most16 explicit provider registrations; each declares one supported namespace/type mapping. All matching is canonical-catalog-only.

Proposed Task3 defaults/hard upper bounds (new recommendations, not inherited requirements): scan interval60s (config60s..1h), candidate batch32 (1..32), global nonterminal backlog256 (1..256), per-mapping schedule bucket3600s, retryLimit2 (three total attempts), retryDelay30s with backoff and maximum300s, active expiry120s, queued/retry retention86400s, terminal broker retention604800s. Each handler has a stricter60s total settlement budget: pre-transaction work must finish before45s, HTTP is <=30s within that budget, and abort-compliant transports settle within5s; ingestion lock wait <=5s, statement timeout <=5s, transaction timeout <=10s. Do not start ingestion after the pre-transaction deadline. These are combined bounds, not a fresh60s allowance for each stage. These values are proposed conservative defaults to verify with fake providers after GO, not already tested behavior, a purchased provider quota or permission to activate a live source.

Add `MarketSyncDispatchState`: one row with fixed key `market.sync`, nullable cursorProviderId/cursorIdentifierId pair and `nextDispatchAt timestamptz(3)`. Cursor is a stable `(providerId COLLATE C,identifier UUID)` tuple; nullable pair denotes beginning. Native checks enforce singleton key, pair consistency, provider grammar and finite timestamp. It is intentionally mutable operational state and contains no response/provider secret. Initial creation is idempotent in the authorized implementation migration; no provider catalog seeds/grants.

Each tick is nonoverlapping locally and follows this bounded algorithm. Preparation has a20s start-work budget, each catalog preparation/read has a<=5s database timeout, and no new preparation starts after budget exhaustion or stop. The one in-flight preparation may settle within its5s bound; admission is then <=10s, so a tick is <=35s under those database/connection timeout contracts. Preserve the cursor before unprepared candidates. Recheck finalized Task2 wrapper connection/max-wait/transaction limits; if it cannot meet this bound, configure a dedicated bounded producer DB client or ask root for the narrow timeout seam rather than claiming JavaScript cancellation stops SQL. `stop()` prevents admission after the current preparation and awaits an already-open admission transaction (<=10s).

1. Return immediately when disabled/stopping. Read the one cursor row; if not due, return. Page at most32 explicit active identifier mappings strictly after its cursor, ordered by provider+identifier, joining current entry revision and active optional variant. Only registered namespace/type pairs are eligible. Do not scan private items or use title matching. Add a narrow active partial index `(namespace,type,id)` on CatalogExternalIdentifier in Task3's additive migration if verified query shape needs it; do not rewrite Task2 migrations.
2. For each of at most32 candidates, use finalized Task2 preparation to build its exact immutable request with a new random poll UUID BEFORE enqueue. Preparation occurs outside admission transaction. A stale/malformed candidate is classified and skipped; other candidates are retained. Producer errors never cause a partially rewritten persisted payload. This precomputation may be duplicated by racing producers, but sends are serialized below.
3. Open one transaction on the actual pg-boss database capability. Apply LOCAL UTC and bounded statement/transaction timeouts. Lock the dispatch-state row; compare its current cursor/next-run against the values used to prepare the page and check database time. A changed/not-due row means another producer won: discard candidates, no send. There is no provider/network call while this row is locked.
4. Use a bounded SQL probe of the actual `pgboss.job` parent, restricted to name=`market.sync` and state IN(created,retry,active), `LIMIT cap`, to count occupancy exactly in this transaction. Do not use cached stats or `findJobs`. All authorized market producers must use this same row-serialized admission route. Pg-boss workers can only decrease the nonterminal set; retries stay in it. Privileged direct/manual sends bypass application bounds and are outside normal scheduling.
5. Send at most min(remaining capacity,32) prepared candidates via actual `boss.send(...,{db:tx.db,...policy})`; singleton key is `providerId:identifierId` (revision/poll excluded), `singletonSeconds=3600`. Different revisions do not stack active polls. Null send is an explicit `suppressed` outcome, including retained terminal throttle suppression; do not use the existing enqueue method's active-ID fallback. Never replace the active job's poll/request with the new candidate.
6. Cursor advances only past candidates processed for admission or deliberately skipped. If capacity is exhausted, preserve the cursor before the first unprocessed candidate. Empty page resets cursor to beginning for a later tick; no immediate unbounded wrap loop. Set nextDispatchAt to DB now+interval even when saturated, and commit cursor+all sends atomically. Rollback/crash before commit persists neither; crash after commit preserves both. No outbox or second enqueue transaction is needed.

Concrete admission transaction shape (parameterized values; identifiers are fixed adapter constants):

```sql
BEGIN; -- acquired with boss.getDb().beginTransaction(), not a second pool connection
SELECT set_config('TimeZone', 'UTC', true);
SELECT set_config('lock_timeout', '2s', true);
SELECT set_config('statement_timeout', '5s', true);
SELECT set_config('transaction_timeout', '10s', true); -- PostgreSQL17 CI/runtime contract
SELECT "cursorProviderId", "cursorIdentifierId", "nextDispatchAt"
FROM "MarketSyncDispatchState" WHERE id = 'market.sync' FOR UPDATE;
-- Compare the exact prepared cursor+nextDispatchAt after locking; check due against DB clock.
SELECT count(*)::int AS occupied FROM (
  SELECT 1 FROM pgboss.job
  WHERE name = $1 AND state IN ('created', 'retry', 'active') LIMIT $2
) AS bounded_pending;
-- boss.send('market.sync', strictPayload, {...policy, db: transaction.db}) for capacity-limited candidates.
UPDATE "MarketSyncDispatchState"
SET "cursorProviderId"=$1, "cursorIdentifierId"=$2::uuid,
    "nextDispatchAt"=date_trunc('milliseconds', clock_timestamp()) + $3 * interval '1 second'
WHERE id='market.sync';
COMMIT; -- transaction.commit(); any error -> transaction.rollback()
```

The illustration's BEGIN/COMMIT denote the capability-owned transaction, not SQL to send in addition to its begin/commit methods. No job.data/output or raw job rows are selected for occupancy; only a bounded count crosses the boundary. Duplicate suppression is handled by send's null result and never by logging/introspecting secret-bearing unrelated jobs. Preparation→dispatch-state row→pg-boss insert is the producer lock order; preparation releases its catalog locks before the state lock. Receipt lock order is provider+poll advisory→Task2 entry SHARE→variant SHARE→sorted observation identities→receipt INSERT. These transactions never take each other's scheduler/receipt lock. Catalog writers retain their entry→variant order, and no such lock is held across HTTP.

Expose from `createPgBossServices` only an explicitly typed producer backend capable of `send` and `getDb().beginTransaction`, or an equivalent narrow adapter owned by the queue package. The market dispatcher owns its cursor and admission SQL; the shared image QueueClient does not grow market-specific payload semantics. This is a small infrastructure seam, not a generalized scheduler framework. Test the exact default schema/table dependency (`pgboss.job`) against pinned12.33.2; if queue schema becomes configurable, pass the validated schema through this adapter rather than interpolating arbitrary config into SQL.

Cross-replica enforcement: one state row permits at most32 candidate admissions per60s globally; cap256 includes waiting/retrying/active jobs. Hourly singleton slot bounds repeated scheduling of a mapping even after failed delivery; cancellation is an explicit exception and must not be used as routine retry. Time buckets allow adjacent-slot polls close together, so this is not a per-token limiter. Global bound on newly created polls is32/minute; each has at most3 attempts. Retry bursts and multiple replicas still require Task6's per-token distributed permit and independent spend/call cap before real activation.

Restarts retain cursor and cadence; registry removals are skipped in the next ordered query, added lower keys are found after wrap. Catalog insertion behind cursor waits until the next sweep. Queue saturation pauses admission and extends refresh delay. For N eligible mappings, a healthy minimum sweep is approximately `ceil(N/32)*60s`, plus wrap and queue latency; hourly suppression and stale retries can delay fresh results further. No instant global refresh promise. Terminal jobs are finite-retention diagnostics; observations/receipts intentionally accumulate historical points and are governed by provider retention, not an undocumented automatic deletion policy.

## Cancellation, lifecycle and the Task6 limiter seam

Recommend explicit `WorkerRegistry.registerCancellable(name,(payload,{signal})=>Promise<void>)`, leaving existing `register` and `JobHandler<T>` unchanged. Runtime forwards pg-boss job.signal only through this opt-in API; poll UUID remains in job.data, not broker ID. Register market handler before queue startup. Add optional fetch context `{signal:AbortSignal}` to the finalized provider API only after root approves/rechecks Task2; one-argument providers remain compatible, but production adapter activation requires observing cancellation. A fake implementation must exercise this through actual runtime composition.

`run.ts` constructs the registry, Task2 domain service, receipt repository, dispatcher, handler and execution tracker. `main.ts` gets market producer/control lifecycle hooks. Startup order: queue registration → queue.start → dispatcher.start → health readiness. Shutdown begins by synchronously marking market work stopping, clearing its tick source and aborting market permit waits/HTTP, before awaiting health/other producer cleanup. Await dispatcher and in-flight handler/ingestion settlement together (market work <=10s under the stated abort/SQL bounds), then stop queue, then disconnect DB. Queue graceful stop still has its independent30s bound and existing image cleanup behavior; this report does not claim the whole worker shutdown fits10s. An already committing successful transaction may finish and receipt; shutdown must not undo or relabel it. Jobs entering after stopping throw sanitized interruption for later retry. Make stop idempotent with a shared stop promise, so two stop calls both wait for actual teardown; a boolean alone is insufficient proof of quiescence.

Do not rely on `Promise.race` to terminate adapters. A transport must honor signal, clear retry/page timers and settle; after abort no new DB ingestion begins. Check signal/stopping immediately before opening the bounded receipt transaction. Once entered, await commit/rollback before disconnect. If a transport cannot quiesce, mark shutdown unsuccessful and do not claim safe drain/purge; production supervisor termination and subsequent receipt-safe retry remain distinct from graceful success. Test startup failure and cleanup rejection so other independent resources are still attempted, while DB is not disconnected under active market work.

Task6 adapter factories receive `RequestPermit.run({credentialKey,signal},sendOneHttpRequest)`. CredentialKey is server-only stable token scope, never a raw token/log/payload value. Every HTTP attempt and pagination request must execute inside this permit, not only one high-level fetch. A future distributed implementation must serialize/reserve actual request starts across all processes sharing a token using database time, enforce >=1s PriceCharting spacing, honor cancellation, and apply an independently configured hard call/spend budget. A per-object timer, queue singleton, provider ID limiter or token-specific alias chosen inconsistently across deployments is insufficient. No limiter reservation/advisory/catalog lock needs to be held over the observation transaction. Task3 tests inject a fake cancellable permit; no real PriceCharting provider may register without Task6's verified distributed implementation and activation gates.

## Purge, entitlement and old-poll replay barrier

Choose the explicit drain prerequisite, not a receipt-based replay claim. Before provider termination/purge, authorized operations must disable its fetch AND read policy on every replica, stop new producer admission, abort and await every old in-flight HTTP/ingestion transaction, and cancel/remove every old provider queue delivery across created/retry/active/failed/dead-letter/redrive sources. Confirm all old worker instances are stopped or running disabled policy. Completion receipts, observations and all derived/public caches/request metadata are then purged provider-scoped with privileged bounded DELETE; receipt UPDATE guard does not obstruct this.

Reactivation is forbidden until the runner verifies no old provider job/payload source remains and no old process can commit. Only newly prepared random poll UUIDs may then be enqueued. This includes manual replay/export/import sources under operator control, not merely current active jobs. Test with a queued old payload and an in-flight fake fetch: disable/drain → purge → reactivate must not produce old observations. No purge is run now; the authorized runner/runbook is a Task6/Phase13 activation gate. Limitation: drain-only cannot cryptographically reject an arbitrary privileged operator reintroducing a saved old payload. If root requires that stronger protection, add provider activation-generation to policy, payload and receipt equality, rotate it before reactivation, and reject old generations before receipt/network; that is the explicit alternative, not something a receipt already does.

## Producer/consumer contracts and future verification

| Producer | Consumer | Concrete boundary |
| --- | --- | --- |
| Task1 canonical money/UTC strategy | Task2 ingestion and Task3 transaction | Native bigint observations; existing ISO pairs and UTC binding; no JSON numeric money or parallel parser |
| Task2 exact mapping preparation/registry | Task3 dispatcher | One current active identifier and immutable revision; no private joins, unknown mapping skipped |
| Task3 dispatcher | Actual pg-boss `market.sync` | Strict persisted request+poll UUID, atomic cursor+send, active singleton and retained throttle slot |
| Queue runtime | Task3 handler | Opt-in signal context; payload identity unchanged on retry; existing handlers unchanged |
| Task2 transaction-scoped ingestion | Task3 receipt repository | One ReadCommitted transaction, advisory lock then Task2 entry→variant order, atomic empty/full success |
| Task3 handler/registry | Task6 adapter/permit | Explicit cancellation; each actual HTTP request uses distributed token permit; no live adapter now |
| `run.ts` composition | `main.ts` lifecycle | Registration before queue start; bounded producer starts/stops; all market work settled before DB disconnect |
| Provider activation/drain policy | Task4 reads, Task6/Phase13 retention | Read/fetch disabled together; no old-poll replay after authorized drain/purge |

After fresh GO, behavioral RED and focused proof must cover:

- Real persisted pg-boss job.data retry retains the original poll UUID and exact request; later poll has new UUID. Use real queue with fake provider, not direct handler repetition alone.
- Empty success receipt; same request prefetch skip after commit and later catalog retirement; ACK/crash-after-commit skip with zero second HTTP calls; no receipt for transient/stale/conflict results.
- Whole-batch observation+receipt rollback, including injected failure after ingestion and before receipt; existing reused observations remain, newly inserted rows roll back. Empty batch still validates target in the same transaction.
- Concurrent equal polls and conflicting same-key requests with controlled barriers; one winner/immutable timestamps; precommit duplicate HTTP allowed and bounded. Same-key different revision must conflict at receipt even where Task2 EVENT equality tolerates revised audit metadata.
- Direct native malformed receipt insert, PK/request mismatch, UPDATE including no-op rejection and provider/fixture-scoped DELETE compatibility; UTC/year0001 with the Task1 dedicated-connection proof pattern.
- Real transactional producer admission: cap includes active/retry/created; two replicas cannot exceed32/global tick or cap; cursor+enqueue rollback and crash after commit; hourly null suppression is handled; all sends keep strict prepared payload; new/retired mapping races; full queue and registry changes; keyset wrap and restart cursor.
- Default-off actual `run.ts` wiring produces no market scan/enqueue/fetch calls; enabled fake composition registers before queue start and persists a poll. Real `main.test.ts` lifecycle tests verify order, concurrent stop, startup failure, permit cancellation and bounded settlement. Test broker signal propagation separately from lifecycle abort.
- No secret token/query/header/body/cause appears in logs or pg-boss persisted failure output; retryLimit2/backoff/expiry/retention verified from actual job metadata, not mocks accepting arbitrary options.
- Add receipt/producer/worker PG integration tests to the explicit serial `RUN_DATABASE_INTEGRATION=1` list in `.github/workflows/ci.yml`. Run focused tests and required exact-source CI after implementation; no preflight suite run or claimed coverage now.

Likely justified files beyond brief: new sync handler/receipt repository/dispatcher and tests; actual `apps/worker/src/run.ts` plus new composition test; `main.ts`/tests; additive queue signal/producer surfaces and targeted tests; Task3 additive receipt/cursor migration+Prisma models; server config/tests and `.env.example`; worker dependencies; dedicated CI allowlist. Do not rewrite Task2's migration/model, add real adapters, or refactor unrelated jobs.

## Only unresolved root decisions

1. Approve the one-row durable global dispatch state plus atomic pg-boss admission surface and optional active mapping index, with32/minute/256backlog/hourly mapping slot defaults. This is the minimum proposed to make restart fairness/global bounds concrete; memory-only cursor is smaller but materially weaker.
2. Approve explicit opt-in `registerCancellable` signal propagation and optional provider fetch signal context after Task2 final API review. Task2 proposal has only `fetch(request)`; silently assuming cancellation would make shutdown/drain claims false. Confirm Task2's final empty-batch current-target validation seam before implementation; if absent, a minimal transaction-scoped validator is needed, not a second matching implementation.
3. Approve drain-only replay barrier as a strict later reactivation gate, accepting its privileged manual replay limitation, or require the described provider activation-generation field now. No new license/payment subsystem is proposed in either case.

No implementation is authorized by this report. Fresh root GO/verified Task2 BASE is still required; no long new work after08:45Berlin and hard cutoff09:00Berlin18October2026/07:00UTC.
