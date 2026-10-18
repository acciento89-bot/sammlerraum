# Task 6 independent review

## Spec compliance

**❌ Issues found — 0 Critical, 1 Important, 0 Minor.** The actual production permit turns malformed UTF-8 into a retryable transport error, contrary to the approved terminal malformed-response contract (I1). The remaining reviewed implementation matches the Task6 brief as narrowed by root rulings 1–11.

**Range:** `eadd2fd34617041ef3cbe6d7070c12c43502dd45..e97268f84263539e1a5cf41a948ff2af746d2392`.

**Scope:** Task6 only. Read the complete reviewer template, task brief, authoritative GO/context and all numbered rulings, preflight/reconciliation/final-preparation, implementer report, and all 27 source/test/config/migration/operator-document changes in the complete 2,787-line companion. Raw evidence remains in the full review package and named original logs. No whole-phase audit or independent CI conclusion is included.

## Strengths and requirement checks

- Exact source values use private WeakMap brands and original numeric lexemes with runtime capability detection, bounded body/tree/token sizes, and strict nonnegative decimal/integer grammar (`packages/market-data/src/exact-json.ts:2`, `:5`, `:13`, `:35`). Canonical Money conversion is injected from the existing domain authority rather than copied (`apps/worker/src/jobs/market-provider-composition.ts:13`; `packages/market-data/src/provider-mapping.ts:24`). Explicit zero is retained; null/absent fields are omitted, and selected invalid monetary values reject the batch (`packages/market-data/src/production-providers.test.ts:52`, `:115`).
- Curated selectors bind exact namespace/type/version, product/card, category/console and Scrydex print variant. They reject best-match/search/UPC substitutions and ambiguous variants (`packages/market-data/src/provider-mapping.ts:5`; `packages/market-data/src/pricecharting-provider.ts:25`; `packages/market-data/src/scrydex-provider.ts:21`). Guide metrics remain CATALOG_VALUE/FETCH with source buckets and qualifiers; no completed sale, source event, sample count or universal grading company is invented (`packages/market-data/src/provider-mapping.ts:40`; `packages/market-data/src/pricecharting-provider.ts:14`; `packages/market-data/src/scrydex-provider.ts:48`).
- The exact accepted token determines the service-specific shared gate and the actual authentication. Team/category/alias/replica do not enter its identity (`packages/market-data/src/provider-http.ts:17`, `:30`; `packages/market-data/src/production-providers.test.ts:190`). HTTP uses one fetch with redirect refusal and a bounded body; cancellation is physically awaited rather than raced against a timer (`packages/market-data/src/provider-http.ts:41`, `:107`; `packages/market-data/src/production-providers.test.ts:264`).
- Admission initializes only a missing row under explicit finite policy, then locks, preserves existing policy/state, charges conservative counters and writes an attempt before send. Clear is own-attempt-only, checks window regression and carries one count into advanced UTC buckets before release (`apps/worker/src/jobs/market-request-permit.ts:63`, `:92`). Additive native constraints protect service, policy, counters and coherent claims (`packages/db/prisma/migrations/20261018051900_market_request_gate/migration.sql:15`). No HTTP occurs inside either gate transaction.
- The claim spans physical send/body settlement plus a full monotonic cooldown; uncertainty latches locally and claims have no TTL/takeover/refund (`apps/worker/src/jobs/market-request-permit.ts:111`, `:130`). Separate-client native proofs distinguish admission commit/lost ACK, clear commit/lost ACK, and pre-commit clear failure; the safely idle DB case is not falsely described as globally blocked (`apps/worker/src/jobs/market-request-permit.integration.test.ts:209`, `:231`, `:256`). Hour-only carry preserves same-day count (`:350`).
- Actual worker composition supplies the permit, Money authority, registrations and lifecycle (`apps/worker/src/jobs/market-provider-composition.ts:25`; `apps/worker/src/run.ts:34`). Default-off config and zero budgets prevent credential-only activation (`packages/config/src/server.ts:61`; `apps/worker/src/jobs/market-provider-composition.test.ts:10`). Native suites are included in actual CI (`.github/workflows/ci.yml:155`).
- Receipt time is captured before UTF-8/JSON decoding and cooldown, forwarded through the existing bound registry, validated once with a latched invalid state and frozen before commit; legacy fallback is completion time (`packages/market-data/src/provider-http.ts:85`, `:128`; `apps/worker/src/jobs/sync-market-data.ts:70`). Invalid/future/duplicate callback reports prevent commit (`apps/worker/src/jobs/sync-market-data.test.ts:185`). No registry rewrite was necessary. The two requested adapter test filenames were consolidated into `production-providers.test.ts`; both adapter contracts are present there.
- Failure codes are runtime allowlisted and immutable with constant message/stack and no foreign cause (`packages/market-data/src/provider-failure.ts:17`). Handler cancellation takes priority, terminal codes acknowledge without a receipt, and retryable failures become fresh broker errors (`apps/worker/src/jobs/sync-market-data.ts:104`). Real pg-boss tests inspect persisted output for synthetic secret leakage and prove committed-receipt replay avoids a second request (`apps/worker/src/jobs/production-market.integration.test.ts:143`). I1 is the classification exception to this otherwise sound boundary.
- Standalone stop passes its merged signal to the physical transport, closes admission synchronously, awaits settlement/cooldown/cleanup and remembers prior uncertainty (`apps/worker/src/jobs/market-request-permit.ts:171`, `:182`). The composed lifecycle participates in bounded shutdown and real main's no-disconnect guard, including previously settled handlers (`apps/worker/src/jobs/market-sync-runtime.ts:62`; `apps/worker/src/jobs/production-market.integration.test.ts:259`, `:320`). An ignored abort/watchdog failure is not reported as physical drain (`apps/worker/src/jobs/market-sync-lifecycle.test.ts:58`).
- Activation/recovery documentation keeps live wire shape, sentinel/currency, rights, credit limits, driver bounds, exclusive token routing and fleet drain/replay/purge/reactivation as explicit unresolved gates (`docs/market-provider-operations.md:15`, `:41`). No live request or actual purge is needed to satisfy this default-off task.

