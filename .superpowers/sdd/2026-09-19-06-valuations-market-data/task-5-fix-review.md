### Finding Verdicts

- **I1 — Source 404 leaves cached external rows and off-page currency claims visible — ADDRESSED.** `apps/web/src/components/valuations/valuation-state.ts:220` classifies source 404/stale-selector rejection and atomically marks the external snapshot invalid with clearing the expanded source/selector at line 225. The owner recheck retains that invalidation while pending or failed; only a current successful summary clears it at line 144. `apps/web/src/components/valuations/valuation-page.tsx:45` now includes this flag in the shared external-rendering guard, suppressing the existing group/seed fallback, availability and currency-conflict consumers; directory paging is also behind that guard at line 225. `valuation-state.ts:178` blocks calls using obsolete selectors. Manual summary/form identity and mutation authority are unaffected by the focused production changes.
- **I1 regression evidence — VERIFIED.** `apps/web/src/components/valuations/valuation-state.test.ts:286` uses a populated group, manual record, directory cursor and off-page-derived currency conflict, holds/fails the owner recheck, asserts unchanged draft identity and blocked source requests, then restores facts only after fresh success. `apps/web/e2e/valuations.spec.ts:534` adds the matching real-browser boundary: an actual default-disabled route handler supplies the source 404, the owner recheck is held then aborted, old rows/groups/conflict/paging disappear, saved manual data and edited amount/note remain, and a fresh query-generated response restores external facts without resetting the draft. The added gates are released before nested cleanup at line 758.

### New Breakage in the Fix Diff

- None found. Counts: 0 Critical, 0 Important, 0 new Minor. The invalidation flag is not cleared by read start/failure, and existing epoch/sequence checks precede both rejection handling and successful restoration (`apps/web/src/components/valuations/valuation-state.ts:140`, `apps/web/src/components/valuations/valuation-state.ts:214`).

### Carried Minor

- **M1 — NOT FIXED; explicitly deferred by root to Phase 13.** Conflicting `NO_COLOR`/`FORCE_COLOR` runner warnings remain in `logs/task-5-fix-browser-green.log:1`. This accepted nonblocking shared-harness cleanup does not extend the I1 fix loop. Carried Minor count: 1.

### Out-of-Scope Observations

- None newly raised. Prior backend approvals, legacy L1, production-grant/proxy-trust proof limits, and exact-source CI/persistence remain the existing root-owned gates; this fix does not alter or independently certify them (`task-5-fix-report.md:55`).

### Checks

- Reviewed the supplied `review-204dfe4..96bca47.diff` and fix report against the previous I1 finding. No unchanged-source audit, additional test execution, database operation, browser run, Git mutation, or child agent was performed. Only this report is written.
- Confirmed genuine targeted RED evidence: pure test fails before the flag exists (`logs/task-5-fix-state-red.log:17`); production browser expects zero old observation nodes but receives 20 while the owner recheck is held (`logs/task-5-fix-browser-red.log:16`). The report correctly distinguishes the browser subprocess failure from its outer capture shell status.
- Confirmed covering GREEN output: 13 state plus 3 client cases, 16/16 total (`logs/task-5-fix-state-green.log:4`, line 8); all four DE/EN desktop/mobile external transport cases, 4/4 (`logs/task-5-fix-browser-green.log:8`, line 15). No original 12-browser/42-pure/54-native result is misrepresented as rerun in this fix round.
- Confirmed full lint/typecheck/build completion in `logs/task-5-fix-lint.log:44`, `logs/task-5-fix-typecheck.log:25`, and `logs/task-5-fix-build.log:134`. The cleanup log reports zero owned fixture users/categories/observations (`logs/task-5-fix-cleanup.log:1`); this review did not independently access the DB or ports.

### Verdict

**Fix round:** All blocking findings addressed, no new Critical/Important breakage.

**Scoped SPEC/QUALITY:** Approved for I1 and the fix diff. Remaining counts: 0 Critical, 0 Important, 1 explicitly deferred Minor (M1). Exact-source CI/persistence and final task checkoff remain with root.
