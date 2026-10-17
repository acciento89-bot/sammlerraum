# Task 3 implementation report

Status: implementation ready for controller review and exact-source CI. No canonical completion checkbox, push, merge, deployment or live role grant performed.

Base: `911e0cc7eb9fcb4e3b08611f443ddbd18e22dd2b` on `work/sammlerraum-v1`, producer source `b1ce8ea` as approved by root. All commands ran from the existing feature checkout. PostgreSQL 17, localhost5432, `sammlerraum_test`; environment loaded with `source ../sammlerraum-test-env.sh`. Pinned command prefix below is `npm exec --yes --package=pnpm@10.17.1 -- pnpm` (abbreviated `PNPM` in the command table).

## Delivered behavior

- Strict proposal contracts support `CREATE_ENTRY`, `UPDATE_ENTRY`, `ADD_VARIANT`, `UPDATE_VARIANT`, `ADD_IDENTIFIER`, `UPDATE_IDENTIFIER`, `REMOVE_IDENTIFIER`, using producer validators. New entries require deliberate null target/base; approval assigns the actual entry/revision1. Catalog UUID inputs normalize lowercase; authored identifiers and BetterAuth account IDs preserve case.
- Persisted proposals retain proposer, target/base, operation payload, summary, source/license provenance, pending/approved/rejected/conflict state, moderator/time/reason and resulting canonical revision FK. Separate rollback audit retains actor, expected/target/result revisions, reason and time. No user email/profile relation is loaded into catalog/proposal responses.
- ApplicationRoleGrant is independent of collection roles. MODERATOR and ADMIN are checked from authoritative database facts under `FOR SHARE` in the same protected transaction. Approval/rejection/review/rollback require this fact; cached session role claims, posted role booleans and account email are irrelevant. Absent grants deny; ordinary SQL UPDATE/DELETE cannot revoke an in-flight transaction's already acquired authority until it commits.
- Transaction ordering is authority row, proposal `FOR UPDATE`, target entry `FOR UPDATE`, shared canonical mutation seam. One proposal decision applies once; concurrent different proposals against one base produce one approval and one committed conflict. Stale-base conflict is an explicit transaction outcome; only the public wrapper throws `CATALOG_PROPOSAL_CONFLICT` after commit. Other canonical validation failures leave PENDING. Enclosing transaction rollback reverts canonical and proposal changes together.
- Minimal supporting canonical update/remove identifier commands retain UUID/snapshot history, check CAS, enforce same-entry and variant scope, reject duplicate active tuples, and retire removed rows without deleting historical snapshots. They reuse the producer `mutate`/persist logic; no second canonical persistence implementation.
- Authenticated users submit/read only their own proposals. Moderator review has separate private list/detail routes. Missing/foreign personal IDs return hidden404; role denial is403. Mutations enforce exact Origin before body consumption, fresh authoritative sessions with cookie cache/refresh disabled, streamed byte limits, strict body/query/UUID/cursor validation and standard redacted request-ID envelopes. Private/review responses are no-store.
- Approved fixed bounds: 20 pending/user, 50 submissions/rolling24h/user, 10000 retained/user; 64KiB UTF-8 proposal JSON at HTTP and domain boundaries; summary500, reason1000; list default20/max50 with bounded timestamp/UUID keyset cursor. Submission quota count+insert is serialized by a separate namespaced actor advisory lock. No User row is locked FOR UPDATE.
- Submission through a custom enclosing transaction explicitly checks active transaction isolation. Only ReadCommitted is accepted; RepeatableRead/Serializable fail before quota counting/writing with `CATALOG_PROPOSAL_ISOLATION_UNSUPPORTED`. The public wrapper sets ReadCommitted. This prevents a preestablished snapshot bypassing the quota after waiting for the actor lock.
- Operator-only parameterized SQL setup/revocation and bounded grant audit metadata are documented in `docs/catalog-moderation-operations.md`; no role HTTP surface or real-account action. Current grant, proposer, moderator and rollback-actor FKs restrict account deletion: removing an account cannot erase canonical provenance/audit records. Grant deletion removes authority without removing earlier attribution. Grant table stores current metadata; operator change history belongs in operator logs.

## Approved rollback exception and provenance semantics

A rollback that changes real canonical content creates a new monotonic immutable revision. Per root's explicit clarification, restoring a byte-equivalent snapshot preserves Task2 no-op revision and rollback metadata. It still records a separate successful rollback audit with actor/reason/requested target/current result. CAS runs first; a stale rollback creates no successful audit. PostgreSQL tests verify both the real restoration and no-op exception.

