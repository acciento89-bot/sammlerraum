# Phase 06 Task 4 — fix round 1

Reviewed base: `fe15a8bcb40e926fffd69e991ae09e73f0fb048b`.
Source/test/evidence commit: `e75067846afa112a78493d8d10b36682410f4eb2`.

Both accepted Important findings are addressed for independent review. No schema, provider, worker, UI or public DTO changes. Root-owned contexts, review, progress, preparation and canonical ledger are excluded from staging. No push performed.

## I1 — acquisition and connection errors

The shared GET/manual POST classifier recognizes Prisma P1001/P1002/P1008/P1017 and the installed PostgreSQL adapter's `DatabaseNotReachable`, `ConnectionClosed`, `SocketTimeout` causes, plus its ENOTFOUND/ECONNRESET socket codes. Existing SQL timeout classification is preserved. Only positive SQLSTATE40001 continues to trigger up to three complete retries; unknown database faults still propagate as sanitized500.

The route regression uses the captured P1001 with `meta.driverAdapterError.cause.kind=DatabaseNotReachable`, isolated Prisma codes and the other adapter connection causes. Each GET and POST asserts503, `VALUATION_UNAVAILABLE`, no-store, no secret details and exactly one transaction attempt. An unknown42703 fault remains500 with one attempt.

## I2 — remaining read budget

After connection acquisition, the callback recomputes the actual remaining overall/per-transaction budget and installs bounded PostgreSQL transaction, statement and lock limits. Before every subsequent data query it refreshes the statement/lock limits against the remaining monotonic budget. Checks occur after setup, after each awaited SQL and after DTO validation/serialization before both successful callback returns. One additional timeout-setting round trip per data query is the bounded cost. No Promise.race or detached work is used; native transaction settlement is awaited.

Limits remain12s across acquisition/processing/retries, at most5s per transaction,2s per statement and500ms per lock wait, with tighter limits when less remains. Acquisition/maxWait remains at most2s. Authentication, response transfer and transaction cleanup/settlement are outside the domain processing budget; this is not a universal HTTP wall-clock guarantee. RepeatableRead snapshot and Collection→item locking are unchanged.

## Regression coverage

- `maps captured acquisition and adapter connection failures to one sanitized GET and POST attempt`
- `does not mask unknown database faults as availability failures`
- `deducts acquisition from remaining transaction and statement limits after retries` — two serialization attempts consume10s; acquisition consumes1.8s; initial installed limits are200ms, later statements tighten to100ms.
- `cancels native SQL within the remaining acquired budget and settles before returning` — PostgreSQL cancels a500ms sleep under a150ms remaining deadline; rejection follows transaction settlement, and the database remains usable.
- `rejects exhausted summary immediately after awaited SQL, including an empty final page`
- `rejects exhausted source history immediately after awaited SQL, including an empty final page` — actual cursor beyond the only recorded row returns an empty native page; advancing the controlled clock at that response boundary yields503, not success.

## Commands and evidence

Every command used `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm` (abbreviated PIN below). Native tests first source `../sammlerraum-test-env.sh`, use `RUN_DATABASE_INTEGRATION=1`, verify owned PostgreSQL17/`_test`, and run serially.

Native target files (FILES): `packages/domain/src/valuations/valuation-query.test.ts apps/web/src/lib/valuation-routes.integration.test.ts`.

| Command after PIN | Log under `logs/` | Exit/result |
| --- | --- | --- |
| `exec vitest run FILES --no-file-parallelism -t 'captured acquisition\|unknown database\|deducts acquisition\|rejects exhausted'` before fix | `task-4-fix-red.log` |1:3 expected regressions failed;2 passed |
| Same focused command after fix | `task-4-fix-green.log` |0:5 passed |
| `exec vitest run FILES --no-file-parallelism` | `task-4-fix-native.log` |0:37 passed, including native cancellation, existing MVCC/race/lock/privacy and representative plans |
| `--filter @sammlerraum/domain --filter @sammlerraum/web lint` | `task-4-fix-lint.log` |0 |
| `--filter @sammlerraum/domain --filter @sammlerraum/web typecheck` | `task-4-fix-types.log` |2: new awaited wrappers needed explicit generic return types |
| Same typecheck after explicit generic propagation | `task-4-fix-types-recovery.log` |0 |
| `--filter @sammlerraum/web build` | `task-4-fix-build.log` |0: production build succeeded |
| Focused command above plus `\|cancels native SQL`, after strengthening empty-page fixture | `task-4-fix-final-focused.log` |1: fixture accidentally used private/storage `createdAt` instead of DTO `recordedAt`;5 passed |
| Same typecheck on that fixture | `task-4-fix-types-final.log` |2: caught that nonexistent DTO field |
| Same six focused tests after using `recordedAt` in cursor time key | `task-4-fix-focused-recovery.log` |0:6 passed |
| Same typecheck, final source/tests | `task-4-fix-types-final-recovery.log` |0 |
| `exec prettier --check packages/domain/src/valuations/valuation-query.ts packages/domain/src/valuations/valuation-query.test.ts apps/web/src/lib/valuation-routes.integration.test.ts` | `task-4-fix-format-final.log` |0 |

`git diff --check` on the three owned source/test paths: exit0. Raw failed logs are retained unchanged. The production runtime code is unchanged since the passing native suite except explicit erased TypeScript generic propagation; subsequent test-only cursor refinement passed its targeted native tests and final typecheck. No redundant full workspace/browser suite run. Root owns scoped review and exact new-source CI.
