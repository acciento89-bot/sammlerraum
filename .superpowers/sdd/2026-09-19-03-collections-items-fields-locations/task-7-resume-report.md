# Task 7 resume report

Status: implementation candidate, pending full remote CI and independent rereview. Do not check off Task 7 yet.

## Commits

- `2adba0d`: fixed two reproduced TypeScript errors (callback return inference and optional `Intl` fraction digits). The controller published the identical tree as remote `680d759`.
- `acaba87`: narrowed browser error locators away from Next's route announcer and compared canonical tags without assuming API ordering. The controller published the identical tree as remote `6fdc079` for a test-only RED run.
- `22d5b71`: production fixes for remaining browser review findings. The controller will publish the candidate tree; no local push was made.

## Evidence and review findings

Frozen pnpm 10.17.1 installation succeeded. Before the first fix, local web typecheck reproduced precisely `collections-items.spec.ts:616` TS2322 and `item-form-values.ts:9` TS2322. After the fixes, focused item-form-values tests passed (12), workspace tests passed (233; 20 database-dependent skips), and workspace lint, typecheck, and build passed using the complete CI environment. The first local build attempt omitted `UPLOADS_DIR` and failed at page-data collection; the rerun with the CI setting passed.

Remote CI `36311729901` passed installation, migrations, 233 unit tests, lint, typecheck, build, database integration, and all authentication journeys before the Task 7 browser RED. All 12 management cases failed on the pre-production-fix tree: nested node reset to null (R1), native list semantics absent (R6), failed core save lacked a recoverable alert and rejected metadata stranded the form (R4), and concurrent scanner start acquired two streams (R8). The R9 test hit a strict locator collision with Next's route announcer before its zero-write assertion; the test-only `6fdc079` run will establish that exact assertion. The comma-tag assertion also found API sorting, not loss of the comma-containing tag; the test now compares sorted values.

R2/R3/R5/R7 were already addressed in prior focused scalar tests: ISO minor-unit currency handling, full integer conversion, escaped comma-tag round trips, and localized saved values. This round makes node selection controlled and blocks stale collection-dependent options (R1); catches collection/item transport failures, settles all metadata requests, preserves a successful location baseline, and releases saving in `finally` (R4); uses native nested lists and disclosure controls rather than incomplete ARIA tree roles (R6); guards synchronous camera startup and disposes late streams (R8); and validates every custom field before issuing the core or metadata mutation (R9).

Local PostgreSQL, Docker, and Chromium are unavailable, so the production candidate still requires the remote Task 7 desktop/mobile browser journeys, database integration, Docker gates, and independent rereview. No full green CI or rereview verdict is claimed here.