Proposal `source` is retained review provenance. Canonical operation payload `sources` fields determine canonical provenance changes; separate submission source is not silently appended to authored canonical data. Translations remain explicitly authored; no automatic translation or URL fetch occurs.

## TDD evidence and chronology

1. Original task-specific behavioral RED was captured early, before implementing the decision path. The additive schema, synthetic fixtures and minimal runnable approve scaffold existed; the scaffold returned an unchanged proposal. The actual stale-base scenario advanced the catalog from revision1 to2, approved the stale proposal, and asserted both the public conflict error and committed CONFLICT metadata plus unchanged canonical revision2/no revision3. RED failed on the missing conflict error and PENDING instead of CONFLICT; fixture setup and canonical assertions succeeded. `logs/task-3-stale-red.log`.
2. Implemented real authority/locking/decision outcome+public wrapper. The same unchanged behavioral test passed. `logs/task-3-stale-green.log`.
3. The supporting reference-command test initially failed because `updateExternalIdentifier` did not exist, then passed after implementation. This is API-surface RED, not a separate claim of behavioral stale-revision RED. `logs/task-3-reference-red.log`, `logs/task-3-reference-green.log`.
4. Root requested a fail-closed isolation guard after review of the composable submission boundary. A new real-PG RED first established a RepeatableRead snapshot at19 pending, committed a separate public submission bringing actual count20, then submitted through the older transaction. Without the guard it succeeded and committed21; assertions failed for missing unsupported-isolation error and actual21 vs expected20. `logs/task-3-isolation-red.log`. Added narrow current_setting guard; same scenario now rejects without insertion, count remains20, and Serializable is also rejected. `logs/task-3-isolation-green.log`.
5. Expanded contract, HTTP and PostgreSQL regressions were added as implementation developed; they are not represented as independently captured initial RED for every new method. No later mutation exercise is claimed as original tests-first chronology.

## Verification commands and exact results

Each `PNPM` below expands to the pinned prefix stated above; the shell sourced the test environment first. Logs are in `.superpowers/sdd/2026-09-19-05-catalog-condition-grading/logs/`.

| Command | Result | Log |
| --- | --- | --- |
| `RUN_DATABASE_INTEGRATION=1 PNPM vitest run packages/domain/src/catalog/proposal-service.test.ts` before implementation | Behavioral RED, 1 failed as expected: missing conflict error and committed CONFLICT | task-3-stale-red.log |
| Same original test after implementation | 1 passed | task-3-stale-green.log |
| `RUN_DATABASE_INTEGRATION=1 PNPM vitest run packages/domain/src/catalog/proposal-service.test.ts -t 'rejects unsupported submission isolation'` before guard | Behavioral RED, unsupported isolation wrongly succeeded; count21 instead20 | task-3-isolation-red.log |
| Same isolation test after guard | 1 passed, 15 unrelated tests skipped by the name filter | task-3-isolation-green.log |
| `RUN_DATABASE_INTEGRATION=1 PNPM vitest run packages/domain/src/catalog/proposal-service.test.ts packages/domain/src/catalog/catalog-service.integration.test.ts apps/web/src/lib/catalog-proposal-routes.integration.test.ts packages/contracts/src/catalog-proposals.test.ts apps/web/src/lib/catalog-proposal-routes.test.ts apps/web/src/lib/media-routes.test.ts` | 50/50 passed across6 files before isolation test addition; pristine output | task-3-focused-final.log |
| `RUN_DATABASE_INTEGRATION=1 PNPM test` | 450 passed, 1 failed: inherited parallel shared-database worker fixture interference, detailed below | task-3-full-suite.log |
| `RUN_DATABASE_INTEGRATION=1 PNPM vitest run apps/worker/src/jobs/image-repository.integration.test.ts` | 2/2 passed in isolation | task-3-worker-isolated.log |
| `RUN_DATABASE_INTEGRATION=1 PNPM test --no-file-parallelism` | Final exact-source 452/452 passed across63 files, no warnings/errors; exit0 | task-3-full-suite-isolation-final.log |
| `PNPM lint` | Final exact-source all workspace packages passed; exit0 | task-3-lint-isolation-final.log |
| `PNPM typecheck` | Final exact-source all workspace packages passed; exit0 | task-3-typecheck-isolation-final.log |
| `NODE_ENV=production PNPM build` | Final exact-source production build passed, including all six catalog route paths; exit0 | task-3-build-isolation-final.log |
| `node node_modules/prisma/build/index.js migrate status` from packages/db |17 migrations, database up to date | task-3-migration-status.log |
| `node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` from packages/db | Empty migration, exit0 | task-3-schema-drift.log |
| Source diff whitespace check (excluding exact raw logs and emitted/applied SQL) | Passed; raw tool logs/SQL preserve their original trailing blank lines/whitespace | Checked directly before commit |

