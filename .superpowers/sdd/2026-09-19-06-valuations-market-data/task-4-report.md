# Phase06 Task4 implementation report

Status: implemented and locally verified; awaiting root independent SPEC/QUALITY review and exact-source CI. Independent SPEC/QUALITY review, exact-source CI, completion checkoff, push and main synchronization remain root gates. BASE `c7a4030feda9b719d6d218d610783388f98a9c4e`. Source work began around03:25UTC18October2026; verification finished around03:48UTC, within the45-minute checkpoint threshold. Root approved the concrete RepeatableRead adjustment during implementation; other approved design rulings remain intact. No children or live-provider actions.

## Delivered

- Strict valuation contracts moved forward from Task5: canonical decimal-string amounts through PostgreSQL bigint maximum, stored currency/exponent, separate point/range price, source/kind/qualifier/confidence metadata and original/current catalog provenance. Manual notes count trimmed Unicode codepoints, preserve authored normalization, accept2000 astral characters and reject NUL/lone surrogates. Canonical year0001..9999 UTC instants survive roundtrips. Unknown fields are rejected. Historical response currencies are not reinterpreted against current currency membership; new manual writes still pass the pinned domain currency helper.
- Actual owner `/api/v1/items/[itemId]/valuations` GET summary/source-history and POST manual routes, dedicated dependency composition and thin Next exports. Fresh uncached/unrefreshed sessions, server-authored actor, existing same-origin POST rule, bounded streamed fatal-UTF8 JSON and no-store success/errors. POST appends through the unchanged manual service, preserving lifecycle/quota/backdated/per-unit semantics.
- GET returns manual latest independently of the requested manual-history page. External grouping is provider+semantic namespace/type/value+kind+currency. Group pages default4/max8, initial source history5, manual/source pages default20/max100, all with bounded keyset continuations. `aggregate` is always null. `currencyConflict` includes latest manual plus **all** eligible external groups in the chosen scope, independently of both page cursors; historical manual page currencies do not change the headline.
- CURRENT_MAPPING retains older observation revisions only for exactly matching current active semantic mappings. HISTORICAL_MAPPING is explicit and grant-controlled for verified retained mappings of the item's still-current exact entry/optional variant. Replaced identifier UUIDs retain original provenance and explicit flags. Entry-null-variant never includes other variants, and an old item link cannot be recovered by editing a selector. Source/group context changes produce409; malformed/cross-item tokens400, unavailable/unentitled sources404.
- Private explicit DTO projection excludes owner/actor IDs, purchase, grading, receipt/poll/event identities and raw provider payloads. The anonymous item projection remains unchanged and is exercised after real owner POST. No user GET invokes provider fetch, queue dispatch or catalog mutation.
- Narrow trusted MarketDisplayPolicy is independently default empty. Per-request grants are copied/frozen, max8, checked against explicit registry identities and namespace/type; duplicates/unknown/inconsistent grants fail closed. Historical permission is independently checked. Production composition supplies no grants or providers. Tests inject trusted policy and ingest real fake-provider facts through Task2 rather than return invented summary DTOs.

## Approved coherence adjustment and budgets

Root explicitly approved bounded **RepeatableRead** instead of the proposed single composite SELECT. The reason is concrete: historical eligibility and off-page currency diversity must use canonical CatalogSnapshotSchema validation, which would otherwise require duplicating the schema inside complex SQL or trusting unvalidated hidden candidates. The cost is more bounded query roundtrips and possible serialization retries; the coherent-response guarantee remains.

- One RepeatableRead MVCC snapshot covers current catalog/live mapping state, manual latest/history, historical snapshot validation, source groups/history and diversity. Each encountered revision is validated once with a transaction-local cache, plus exact identity/category/variant/identifier coherence checks. Invalid retained snapshots cannot affect either visible rows or hidden diversity; invalid current canonical state is an invariant failure.
- Ownership discovery, Collection SHARE, then item SHARE; no catalog locks. A native item move or parent deletion after snapshot creation produces a serialization retry that releases the old transaction and restarts discovery. Only known SQLSTATE40001 is retried, maximum3 complete attempts. Deadlock/ambiguous P2034, ordinary timeout, malformed input and invariant failures are not retried.
- Actual production route uses the finalized bounded Prisma factory:2s connection acquisition/maxWait. GET overrides each interactive transaction to <=5s and establishes LOCAL UTC, <=2s statement,500ms lock and <=5s PostgreSQL transaction limits. A monotonic12s overall processing/acquisition/retry budget clamps remaining attempt budgets; each query/candidate loop checks it. Additional10,000 work-step and1024 cached-revision ceilings fail503 rather than yield false/empty results. No general deadline subsystem was added.
- These are processing/DB budgets, not a universal whole-HTTP5s guarantee: authentication, response transfer, scheduling and rollback/connection settlement add time. `readAt` is captured once from database transaction start time, not a snapshot LSN or cross-request frozen version. Pages remain live keyset traversals; catalog context changes require refresh.
- Request body16KiB, encoded query8192bytes, manual token512bytes, other tokens2048bytes/decoded1536bytes, final UTF8 JSON2MiB. A real maximum manual100+latest response with2000 maximally escaped note characters and8 source groups of5 large-metadata rows measured1,419,287bytes. Oversized/invariant response fails sanitized500; DB budget/dependency failures return `VALUATION_UNAVAILABLE`503.

## Additive index and actual plan evidence

