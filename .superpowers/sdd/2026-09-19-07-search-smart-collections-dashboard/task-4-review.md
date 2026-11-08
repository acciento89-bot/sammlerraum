### Spec Compliance

- ❌ Issues found: the owned partial milestone meets the requested service, contract, GET route, shared preparation, metric and bounded-query scope except for the chosen manual-denomination integrity requirement described as I1 below. This verdict applies only to Task4A under P7.16–19, not original full Task4 or future producer integration.
- ✅ Required source surfaces are present: `packages/contracts/src/dashboard.ts:1`, `packages/domain/src/dashboard/dashboard-service.ts:1`, `packages/domain/src/dashboard/dashboard-service.test.ts:1`, `apps/web/src/lib/dashboard-routes.ts:1`, `apps/web/src/app/api/v1/dashboard/route.ts:1`, and `docs/dashboard/owned-dashboard.md:1`. The diff also adds the actual native CI entries and package exports.
- ⚠️ Cannot verify from this task diff: end-to-end future purchase/market/shared/duplicate/wishlist producer integration, full historical analysis/milestones, and original Phase07 acceptance. These are explicitly deferred in `docs/dashboard/owned-dashboard.md:47`; they are not Task4A defects. Root owns the separate integration gates and remote CI.
- ⚠️ Native retained-data enforcement and all shared parser/authorization invariants are not independently reproved by this diff. The extraction preserves the existing sequence in `packages/domain/src/search/search-selection.ts:27`, and the supplied existing search/saved-query native gate covers regressions. Root retains cross-task assurance for those foundations.

### Strengths

- `packages/domain/src/search/search-selection.ts:27`: the common preparation keeps clock/collation, semantic references, independent outer retained-fact integrity, URL validation, and matched selection in one existing transaction. Search cursor decoding remains before preparation in `packages/domain/src/search/item-search-service.ts:47`.
- `packages/domain/src/dashboard/dashboard-sql.ts:15`: matched row/unit/collection counts remain distinct from the independent all-live-owned collection count; EXISTS-based grading/media facts avoid row multiplication. Fixed media predicates include owner, kind, READY and cleanup status.
- `packages/domain/src/dashboard/dashboard-sql.ts:25`: latest valuation is selected before denomination grouping; prior observation is strictly earlier and chosen before comparison. Numeric products/deltas are computed in PostgreSQL numeric and serialized as strings. Per-denomination rankings, absent estimates, true zero and incomparable history remain distinct.
- `packages/domain/src/dashboard/dashboard-sql.ts:53`: condition/grading cap sentinels precede transfer, retired conditions remain eligible, and grading records are distinct from graded-item counts. `packages/domain/src/dashboard/dashboard-result.ts:43` bounds the final strict response and checks the transaction budget around validation/serialization.
- `packages/domain/src/dashboard/dashboard-service.test.ts:1`: tests exercise real PostgreSQL and actual valuation/item producers, including mixed currencies, quantities, current-quantity changes after split, deterministic valuation ties, group caps, installed-driver timeout mapping, MVCC and measured production SQL. The separate pure boundary tests exercise decimal/group/UTF-8 response limits rather than substituting mocked happy-path totals.
- `apps/web/src/lib/dashboard-routes.ts:24`: the thin endpoint refreshes authentication, supplies the fixed allowed wire keys, reuses the closed error mapper, and returns no-store responses. `packages/contracts/src/dashboard.ts:222` restricts direct service input to the same selection fields.

### Issues

#### Critical (Must Fix)

- None found in the reviewed task scope.

#### Important (Should Fix)

- **I1 — chosen manual denominations are shape-checked, not validated against the actual producer denomination rules.** `packages/contracts/src/dashboard.ts:31` accepts every three-uppercase-letter currency and every integer exponent 0–9. `packages/domain/src/dashboard/dashboard-sql.ts:26` reads the chosen latest/prior stored currency/exponent, and `packages/domain/src/dashboard/dashboard-sql.ts:36` directly projects latest denominations into complete values/change groups. Consequently a chosen inconsistent pair such as EUR/9, or unsupported ZZZ/2, can produce a successful monetary dashboard; a corrupt prior pair can instead be silently classified as NONCOMPARABLE_DENOMINATION. The contract's ordinary shape validation does not detect either issue. Preparation §4 explicitly requires validating chosen output denomination and failing closed for bypassed/inconsistent native invariants. Normal producer writes are protected; the defect is the required reader defense, not a claim that ordinary users can create these rows. The focused authority check confirms `packages/domain/src/valuations/valuation-service.ts:76` obtains the exponent from `currencyMinorUnitExponent`, whose unsupported-code rejection is at `packages/domain/src/money/currencies.ts:174`. Reuse that authoritative mapping for the selected latest/prior points before aggregation/classification (or an equivalent bounded SQL validity guard), and return SEARCH_INVARIANT rather than successful groups/exclusion for invalid stored pairs. Add focused closed-failure cases for unsupported latest currency, mismatched latest exponent, and mismatched/unsupported immediate prior denomination; a narrowly intercepted driver-result fixture or guarded native corruption fixture can establish the defense without broad inventory audits or new producer behavior. Existing valid JPY/KWD and genuine denomination-switch cases must remain successful.

#### Minor (Nice to Have)

- None requiring a separate change.

### Checks and evidence

- Read the immutable `review-6d2f425..b974e7c.diff` once in consecutive segments; reviewed BASE `6d2f425342d1e4b96c05306cb0dfa9a7be60e0b3` to HEAD `b974e7ce86981eba4e8e28591b1baf99d7e16633`. No changed source file was separately reread, no hunk was missing, and no git re-derivation/crawl occurred.
- Named unchanged-code risk: SQL timestamp formatting could mislabel local time as UTC. Focused inspection of `packages/domain/src/search/search-read.ts:33` resolves it: the existing wrapper sets transaction-local TimeZone UTC before data reads. That inspection also confirms the existing bounded RepeatableRead, post-await and post-settlement checks.
- Named unchanged-code risk: permissive response denomination could diverge from the actual valuation producer. Focused schema/currency lookup plus producer/query denomination excerpts confirm the stored timestamptz fields and producer mapping described in I1; no broad producer audit was performed.
- Read final native/regular/types/lint/build log summaries and checked those logs for warning/deprecation/stderr markers: none found. Native: 16 files, 366 passed, zero skips; supplied accounting distinguishes 221 real DB cases and 145 pure cases. Regular: 790 passed, 420 expected skips. Types, corrected lint and corrected build finish successfully. `logs/task-4-final-gates.json` records exit0 and the exact source commit; `logs/task-4-format-equivalence.log` records identical transpilation for the sole post-functional formatter change.
- Read `logs/task-4-plan-summary.json`: all four actual SQL plans are recorded for 1/50/500 owned rows, including the dense-history scenario described by the native test. The code asserts 15 calls and the separate URL case asserts 17; these figures include configuration calls and exclude driver transaction-control calls. No production-scale scan bound is inferred from LIMIT or these warm synthetic runs.
- No suites, DB operations, build, focused tests or source mutations were run during review. The identified gap follows directly from the schema and SQL; none of the provided tests asserts invalid selected denomination rejection. The only write is this report.

### Assessment

**Task quality: Needs fixes**

**Reasoning:** The partial owned dashboard has a strong shared selection boundary, exact aggregation semantics and substantial native evidence. I1 is a narrow but explicit integrity requirement that must be completed before approving this task; deferred producer work remains correctly outside this gate.