## Issues

### Critical — 0

None found.

### Important — 1

**I1 — Translate fatal UTF-8 decoding failure before it reaches the real permit.** `packages/market-data/src/provider-http.ts:130`–`:131` executes `new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)` inside the permit's send callback without translating its native TypeError. The real worker permit catches every non-ProviderFailure callback error and converts it to `ProviderFailure("TRANSPORT")` at `apps/worker/src/jobs/market-request-permit.ts:150`. Therefore the outer provider catch sees an already typed retryable failure and preserves it. A completed HTTP 200 body containing byte `0xff` is malformed response data, yet the production worker retries it and consumes further paid attempts/budget. This violates ruling5's permanent malformed-response/no-paid-retry behavior.

The existing UTF-8 test (`packages/market-data/src/production-providers.test.ts:317`) uses the direct fake permit at `:39` and asserts only ProviderFailure membership. That fake path reaches the adapter's outer catch as a native TypeError and becomes terminal INVALID_RESPONSE, masking the production integration defect.

**Focused reproduction:** pinned Node `v24.19.0`, actual `makePriceChartingProvider` and `createMarketRequestPermit`, in-memory fake persistence and fake Response body `[255]`: direct fake permit returned `code=INVALID_RESPONSE; retryable=false`; real worker permit returned `code=TRANSPORT; retryable=true`. One real-permit admission and clear occurred; no HTTP, database or suite ran. Evidence: `logs/task-6-review-probe.log:1`.

**Fix:** convert fatal UTF-8 decoding errors to a constant terminal INVALID_RESPONSE within the provider callback, before the permit's general transport sanitizer. Preserve genuine transport interruption/uncertainty behavior. Add a focused regression using the actual permit with fake persistence, asserting terminal classification and no successful commit/receipt for this malformed body.

### Minor — 0

None found in this task. Previously disclosed bundle/dependency warnings, optional provider-history ordering and Task5 runner color noise were not made load-bearing here and are not reintroduced as Task6 findings.

## Verification and limits

- Inspected original named final logs: serial native `48 passed / 4 files / EXIT=0`; ordinary workspace `621 passed, 253 expected DB-gated skips / 96 files / EXIT=0`; lint, build and typecheck each `EXIT=0`. Paths: `logs/task-6-native-final-first.log`, `logs/task-6-workspace-test-corrected.log`, `logs/task-6-lint-corrected.log`, `logs/task-6-build-final.log`, `logs/task-6-typecheck-corrected.log`. A targeted warning/error scan found no new warning source in those final logs. These are inspected implementer evidence, not rerun suites.
- Ran only the above unanswered classification probe with fake HTTP/fake persistence on the pinned runtime. TypeScript was transpiled in memory; no implementation/test source, DB, index or HEAD changed. No child review, external request, push, recovery or purge occurred. The only authored artifacts are this report and its authorized probe log.
- No unchanged production-code crawl was needed. The package manifest was inspected solely to choose the in-memory probe runtime/transpiler. Exact remote CI is owned by root and was running separately; this review does not assert its outcome.
- ⚠️ Live provider authentication/envelope/rights/sentinel/currency, arbitrary real-driver cancellation and fleet-wide recovery cannot be verified from fake HTTP/native test evidence. They remain documented activation gates, not missing work for this authorized default-off implementation (`docs/market-provider-operations.md:15`).

## Assessment

**Task quality: Needs fixes. SPEC: ❌ Issues found. QUALITY: ❌ Needs fixes. Counts: 0 Critical / 1 Important / 0 Minor.**

The durable gate, exact-value mapping and operational safety boundaries are carefully implemented and substantially exercised. I1 is a reproducible production-only classification gap concealed by the direct fake permit; fix and targeted regression are required before Task6 approval.
