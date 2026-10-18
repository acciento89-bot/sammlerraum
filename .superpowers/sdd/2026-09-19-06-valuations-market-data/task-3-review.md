# Task 3 independent SPEC + QUALITY review

## Spec Compliance

- ✅ Spec compliant for Task 3 at HEAD `8b15141a053711594f1d1ed28560c92b13da4373`, relative to BASE `3861f5186b1e9e905308824cfff8d5ecb7f5f3f2`. The implementation follows the brief plus the superseding implementation GO and binding root rulings in `task-3-context.md`.
- The strict persisted request and canonical equality reuse Task2 validation (`packages/domain/src/market-data/market-data-service.ts:277`); the handler checks successful receipts before catalog validation or provider fetch (`apps/worker/src/jobs/sync-market-data.ts:58`). Equal committed polls return; conflicting requests are classified terminal skips. Poll UUIDs are prepared before queue insertion (`apps/worker/src/jobs/market-sync-dispatcher.ts:111`).
- Receipt recheck, advisory serialization, Task2 ingestion, and successful receipt insertion are in one transaction, including empty success and deduplicated observation count (`apps/worker/src/jobs/market-sync-repository.ts:43`). LOCAL UTC and SQL deadlines are explicit (`apps/worker/src/jobs/market-sync-repository.ts:20`). The additive native migration validates request shape/identity/count/time and rejects every UPDATE while permitting DELETE (`packages/db/prisma/migrations/20261018025000_market_sync/migration.sql:17`).
- The real producer uses an explicit supported-provider mapping set, bounded keyset candidate selection, a persisted cursor, shared row locking, nonterminal capacity count, caller-owned transactional pg-boss insertion, hourly singleton policy, and conservative hard configuration limits (`apps/worker/src/jobs/market-sync-dispatcher.ts:11`, `:47`, `:91`, `:127`). No network request occurs in those transactions. Production composition exists in `apps/worker/src/run.ts:29`, and remains default OFF with no real adapters (`packages/config/src/server.ts:44`, `apps/worker/src/jobs/market-sync-runtime.ts:21`).
- Native queue signals reach only opt-in handlers while existing payload-only invocation remains intact (`packages/queue/src/runtime.ts:31`, `:91`). Provider cancellation is additive and preserves one-argument compatibility (`packages/market-data/src/types.ts:45`). Runtime shutdown tracks actual handler settlement, aborts first, shares one stop promise, and does not treat its watchdog as settlement (`apps/worker/src/jobs/market-sync-runtime.ts:35`, `:59`). Worker cleanup attempts independent steps and withholds Prisma disconnect after market failure (`apps/worker/src/main.ts:58`).
- Connection acquisition and Prisma transaction defaults are bounded for the dedicated market client (`packages/db/src/create-client.ts:4`); the real queue pool also has explicit acquisition bounds (`packages/queue/src/index.ts:10`). Retry/backoff/expiry/retention are explicit in the producer, and tests inspect their persisted broker representation.
- ⚠️ Fresh exact-source CI is a controller gate and was not available in this review package. CI does register the new real PostgreSQL suite (`.github/workflows/ci.yml:145`), and the supplied final serial local evidence passes it. This review does not claim a new CI result.
- ⚠️ Task2's internal entry-before-variant locking, observation validation, currency rules, and history semantics are inherited through its existing transaction-scoped service; the limited Task3 diff does not expose their full bodies. I did not broaden this task gate into another Task2 audit. The Task3 repository calls the approved service directly, and supplied affected-domain evidence reports its existing tests passing.
- Task6's actual HTTP receipt callback, distributed credential-scoped permit, adapters, fetch/read entitlement, and authorized fleet-wide drain/purge/reactivation runbook remain explicit later gates (`packages/market-data/README.md:26`, `:55`). Current fetchedAt is honestly documented as fetch-completion fallback. No exactly-once HTTP, live-provider readiness, license/payment subsystem, API/UI implementation, or authorized purge is claimed.

## Strengths

