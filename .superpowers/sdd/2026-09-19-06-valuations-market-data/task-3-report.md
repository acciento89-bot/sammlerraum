# Phase06 Task3 implementation report

Status: implemented and locally verified; awaiting root independent SPEC/QUALITY review and exact-source CI. No canonical checkoff, push, main sync or next-task GO is claimed. Verified BASE `3861f5186b1e9e905308824cfff8d5ecb7f5f3f2`. Work began around02:47UTC18October2026; source work and verification finished around03:06UTC, within the cutoff and45-minute checkpoint threshold. Root's Task3 design rulings govern.

## Delivered

- `market.sync` consumes a strict canonical provider/poll/target envelope. UUID is generated before enqueue, persisted in job.data and retained across retry. Task2's exact request parser is reused through a small server-only export; no private item fields, duplicate money parser, provider discovery or public ingestion route.
- Additive migration `20261018025000_market_sync` adds immutable successful `MarketSyncReceipt`, mutable one-row `MarketSyncDispatchState`, native shape/time/count/identity constraints, unconditional receipt UPDATE rejection, and a partial active catalog mapping index. It follows finalized Task2 migration20261018022132 and was applied once to owned PostgreSQL17/sammlerraum_test. No reset or applied migration rewrite. Privileged provider-scoped DELETE remains possible.
- Receipt records the exact full request, fetchedAt, database-authored recordedAt and unique observation count (`RecordResult.ids.length`). Empty success gets count0; reused EVENT rows count once. recordedAt denotes insertion time, not an exact commit timestamp. No observation-to-receipt FK, STARTED state, raw response store or general job framework.
- Receipt lookup/equality precedes current catalog validation and fetch. Same-key/different-request is terminal conflict; equal committed retries skip HTTP even after a later catalog edit. Under provider+poll transaction advisory serialization, the receipt is rechecked before Task2 ingestion. Ingestion and receipt insert share ReadCommitted/LOCAL UTC transaction and commit/rollback together. Empty input still validates current target via the finalized Task2 seam.
- The handler terminates validated malformed/stale/mismatched/conflicting requests without a successful receipt. Transient/unexpected exceptions become fresh constant broker error codes; original provider causes/stacks/URLs/headers/bodies are discarded. Adapter attachment requests are frozen copies to prevent mutation of the persisted request. Concurrent uncommitted fetches remain possible; no exactly-once HTTP claim.
- Real production composition in `apps/worker/src/run.ts` creates the bounded market DB client, handler, receipt repository, registry, producer and lifecycle. Registry remains empty and configuration defaults OFF. Enabling a flag does not instantiate an adapter. Tests inject fake providers through this actual composition.
- The producer reads only explicit registry-supported active canonical identifiers and optional active variants. Entry retirement is not invented. Keyset paging limits each mapping before outer merging (at most16*32 candidate rows for the merge), then admits at most32 globally per tick. Catalog identity/preparation remains Task2-owned. Short query/transaction bounds prevent a pathological catalog query from running indefinitely.
- One locked operational cursor row serializes capacity admission, pg-boss send and cursor/next-run update in the same pg-boss transaction. All normal market enqueue paths use this seam. Hard limits: minimum60s interval, maximum32 candidates/tick, maximum256 created/retry/active jobs, and an hourly per-provider/identifier slot. Retained terminal throttle suppression is handled as null send, without unbounded queue introspection or replacing the active request. Queue/transaction failure rolls back both sends and cursor.
- Retry policy is persisted explicitly: retryLimit2 (three attempts), retryDelay30s, exponential backoff capped300s, active expiry120s, waiting retention86400s and terminal deletion604800s. Cursor survives restarts and advances only through processed candidates; full capacity preserves the next unprocessed candidate. Hourly slots are database buckets, not a rolling per-token rate limiter or budget guarantee.
- Opt-in `WorkerRegistry.registerCancellable` forwards pg-boss's actual job.signal; existing one-argument handlers retain their invocation contract. Provider `fetch` accepts optional signal context while remaining compatible with one-argument providers. `MarketRequestPermit` is only the future adapter injection contract; no real limiter or adapter was added.
- Lifecycle aborts market work before other cleanup, stops production, waits for handler/transaction settlement, then stops queue and disconnects databases. Concurrent stop calls share the same promise. Synchronous or asynchronous stop failure still attempts independent cleanup, but unsettled market work prevents DB disconnect. A15s settlement watchdog reports failure; it does not pretend to stop an uncooperative transport.
- Worker uses a dedicated Prisma client with2s connection acquisition/maxWait and10s transaction timeout; market SQL uses LOCAL statement/lock/transaction limits. The shared pg-boss pool also gets explicit2s connection acquisition. Handler pretransaction signal budget45s and fetch signal budget30s precede bounded ingestion. Numeric graceful bounds depend on actual cancellation/DB settlement; failure never means safe drain.
- Server config, environment example, worker dependency/lockfile, documentation and actual serial CI DB allowlist are updated. No real provider calls, credentials, subscriptions, roles, production operations, API/UI changes, push or children.

