# Task 1 independent spec and quality review

## Spec Compliance

- ✅ Spec compliant for the approved Task 1 scope at `d101e5964f967acb8b9979db2d0ce23496db4f76`, compared with `eefd76a1d6d29c1925cc0daccfced22d02885f70`. All five brief-listed files have their required changes. The additive currency metadata, package exports and dedicated DB CI entry support the approved design without introducing providers, API/UI, FX, or a legacy purchase-money refactor.
- Money uses exact bigint arithmetic, the approved explicit DE/EN grammar and raw-length/range bounds (`packages/domain/src/money/money.ts:7`). The supplied SIX XML SHA256 is `33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff`; a read-only comparison found exactly 165 identical currency/exponent entries in the snapshot, TypeScript map and native SQL constraint (`packages/domain/src/money/currencies.ts:1`; `packages/db/prisma/migrations/20261018015303_manual_valuations/migration.sql:33`). Exponents 0/2/3/4, leading zeros, grouped examples, ISO/ICU differences and beyond-safe-number values are exercised (`packages/domain/src/money/money.test.ts:5`).
- Manual values retain MANUAL type, PER_UNIT basis and stored exponent. Inserts append; native UPDATE rejection includes no-op updates; operator DELETE and cascade erasure remain available. Composite ownership and actor FKs, actor=owner, currency/scale, amount, note and finite/year/order timestamp constraints implement the approved row invariants (`packages/db/prisma/migrations/20261018015303_manual_valuations/migration.sql:4`, `:28`, `:36`, `:58`). The combined observedAt lower bound, createdAt upper bound and observedAt<=createdAt constrain both timestamps to the approved year range.
- Actor text remains case-sensitive; only UUID entity/cursor fields normalize. Service validation prevents caller-authored identity/type/basis/exponent, bounds notes and pages, preserves bigint internally and uses strict UTC instants (`packages/domain/src/valuations/valuation-service.ts:46`, `:54`, `:65`, `:92`, `:142`).
- Parent SHARE precedes item UPDATE/SHARE with ownership/deletion revalidation. The item lock serializes the 10,000-row quota and lifecycle mutations. Actual DB clock is captured after locks; ISO-string casts and transaction-local UTC avoid the evidenced installed adapter/driver issues. History and cursors use matching observedAt/createdAt/UUID descending order (`packages/domain/src/valuations/valuation-service.ts:109`, `:145`, `:155`, `:178`).
- ⚠️ Exact-source remote CI, backup push and canonical completion are not verified by this task review. Root must verify the new exact SHA before checkoff; the report correctly does not claim those gates. The timezone regression has the minor proof-strength limitation below.

## Strengths

- Real PostgreSQL tests exercise native constraints, immutable history, trusted erasure, quota concurrency, exact ancient instants, owner privacy, lifecycle races, pagination and actual split behavior (`packages/domain/src/valuations/valuation-service.test.ts:39`, `:77`, `:224`, `:237`, `:281`, `:295`, `:329`, `:471`). Production logic is separated into a small parser, explicit metadata and a focused 210-line private service.
- Named unchanged-seam check: potential item→collection lock inversion and lifecycle race. Inspected actual item lock/update/archive/delete/split implementations (`packages/domain/src/items/item-service.ts:365`, `:476`, `:526`, `:544`, `:559`) and collection locking/deletion (`packages/domain/src/collections/collection-service.ts:100`, `:181`). Existing mutations do not introduce the suspected reverse parent lock; actual collection deletion is gated by the new parent SHARE lock.
- Named unchanged-seam check: quantity changes or split could reinterpret/copy authored history. The actual split explicitly copies item facts and selected relations without valuations (`packages/domain/src/items/item-service.ts:624`, `:629`), and quantity updates leave valuation rows untouched (`:491`). The service test verifies source retention and empty new-item history (`packages/domain/src/valuations/valuation-service.test.ts:224`).
- Named unchanged-seam check: private valuation leakage. The public query explicitly selects public item facts without valuation joins (`packages/domain/src/items/item-query.ts:46`), and the new real projection test asserts the complete public result (`packages/domain/src/valuations/valuation-service.test.ts:471`).
- Inspected actual evidence: focused 67/67 including 17 PG tests (`logs/task-1-focused-green.log:4`), existing DB regressions 44/44 (`logs/task-1-existing-db-regression.log:4`), ordinary 475 passed/168 gated skips (`logs/task-1-workspace-test.log:86`), clean typecheck/lint/build, 22 current migrations and empty represented drift (`logs/task-1-migration-status.log:10`; `logs/task-1-migration-final-diff.log:7`). Log paths are relative to this review's directory. RED/scaffold failures and subsequent corrections remain visible; final test logs have no unresolved test warnings/errors. The build log includes informational esbuild size markers on unchanged worker bundles, not a new Task 1 failure (`logs/task-1-build.log:36`).

## Issues

### Critical

- None.

### Important

- None.

### Minor

- `packages/domain/src/valuations/valuation-service.test.ts:302`: the UTC-restoration test checks the outside connection PID before/after but reads only the timezone inside the transaction. With multiple pooled connections, it does not explicitly prove the transaction ran on the same backend whose restored state is asserted. Include `pg_backend_pid()` in the in-transaction observation and assert all three PIDs match, or use a dedicated single-connection client. This strengthens the intended regression proof; the production `set_config(..., true)` at `valuation-service.ts:150` is correctly transaction-local. Named focused seam inspected: the test client delegates to the shared Prisma client (`packages/db/src/test-database.ts:24`), and the suite itself exercises concurrent transactions.

## Assessment

**Task quality: Approved.** No Critical or Important defect found. The implementation matches the approved private manual-money/history design, with native invariants and substantive real-DB tests; the minor item concerns regression-test precision.

Review used the supplied diff in functional passes and focused unchanged producer/consumer checks. No diff was re-derived, no source/branch/index/database mutation was performed, no children were dispatched, and no passed test suite was rerun. Only this review report was written. Cross-task external-observation types, future bigint JSON DTOs and Phase09 collaborative-author/erasure policy remain intentionally outside Task 1.
