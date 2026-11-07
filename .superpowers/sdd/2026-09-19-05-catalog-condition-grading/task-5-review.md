# Task 5 review — 5d20456..04e41d4

## Spec Compliance

- ✅ Spec compliant with the binding approved Task 5 design. The required schema and grading service/test files are present; private current-record CRUD, exact authored numeric semantics, provider-scoped owner-local certificate identity, single-specimen enforcement, and condition separation are implemented. Evidence: `packages/contracts/src/grading.ts:16`, `packages/db/prisma/migrations/20261017225204_grading_records/migration.sql:27`, `packages/domain/src/grading/grading-service.ts:50`, `packages/domain/src/grading/grading-service.ts:120`, `packages/domain/src/items/item-service.ts:460`, `packages/domain/src/items/item-service.ts:539`.
- ✅ Reviewed the explicitly approved scope extensions and deferrals: owner routes/contracts and shared quantity checks are necessary integration; immutable audit and trash/restore recovery remain later-phase work. The report's Phase 09 integration-task cross-reference is already assigned to the controller for correction and is not an implementation finding (`task-5-report.md:27`).

## Strengths

- Native ownership and quantity enforcement complements the shared item lock: the composite foreign key uses ON UPDATE RESTRICT, while the child CHECK fixes quantity at one. Direct SQL cannot leave grading attached to a quantity item (`packages/db/prisma/migrations/20261017225204_grading_records/migration.sql:33`, `packages/domain/src/grading/grading-service.ts:50`, `packages/domain/src/items/item-service.ts:375`).
- Certificate identity preserves authored values and scopes uniqueness to owner/provider/certificate, permitting independent accounts and multiple NULL certificates. The added finite bound also rejects PostgreSQL numeric NaN (`packages/db/prisma/migrations/20261017225204_grading_records/migration.sql:27`, `packages/db/prisma/migrations/20261017225205_grading_finite_comparable/migration.sql:3`).
- Strict full-replacement contracts, explicit comparable scales, bounded UTF-8 bodies, live-session flags, Origin checks, and explicit private DTO projections form a coherent boundary (`packages/contracts/src/grading.ts:31`, `apps/web/src/lib/grading-routes.ts:23`, `apps/web/src/lib/grading-routes.ts:50`, `packages/domain/src/grading/grading-service.ts:62`).
- Real PostgreSQL tests exercise persisted equal-number/different-provider records, actual item service quantity writes, observed lock waits, native FK races, retained soft-delete reservations, condition independence, and public DTO exclusion (`packages/domain/src/grading/grading-service.test.ts:52`, `apps/web/src/lib/grading-routes.integration.test.ts:1`).

## Issues

- Critical: none.
- Important: none.
- Minor: none.

## Checks and scope

- Read the supplied complete review package in sequential sections; recovered only the initial tool-truncated log evidence. No regenerated diff, Git commands, source edits, suite reruns, or extra tests.
- Named risk: the shared item quantity/lifecycle methods might use a different lock or erase grades. Read the cut-off item lock/update/lifecycle context: `packages/domain/src/items/item-service.ts:336`, `packages/domain/src/items/item-service.ts:444`, `packages/domain/src/items/item-service.ts:494`, `packages/domain/src/items/item-service.ts:512`. Item mutations use the same row lock; soft deletion updates the item without deleting grading facts. Also inspected the focused collection deletion seam at `packages/domain/src/collections/collection-service.ts:181`; collection visibility remains checked by the grading query.
- Named risk: inherited helpers could weaken the new strict body, error-cache, or real-calendar guarantees. Checked `apps/web/src/lib/api/read-bounded-body.ts:4`, `apps/web/src/lib/api/route-handler.ts:19`, and `packages/contracts/src/items.ts:37`. The stream is counted independently of Content-Length, errors remain no-store, and calendar input is checked against a UTC date round trip.
- Reviewed supplied final evidence: 67 files / 490 tests passed, clean final test output, successful lint/typecheck/production build, 20 applied migrations and no schema drift (`logs/task-5-full-suite-final.log:74`, `logs/task-5-lint-final.log:1`, `logs/task-5-typecheck-final.log:1`, `logs/task-5-build-final.log:1`, `logs/task-5-migration-status.log:6`, `logs/task-5-schema-drift.log:3`; log paths are relative to this report's directory). Earlier failed fixture/typecheck attempts are transparently distinguished from final results. Exact-source CI and Task 7 browser integration remain controller-owned, as approved.

## Assessment

**Task quality: Approved.** The implementation keeps private authored facts separate from condition/catalog data and enforces the physical identity invariant in both service transactions and PostgreSQL. The supplied behavioral and concurrency evidence supports the task-scoped approval; no Critical, Important, or Minor findings.