## Approved integration choices and practical costs

1. Durable cursor plus pinned pg-boss transaction/schema capability replaces a memory cursor. Cost: one operational model and explicit `pgboss.job` coupling; unsupported transaction backends fail closed. Occupancy reads only a bounded count, not job payload/output. Per-mapping lateral limits justify the active namespace/type/id index.
2. Producer lock order: prepare/release catalog locks, then dispatch-state row, then pg-boss inserts. Receipt order: provider/poll advisory, Task2 entry SHARE, variant SHARE, sorted observation identities, receipt. No catalog/collection/item lock or receipt/admission transaction spans provider HTTP. A real test mutates the catalog during a pending fake fetch.
3. `recordedAt` follows root's preferred name. Task2's empty-batch transactional validation is reused unchanged. No migration/model refactor of Task2.
4. Explicit signal context and a15s shutdown failure watchdog preserve truthful settlement semantics. Actual transport implementations must honor cancellation before activation. Existing image handler contract is unchanged; only its queue pool now has bounded acquisition.
5. Explicit verified drain-before-purge/reactivation remains the chosen replay barrier. No generation field or licensing/account framework is introduced. Task6/Phase13 must disable fetch/read across replicas, stop and drain all in-flight/queued/retry/failed/dead-letter/manual replay sources, purge provider observations/receipts/caches, and verify no old work before reactivation. Arbitrary privileged reimport of an old saved payload is outside drain-only protection.
6. Current fetchedAt is the trusted fake/legacy provider fetch-completion fallback. As root ruled during implementation, Task6 owns its optional actual-body-receipt reporting callback before parsing/permit cooldown. This task does not claim post-fetch timing proves future HTTP receipt precision.
7. Root's future distributed per-token permit design/real adapters remain Task6 work. The new permit contract must be applied to every HTTP attempt/page with server-only credential scope and independent quota/spend enforcement. Scheduler limits and receipts do not provide that protection.

## Verification evidence

Every command used pinned Node24.19.0/pnpm10.17.1 via:

`npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm ...`

Database commands sourced `../sammlerraum-test-env.sh`. Tests verify `_test` database suffix and PostgreSQL17; DB suites ran serially with `--no-file-parallelism`. No local Docker. Full logs are `logs/task-3-*` in this workspace.