Migration `20261018033424_valuation_source_history` adds only `MarketObservation_source_history_idx` on entry, optional variant, provider, semantic namespace/type/value, kind, currency, observedAt DESC, createdAt DESC,id DESC. Existing migrations/indexes remain unchanged. It was applied once to owned PostgreSQL17/sammlerraum_test; Prisma generation succeeded. No reset/purge/production operation.

The native test creates eight valid semantic sources through canonical maintenance and Task2 ingestion, then expands valid native rows to8,008 observations. It captures EXPLAIN ANALYZE/BUFFERS for the **actual executed query templates**, without forcing planner settings.

- Before the index, group discovery scanned8,008 rows and sorted,230 buffer hits; the sample source page scanned1,001 matching rows and sorted. These exposed the need for the index.
- Initial post-index plans still sorted because the ORDER BY omitted the fixed nullable prefix. That was not accepted as success. Explicit complete index-prefix ordering fixes the PostgreSQL ordering inference while preserving the same keyset semantics.
- Final representative plans use a one-row Index Only Scan for each group seek, a six-row Index Scan for the initial source page, and the existing kind/currency history index for explicit lower/upper currency probes. Sample group/source scans use4 buffer hits; there are no Sort/Seq Scan nodes in these captured paths. The test also captures a continued group seek. Times in these small fixtures are evidence, not production latency/work guarantees.
- Arbitrarily large retained histories or ineligible historical rows can require more candidate validation. They remain budgeted and may produce503. No DISTINCT+LIMIT/count-all/all-history materialization or persistent summary framework is used.
- Task2's nonblocking optional-filter provider-wide chronological list performance note remains unconsumed; Task4 does not call that service method. No speculative provider-wide chronological index was added.

## Verification evidence

All commands used pinned Node24.19.0/pnpm10.17.1 via `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm ...`. Native commands source `../sammlerraum-test-env.sh`, guard owned `_test`/PostgreSQL17 and run serially with `--no-file-parallelism`. Both new native suites are registered in the actual CI allowlist. Logs are `logs/task-4-*`.

| Evidence | Result |
|---|---|
| contracts-red → contracts-green | Four meaningful strict-validation/default failures →5/5 pass |
| query-confirmed-red → query-first-green | Real ingested off-page mixed currency fails false→true;1/1 pass |
| routes-red → routes-green | Actual route scaffold501 fails four behaviors →14 combined native tests pass |
| coherence-red → plans-before-index (other tests) | Found pagination-dependent availability, fixed it; malformed retained snapshot and concurrent catalog/ingestion coherence pass |
| plans-before-index → plans-after-index → plans-prefix | Missing index expected failure; initial index still sorted; final complete-prefix queries use direct index paths |
| range-red → range-green | Malformed range refinement threw on bogus bigint; guarded refinement and precision invariants now pass6/6 contracts |
| snapshot-coherence-red → snapshot-coherence-green | Structurally valid duplicate historical identifiers affected eligibility; explicit coherence validation now excludes them |
| concurrency / bounds / serialization | Real append blocking proven by pg_blocking_pids, lock timeout503, native move/delete serialization retries, UTC/year0001, token/permission boundaries and response size pass |
| routes-expanded-green / precheck-native | Actual thin wiring, real ingestion/source-history, default-off display, privacy, fatalUTF8/stream/body limits, quota409 and sanitized dependency503;31/31 native tests |
| affected-final |67/67 pass across new contracts/query/routes plus existing manual and market services |
| workspace |508 passed,228 DB-gated skipped; skipped tests are not claimed as native verification |
| lint |Full workspace lint passes |
| generate / migrate |Prisma generation and the one additive migration succeed |
| build → build-recovery |Initial full build exited1 on the DOM test-body type; final full production workspace build exits0 and includes the valuation route |
| typecheck-final → typecheck-recovery |Initial recursive run exited2 on the same DOM fixture issue; final full recursive typecheck exits0 |

Exit outcomes: every successful run in this table exited0. Expected behavioral RED/index-absence failures and other failed Vitest attempts exited1; initial/failing TypeScript runs exited2; the failed build exited1. The empty `types-third` and `types-fourth` logs correspond to confirmed exit0, not an inferred success. The final raw-byte recovery case passes1 test with7 deliberately filtered skips.

Additional failed attempts, preserved rather than counted as evidence: the first red log redirect preceded creation of `logs/` and exited1; `query-red` had a missing mandatory German category label plus cleanup of an unset category ID; `query-expanded` used a nonexistent variant-removal helper, replaced with actual canonical rollback; types-first had two recursive inference annotations, types-second had an unknown JSON response fixture type, types-third/fourth pass. `routes-expanded` required the web package's explicit market-data test dependency; after adding it, `routes-expanded-retry` reached behavior but cleanup failed because unlink intentionally preserves category. Cleanup now deletes its exact fixture item first; the single orphan fixture category from that failed attempt was removed by exact UUID+key (`fixture-cleanup`). `build` uncovered Node-only versus DOM Uint8Array<ArrayBufferLike> typing; a copied ArrayBuffer retains the tested raw bytes. The corrected raw-byte case passes in `body-types-recovery`; only the test Request body construction changed. No existing application source was changed to suppress any failure.

Raw command logs retain their original terminal whitespace, including blank final lines and progress-line spaces. Source/report staged whitespace checks pass when raw logs are excluded.

## Remaining gates and scope

Root owns independent review, exact-source CI and persistence. Actual paid provider activation, licensed display/retention, operational read/fetch drain-before-purge/reactivation and real adapters remain later gates; this task supplies none of those permissions. Task5 can consume the exported strict contracts and real owner API. No UI, worker, public comparison, provider network request, FX/blending, source push, deployment or canonical progress checkoff was performed.
