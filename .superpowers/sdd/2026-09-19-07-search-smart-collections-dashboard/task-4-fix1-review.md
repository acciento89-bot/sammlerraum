### Spec Compliance

- ✅ **SPEC: Compliant within the scoped Task4A fix review. I1 ADDRESSED.** Reviewed fix BASE `bb2aaabd87b42ec1a97f3dd1f8591d9b5c1643a5` to source HEAD `91ae759a0465530d7ddb8b01fd38f635a16991b2`. This review covers formal I1 and new Critical/Important breakage introduced by its five-file fix, preserving the original review and root-verified foundation.
- `packages/domain/src/dashboard/dashboard-sql.ts:6` derives bound currency/exponent pairs from the existing `valuationCurrencyCodes` and `currencyMinorUnitExponent` authority. It does not introduce an independent currency mapping.
- `packages/domain/src/dashboard/dashboard-sql.ts:40` checks both chosen latest and immediate strictly-earlier prior points against those pairs. `packages/domain/src/dashboard/dashboard-sql.ts:45` gates classification and aggregation on the complete validity result; invalid prior data cannot be silently treated as a genuine denomination switch or replaced with an older valid observation.
- `packages/domain/src/dashboard/dashboard-sql.ts:58` returns the explicit validity sentinel and null data on invalid selection. `packages/domain/src/dashboard/dashboard-service.ts:39` requires exact true before accepting manual data; `packages/domain/src/dashboard/dashboard-service.ts:65` enables this requirement for the manual query. Missing, false or malformed validity evidence therefore fails closed with SEARCH_INVARIANT.
- `packages/domain/src/dashboard/dashboard-result.ts:47` also validates the bounded value/change output groups with the authoritative exponent lookup. Unsupported currency and wrong exponent both fail closed at the final response boundary.
- ⚠️ Future producer integration, full original Task4/Phase07 acceptance, remote CI, and Phase13 production-scale readiness remain root-owned open gates. This scoped fix does not claim to close them or re-review their foundations.

### Strengths

- `packages/domain/src/dashboard/dashboard-service.test.ts:105` adds four explicit projection-corruption simulations covering unsupported latest/prior currency and mismatched latest/prior exponent. They retain the real PostgreSQL query, real transaction/service path and valid producer-written stored rows; they assert one interception, invalid sentinel/null data, service rejection and a successful subsequent ordinary read. Three actual observations make fallback past the immediate prior detectable.
- `packages/domain/src/dashboard/dashboard-input.test.ts:119` adds four output-boundary cases across both value and change groups. The capacity fixtures use valid EUR/2 without claiming that repeated groups represent an attainable native denomination set.
- `packages/domain/src/dashboard/dashboard-sql.ts:34` retains the original latest/prior selection ordering and adds the validity guard to the existing statement. No new per-item application queries, transaction, producer/schema edits, or permissions are introduced. `packages/domain/src/dashboard/dashboard-result.ts:60` retains the budget check before serialization after its bounded group validation.

### Issues

#### Critical (Must Fix)

- None introduced by this fix.

#### Important (Should Fix)

- None introduced by this fix. Original I1 is addressed by the selected-point SQL guard, required service sentinel and authoritative output validation.

#### Minor (Nice to Have)

- Not expanded in this scoped fix review; no additional change requested.

### Checks and evidence

- Read the immutable `review-bb2aaab..91ae759.diff` once, in full. No changed source was separately reread, no missing hunk required expansion, and no git re-derivation or repository crawl occurred. No further unchanged-code inspection was necessary for this fix.
- Read the appended report from line118, `logs/task-4-fix1-commands.txt`, `logs/task-4-fix1-final-gates.json`, and `logs/task-4-fix1-plan-summary.json`; checked the actual corrected RED, focused GREEN and final log summaries.
- Corrected RED: eight failures, 26 diagnostic skips; focused GREEN: eight passes, 26 diagnostic skips. Frozen affected gate: three files, 46 passes, zero skips. Its correct accounting is 37 DB-backed cases, including four explicit selected-point projection simulations, plus nine pure cases. These tests do not claim persisted corrupt rows bypassed enabled native constraints.
- Frozen regular gate: 794 passes, 424 expected integration/browser skips. Final types, lint and build logs complete successfully; final-gates records exit0 and no post-freeze source changes. No warning/deprecation/stderr markers were found in the inspected final native, regular, types, lint or build logs.
- Supplied measured evidence retains 15 ordinary calls and 17 URL calls including settings, with all four actual SQL plan summaries at 1/50/500 owned items. Manual execution times are 0.388/0.574/1.705ms for these warm synthetic scenarios; no production-scale performance guarantee is inferred.
- No tests, suites, DB operations, builds, source/index/HEAD/branch mutations or subagents were run. The only write is this report; `task-4-review.md` remains preserved.

### Assessment

**Task quality: Approved**

**Reasoning:** The fix closes I1 at both the selected-point and response boundaries using the existing authoritative denomination rules. Focused negative cases and the supplied frozen affected/regular verification support the change, with no new Critical or Important breakage found in the fix diff.