| Evidence | Observed result |
|---|---|
| `task-3-red.log` | 3 meaningful handler failures against explicit unimplemented scaffold: committed/empty skip, disabled provider and interruption |
| `task-3-handler-green.log` | 3/3 pass after handler implementation |
| `task-3-signal-red.log` → `task-3-signal-green.log` | Missing opt-in cancellation API:1 failure/10 pass →11/11 pass |
| `task-3-schema-red.log` | First real PG attempt exposed Prisma's unsupported void return from advisory-lock SELECT; all5 tests failed before schema assertions |
| `task-3-schema-confirmed-red.log` | Casting the advisory function result to text reached the expected absent-receipt-table failures; this is schema-scaffold chronology, not a claim that preexisting native guards failed |
| `task-3-migrate.log`, `task-3-generate.log` | Additive migration and Prisma generation succeeded |
| `task-3-native-first-green.log` | Initial5/5 real PG receipt/native/rollback tests pass |
| `task-3-producer-first.log` | 9/9 real PG tests pass, including cap, cursor rollback, retained throttle and actual persisted retry |
| `task-3-native-expanded.log` | 13/13 pass, adding controlled advisory conflict, stale skip, native malformed rows and dedicated-connection UTC/year0001 |
| `task-3-boundaries-red.log` → `task-3-boundaries-green.log` | 2 behavioral failures for adapter request mutation and synchronous stop cleanup →14/14 pass after targeted fixes |
| `task-3-focused-first.log` | 74/74 affected worker/queue/config tests pass, including14 real PG tests |
| `task-3-affected-db.log` | 36/36 pass across final producer query,15 Task3 PG tests, finalized Task2 service/validation/registry and queue singleton integration |
| `task-3-focused-final.log` | Final focused Task3 run:76/76 pass, including16 real PG tests and reused-event/empty receipt counts |
| `task-3-workspace.log` | Normal workspace suite502 pass/195 DB-gated skipped; subsequent two added DB-only tests were run explicitly in final serial suites, not represented as normal-suite passes |
| `task-3-lint.log` | Workspace lint passes; later touched test/query files formatted separately |
| `task-3-typecheck.log` | First recursive typecheck reached web and failed on duplicate generated `.next/types/* 2.ts` declarations; worker and packages passed |
| `task-3-build.log` | Required full workspace production build passes; Next regenerated its output and removed the duplicate generated declarations without source changes/manual deletion |
| `task-3-web-types-recovery.log` | Affected web typecheck passes after regeneration |
| `task-3-types-final.log` | Final shared workspace TypeScript project passes |
| `task-3-worker-build-final.log` | Worker production bundle rebuilt successfully after final paging-query refinement |

Additional recorded failed attempts: `task-3-types-first.log` identified bounded count destructuring and mock type errors; `task-3-types-second.log` found an overloaded PgBoss type too broad for the narrow adapter and a mock signature; these were corrected and `task-3-types-third.log` passed. `task-3-composition-first.log` had25 passes plus one run-wiring fixture failure because the synthetic configuration omitted existing media limits; `task-3-run-wiring-green.log` passes with complete synthetic config. No failure is hidden or counted as successful evidence.

### Behavioral coverage and limits

- Committed retry/ACK failure preserves exact persisted poll and request and makes one fetch total; future polls use new UUIDs. The real broker retry test accelerates only its fixture's retry `start_after` after observing actual `retry` state, retaining persisted data/count/options; it does not wait30s or claim to measure real backoff duration.
- Empty success count0, duplicate input/reused upstream EVENT count1, exact9007199254740993n roundtrip, atomic injected receipt failure rollback, stale current target before fetch, immutable request conflict and native UPDATE/deletion compatibility.
- Concurrent equal commits persist one point. Concurrent conflicting valid requests wait behind an explicitly held advisory lock; `pg_blocking_pids` confirms both blocked before release, yielding one receipt winner and one conflict. No arbitrary sleep is used as proof of lock acquisition.
- Native malformed keys/UUID/request-PK mismatch, excessive external ID/count and invalid infinity time reject. Dedicated client proves outside-before/inside/outside-after backend PIDs equal, Berlin→UTC→Berlin, and year0001 receipt precision.
- Two producer instances share hard admission; active jobs consume capacity. Actual send failure after insertion rolls back queue+cursor. Completed hourly slot suppresses a new job; a recreated dispatcher resumes the durable cursor.
- Default-off/empty registry does no market DB scan/enqueue/provider work. The actual run.ts import test verifies market registration/lifecycle passed into startWorker. Enabled composition uses real pg-boss and a pending fake provider; catalog mutation proceeds during HTTP and shutdown aborts before ingestion. A separate real broker active-expiry test proves native signal propagation.
- Provider error redaction, frozen attachment request, strict private-field rejection,30s compliant transport abort, max config bounds, unsupported transaction backend failure and shared/safe worker shutdown are covered.
- No claim of live-provider readiness, real distributed token limiting, licensed read/display entitlement, purge execution, strict freshness SLA or universal exactly-once HTTP. Receipt/history retention intentionally remains explicit later policy. Operator/fleet configuration must remain coherent across producers.

## Review handoff

Review range is BASE3861f5186b1e9e905308824cfff8d5ecb7f5f3f2 through the owned Task3 source/report/evidence commit. Root-owned progress, contexts, canonical ledger and other task preparation remain unstaged. Independent review, exact-source CI and completion persistence are root gates. No known source blocker remains; deployment/adapters/licensing/retention gates above are deliberate scope boundaries.
