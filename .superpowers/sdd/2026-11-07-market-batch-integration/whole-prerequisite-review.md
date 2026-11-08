# Whole-prerequisite review — exact market batch integration

Review range: `d69f78f54fb80b729865a636a0c69acf564e2fca..328904c18cda2f5eb101979251f915e91ac46257`.

Verdict: **Changes requested: one Important correctness finding.** No Critical or additional Minor findings identified. This is the single fresh whole-prerequisite review; its verdict and evidence refer to the frozen range above and are retained independently of the root's subsequent consolidated correction pass.

## Important

### I1 — Preserve serialization failures for the outer bounded retry owner

Evidence: `packages/domain/src/market-data/market-batch.ts:178` and `packages/domain/src/market-data/market-aggregate.ts:54` convert every `isReadDependencyFailure` into `MARKET_BATCH_DEPENDENCY`. `packages/domain/src/api/read-dependency-errors.ts:39` defines that predicate as any recognized error code, including PostgreSQL `40001` (listed at line 8). The new market search seam then converts the closed market dependency error into `SEARCH_UNAVAILABLE` at `packages/domain/src/search/search-selection.ts:139`; dashboard aggregation similarly maps it at `packages/domain/src/dashboard/dashboard-service.ts:203`. `runSearchTransaction` immediately rethrows closed `ItemSearchError`/`MarketBatchError` at `packages/domain/src/search/search-read.ts:74–88`, before the serialization retry at line 89.

Consequently a `40001` arising in any of the three market preparation reads, their per-read timeout-configuration statement, or the market aggregate read aborts after the first attempt. The documented/binding three-attempt serialization behavior and fresh rights capture on retry are lost specifically for these new reads. Ordinary non-market reads, and market consumer count/page reads that escape this conversion, still reach the existing retry owner. This is an availability regression under transient serialization failure, not a data-disclosure claim.

Concrete reproducer by source reasoning: give `createItemSearchService` an admitted synthetic market selector and a transaction adapter that throws `{ code: "40001" }` on the first `market:prepare:current` call, then returns valid rows on a second transaction attempt. The current implementation returns `SEARCH_UNAVAILABLE` and calls `$transaction` once, although the same adapter's first ordinary read serialization failure would retry. Repeat with a dashboard admitted aggregate and first `market:aggregate` failure to expose the second conversion. No runtime was executed by this reviewer.

Correction: preserve recognized serialization failures through these local catches so only the existing outer `runSearchTransaction` retries the entire transaction within its total budget. Continue sanitizing exhausted retries and other dependency failures at the existing boundaries; do not add a nested or per-query retry. Add a focused transaction-level regression showing a first preparation/aggregate serialization failure succeeds on the next attempt with fresh policy snapshots, and exhaustion stops at the existing three-attempt bound.

## Review coverage and positive assessment

Read the applicable parent `AGENTS.md`, current execution brief, complete original market-batch implementation plan and root rulings. The current brief authorizes this source prerequisite despite the historical preparation-only NO SOURCE GO wording. Used the requesting-code-review skill as the assigned fresh reviewer; no additional agents were dispatched.

Inspected the entire changed implementation across independent display/query/detail/aggregate capability admission; immutable selector/use copies and post-consume revocation checks; callback/transaction/scope handle lifetime; current/historical snapshot envelopes and canonical Phase06 validation parity; bound SQL manifests; exact nullable targets and active mappings; full metric/typed qualifier/stored-exponent identity; eligible-mapping ambiguity over the independent outer owned/lifecycle scope; latest-before-amount semantics; search, count, cursor and saved-query integration; aggregate numeric sums/bases/coverage; strict public totals; dashboard scope and failure behavior; DE/EN UI wording/rendering; native test registration in CI and operational documentation. The changed-file range contains no database schema or migration changes.

No additional concrete correctness, security or privacy defect was found in those paths. In particular, the implementation does not infer additive rights from FILTER/display rights; current invalid snapshots fail invariant while invalid historical snapshots are ineligible; current identifier replacement is matched by exact supported value while historical provenance remains validated; ambiguity precedes text/AST/amount/page selection; missing aggregate observations remain explicit coverage rather than invented zeros; production capabilities remain empty/OFF. The aggregate scope label explicitly says all owned items in the selected lifecycle independently of other filters. The browser fixture is a synthetic permitted-response rendering proof, not evidence of real-rights activation.

## Existing evidence inspected and limits

- `task-2-tests.log`: 85 PASS across four files (28 batch, 22 policy, 27 Phase06 valuation query, eight search-read cases).
- `task-3-corrected-cohort.log`: 224 PASS across four files; additional retained Task3 HTTP regression evidence is separate.
- `task-4-final-cohort.log`: 55 PASS across four files, including nine aggregate and 11 market-filter cases alongside dashboard coverage.
- `task-5-query-measurements.json` and retained `task-5-actual-plans.log`: actual bounded synthetic 1/50/500-item shared/distinct-target measurements, up to 6,500 observations; three preparation data queries, 17 configuration-inclusive raw calls for search and nine for aggregate. These instrumented counts exclude driver BEGIN/COMMIT. No speculative index requirement follows from this finite evidence.

Root's final full regular/native/type/lint/build/browser gates were still in progress during this review. Their final results are not asserted here. The reviewer ran no tests, runtimes, builds, databases, browsers or network commands and changed only this report. This source prerequisite does not close the separate duplicate/shared-scope Phase07 prerequisites, authorize main/deployment, or activate provider fetching/real rights.
