# Task 6 fix round 1 scoped re-review

## Finding verdicts

- **I1 — Fatal UTF-8 must remain a terminal malformed response through the real permit: ADDRESSED.** `packages/market-data/src/provider-http.ts:130`–`:138` now catches only synchronous UTF-8 decoding failure and constructs a constant `ProviderFailure("INVALID_RESPONSE")` inside the permit callback. The actual permit therefore preserves its terminal classification instead of translating a native TypeError into retryable TRANSPORT. The catch excludes body transport, receipt reporting, cancellation checking, JSON decoding and observation mapping; their previous behavior is preserved.
- **Regression coverage is adequate for I1.** `apps/worker/src/jobs/market-provider-failure.test.ts:9` constructs the actual provider and request permit with fake persistence and malformed Response bytes. The first test (`:47`) checks terminal classification, one receipt-time callback, one HTTP/admission/own clear, no active claim and successful stop. The second (`:64`) passes that seam through the real registry and worker handler, checking terminal acknowledgement, constant skip text, zero commits/receipts and one attempt.

## New breakage in the fix diff

**None. Counts: 0 Critical / 0 Important / 0 Minor.** The change is limited to the decode boundary, two covering regressions and their recorded evidence. No transport, database, admission, cooldown, recovery or activation logic changed.

## Verification

- Reviewed the complete 338-line package for `e97268f84263539e1a5cf41a948ff2af746d2392..570a9ccb4735a5ae5578251dd8b4a9e5bb293a9c`, the scoped re-review template and appended implementation report, against the existing brief/rulings and original I1. No unchanged production-code audit was performed.
- Inspected genuine RED evidence: both new tests failed on the earlier source, showing TRANSPORT/retryable true and MARKET_SYNC_RETRY (`logs/task-6-fix1-red.log:4`, `:17`, `:41`; exit 1).
- Inspected GREEN evidence: the new regression file plus adapter, handler and lifecycle tests passed, **65 tests / 4 files / exit 0** (`logs/task-6-fix1-green.log:4`, `:11`, `:17`).
- Inspected successful relevant lint, shared-root typecheck, formatting and worker build outputs (`logs/task-6-fix1-lint.log:11`; `logs/task-6-fix1-types.log:6`; `logs/task-6-fix1-format.log:4`; `logs/task-6-fix1-build.log:18`). Build output retains the previously disclosed worker/maintenance bundle-size warnings (`logs/task-6-fix1-build.log:5`, `:13`); the decode-only fix does not make that carried item load-bearing or create a new warning source.
- No tests or suites were rerun: the code and recorded tests resolve the prior question. No source/index/HEAD/database changes, children, push or external requests occurred. Only this authorized review report was written. Exact remote CI remains root-owned and is not asserted here.

## Out-of-scope observations

None.

## Verdict

**Fix round: All findings addressed, no new Critical/Important breakage. I1 closed; no open Task6 findings. SPEC: ✅ Compliant. QUALITY: ✅ Approved. Counts: 0 Critical / 0 Important / 0 Minor.**

The complete initial review remains the record for unchanged Task6 behavior. This approval covers the scoped correction and does not assert live-provider readiness or completion of the separately documented activation gates.
