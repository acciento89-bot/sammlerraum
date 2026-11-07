# Phase 04 Task 5 — scoped R1 re-review

Reviewed the exact fix from `8b199e6d0d50fd20c98c0df0a1b2a6078d56ec8a` to `0cad624c3f1d1ee69f4535c220123e4400db2e1d`, using `review-8b199e6..0cad624.diff`. Working HEAD matched the fix candidate. Read R1 in task-5-review.md and the appended fix report in task-5-report.md. Scope was R1 and new Critical/Important regressions introduced by this fix only; unchanged Minor M1 was not reopened.

## Verdict

- **R1: ADDRESSED.**
- **New Critical findings: 0. New Important findings: 0.**
- The scoped staging-fairness fix is acceptable. Previously required live PostgreSQL and exact-candidate CI gates remain separate completion requirements.

## Evidence

In `packages/storage/src/local-storage.ts:84`, each recursive directory inspection/enumeration failure now yields a budgeted error entry and returns to its parent, allowing later siblings to be visited without closing the parent traversal. In the sweep at line 129, file inspection, shared-lock and unlink failures are contained per entry; the bounded batch continues and retains its live cursor. The accumulated error is reported after the batch, outside the unexpected-iterator-error handler, so reporting a normal filesystem failure does not reset progress.

Exhausting the traversal clears the cursor; a later poll starts a fresh traversal and retries previously failed files/subtrees. Both successful paths and yielded enumeration errors consume the same fixed per-poll loop budget. The existing directory-entry materialization behavior is unchanged. The shared `staging:<UUID>` lock, pre-lock and under-lock age checks, active-write checks, exact reserved-name matching and symlink exclusions remain intact.

The added actual-filesystem regressions cover both persistent unlink failure (`0500`) and recursive enumeration failure (`0000`) in an early directory, using a one-entry budget and a retained cursor. They require later healthy staging to be removed despite persistent failure and the failed staging file to be removed after permissions recover. Fixture permissions are restored before the existing afterEach cleanup. The tests skip root because root bypasses the permission boundary; the report states both executed as uid501.

Accepted supplied verification without rerunning suites: permission regression RED **2 failed / 21 passed**; storage GREEN **24 passed / 2 database-gated skips**; full suite **329 passed / 41 database-gated skips**; relevant lint and TypeScript check passed. Database skips are not treated as live database validation. This re-review performed source/diff inspection only, made no production-code edits and ran no tests.