- The receipt is a genuinely atomic success record rather than a prematurely written status marker. Both pre-fetch and post-serialization equality checks are present, and returned unique IDs supply the count rather than input array length (`apps/worker/src/jobs/market-sync-repository.ts:34`, `:43`).
- Admission is transactional with the durable cursor, including nullable singleton suppression and rollback after a successful insert followed by failure (`apps/worker/src/jobs/market-sync-dispatcher.ts:127`). It avoids holding catalog locks across HTTP and avoids a per-process-only capacity limit.
- Cancellation awaits the actual fetch promise and bounded ingestion transaction; it does not mistake a raced timeout for stopped transport. Provider exception contents are replaced with constant broker errors, and adapters receive a frozen request copy (`apps/worker/src/jobs/sync-market-data.ts:70`, `:98`).
- The real PostgreSQL suite covers committed retry after catalog change, empty/reused counts, bigint values beyond Number precision, receipt rollback, native UPDATE rejection, controlled advisory conflicts, UTC restoration/year0001, real broker retry identity, admission capacity/rollback, durable cursor, and active-expiry signals (`apps/worker/src/jobs/market-sync.integration.test.ts:1`). The tests exercise actual queue/database seams rather than relying exclusively on mocks.
- Actual run composition is independently exercised by an import-level wiring test, default-off behavior is tested, and shutdown failure tests assert that the database remains connected (`apps/worker/src/run-wiring.test.ts:49`, `apps/worker/src/run.test.ts:6`, `apps/worker/src/main.test.ts:144`).

## Issues

### Critical

None found.

### Important

None found.

### Minor

1. `.superpowers/sdd/2026-09-19-06-valuations-market-data/logs/task-3-worker-build-final.log:7`: the successful final worker build still emits esbuild's size warning for the 7.0 MB worker bundle (and also for the maintenance bundle at line 15). This does not demonstrate a functional defect, and the maintenance warning is not attributed to Task3. Treat the build output as successful with a nonblocking size warning, rather than pristine; a later bundle-size baseline would make future growth reviewable.

## Evidence and review limits

- Read the brief first, then approved context/rulings, implementer report, and the complete supplied 189413-byte review package. The package was read in sequential chunks; one tool-truncated log span was recovered. No git regeneration or broader source crawl was performed.
- The final focused evidence in `logs/task-3-focused-final.log:4` reports 76 passing tests across seven files, including 16 real PostgreSQL tests. `logs/task-3-affected-db.log:5` reports 36 passing affected tests. These results were checked against the behaviors present in the reviewed test code, not treated as proof by assertion.
- The report and package preserve meaningful initial failures and corrected failures. The final focused test output has no reported warnings or unhandled errors. Earlier composition-fixture unhandled rejection and generated-web-type failure are explicitly recorded with subsequent successful evidence; neither is represented as a passing attempt.
- No tests were rerun: the code review raised no specific unanswered behavioral doubt requiring a new test, and the controller owns fresh exact-source CI.
- One changed-file continuation was read: `apps/worker/src/main.ts:111` through its end, because the supplied hunk cuts `startWorker` off before its return and startup-failure cleanup. This confirmed startup failure calls the shared stop path before rethrowing (`:124`). No other changed source file was reopened.
- One focused outside-diff risk check: whether calling queue stop after market watchdog failure could forcibly close the producer's still-owned SQL connection. Inspected pinned pg-boss 12.33.2 `dist/index.js:185` and `dist/db.js:52`, `:247`. Stop awaits database close; close awaits `pool.end()`, while the caller-owned transaction retains its checked-out client until settlement. This check did not substantiate a forced-disconnect defect. It also does not establish a universal shutdown duration for an uncooperative transport/network.
- No source, schema, index, HEAD, branch, DB, provider, queue, or external system was mutated. Only this reviewer-owned report was written.

## Assessment

**SPEC:** Approved for the scoped Task3 requirements; inherited Task2 internals and fresh exact-source CI remain the verification limits above.

**QUALITY:** Approved. **Counts: 0 Critical, 0 Important, 1 Minor.**

The implementation keeps success identity, catalog attachment, queue admission, and shutdown settlement in explicit, reviewable boundaries. Its tests provide meaningful transaction and broker evidence, while the documented future activation gates accurately limit what this task establishes.