Final PostgreSQL coverage includes all seven operation kinds; authored sources/translations; spoofed session roles and foreign actors; hidden own reads; stale error plus committed state; same-proposal replay/concurrency; competing target proposals; rollback of canonical+decision under an enclosing transaction; non-stale semantic failure; real role revoke blocking and subsequent denial; deletion restrictions retaining provenance; real/no-op rollback audits/CAS; strict malformed/private payloads; keyset pagination; all three quota ceilings and atomic pending capacity; unsupported-isolation snapshot bypass; identifier target/variant scope, UUID normalization, collision and inactive history retention. HTTP tests use real PostgreSQL services and synthetic session injection at the route factory; they do not perform OAuth/SMTP/provider actions.

## Failed attempts and supporting harness ruling

- Initial domain typecheck exposed a direct `@prisma/client` type import from a package without that direct dependency. Fixed by exporting a type-only record alias through the existing database type seam. Two later typecheck iterations caught unavailable global BodyInit and Node Response.json unknown types in tests; corrected to RequestInit-derived body and a typed local response helper. The failed logs are retained (`task-3-typecheck-initial/second/third.log`); later checks pass.
- Initial large createMany quota fixture produced the known pg overlapping-query deprecation because Prisma split a large batch into overlapping queries. Replaced only that synthetic seed with sequential batches of500. Subsequent focused/full outputs are pristine; no product transaction queries run in parallel.
- The first full all-DB invocation ran files concurrently. Existing worker test `paginates dispatch intents and excludes PDFs, active claims, and failed assets` expected2 remaining global dispatch candidates but received5 while unrelated media fixture files created pending images. The worker's production query deliberately scans all pending images, and its test calls noteDispatched on global results. Narrow source inspection plus isolated2/2 and serial full451/451 then final452/452 establish inherited shared-database fixture interference. Root explicitly approved adding `--no-file-parallelism` to the dedicated CI database invocation. Worker product/test source was not altered, no foreign fixtures were deleted or filtered away, and original failure output remains in the report/logs. Added tests are registered in that serial dedicated DB CI step.
- New fixture teardown was self-reviewed to use a stable random category key even if setup fails, and delete children first, scoped only to owned fixtures. No schema resets, global cleanup, applied migration renames or edits.

## Additive migrations

- `20261017225201_catalog_proposals`: grants, proposal states/metadata/indexes/FKs and rollback audit foundation.
- `20261017225202_catalog_rollback_audit_target`: expected/target revision audit fields added after root clarified the no-op audit contract; the first already-applied migration was preserved untouched.

Both IDs sort after producer `20261017225200_catalog_revision_guard`. Direct Node Prisma invocations generated pure SQL from the current test datasource to schema, with stderr separate from SQL. Complete additive SQL was inspected before deploy. Migrations deployed only to the authorized test database. No applied history was rewritten.

## Files changed

- Contracts: `packages/contracts/src/catalog-proposals.ts`, its test and package export.
- Database: `packages/db/prisma/schema.prisma`, the two additive migrations, `packages/db/src/catalog-types.ts` type-only interfaces.
- Domain: `packages/domain/src/catalog/proposal-service.ts`, its16-test PostgreSQL suite, minimal canonical supporting commands in `catalog-service.ts`, reusable `authz/application-role.ts` and package exports.
- Web: `catalog-proposal-routes.ts`, boundary tests, real-PG HTTP integration tests, dependency adapter; extracted unchanged shared `api/read-bounded-body.ts` with media-route re-export preserved.
- Six Next route files: proposal collection/detail/decision, moderation collection/detail, entry rollback.
- Supporting: dedicated DB CI registration/isolation, `docs/catalog-moderation-operations.md`, this report and exact logs.

Root-owned progress/context/phase review files are deliberately excluded from staging/commit. Source/tests/report are committed together for controller review. No subagents were used.

## Remaining limits and concerns

No unresolved product correctness concern from self-review. Quotas are deliberately fixed initial policy and retain up to10000 audit rows per user; future cost tuning needs explicit policy. Custom submit transaction consumers must use supported ReadCommitted isolation (runtime enforced); conflict transaction outcomes must be committed before the caller turns them into a public error. Grant metadata is current-state metadata, not a complete grant/revoke event stream. Canonical byte-equivalent rollback preserves producer no-op semantics as explicitly approved.

Local verification covers production build, full real-PG workspace suite and HTTP/domain contracts. Browser/container/native-image and exact remote CI gates remain controller-owned; local Docker was not used. This report does not claim canonical task completion or remote CI success.
