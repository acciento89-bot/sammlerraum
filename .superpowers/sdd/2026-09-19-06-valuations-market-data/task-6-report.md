# Phase06 Task6 implementation report

Base: `eadd2fd34617041ef3cbe6d7070c12c43502dd45`. Implementer: `p06_adapters`. The source commit is supplied in the handoff; this report is included in that commit. Root owns independent review, exact CI, persistence and task/phase checkoff.

## Delivered behavior

- Two default-off production factories with fake-HTTP contract tests: curated Scrydex Pokémon card/explicit print-variant and PriceCharting exact product/category/console bindings. Canonical four-string versioned selectors reject search/UPC/ambiguous matches. The existing registry forwards the context without a registry rewrite.
- Bounded one-attempt HTTP/body transport, no redirects/retries/pagination, 256 KiB body limit, five-second abort request, bounded JSON structure/numeric tokens, Node24 original numeric lexemes in private brands. All amounts flow through injected existing domain Money/currency capabilities. No float roundtrip, duplicate currency table or dependency cycle. Numeric zero is retained; null/absent remains absent; malformed numbers fail the batch. Raw/graded qualifiers, named source metrics and CATALOG_VALUE/FETCH provenance remain explicit.
- Exactly one body-receipt callback before UTF-8/JSON decoding and cooldown, validated/frozen by the existing handler. Legacy fake providers retain completion-time fallback. Invalid/duplicate/future callback values cannot commit observations or receipts.
- Runtime-validated fixed ProviderFailure codes/classification with constant messages and fresh broker errors. Tests inspect actual message, stack, cause and persisted pg-boss output for synthetic secrets; they do not rely only on JSON serialization of Error.
- Actual worker startup composes explicit registrations, shared PostgreSQL request permit, domain Money and optional requestLifecycle.stop. All provider flags/policy approvals/global sync default false, budgets zero; credentials alone cannot activate. Invalid enabled configuration fails with sanitized field-only errors.
- Exact accepted credential bytes are identical for hashing and auth. Empty, padded, control/non-ASCII credentials are rejected before HTTP. Scrydex team, category, alias and replica are excluded from scope; service plus exact token alone defines it.
- New additive `20261018051900_market_request_gate` migration with native checks for service, policy bounds, counters, UTC windows and coherent durable attempt ownership. Existing migrations were not rewritten or reset.
- Durable non-expiring claim commits before send and spans physical body settlement plus at least 1,000 ms monotonic cooldown. Own compare-clear is independent of cancellation. No HTTP occurs inside a catalog/receipt/admission transaction. No TTL, takeover, refund or automatic recovery exists.
- Positive validated trusted policy bootstraps only a missing idle row atomically; conflicts preserve claim/counters/policy. Missing/zero policy performs no DB/send. Policy mismatch fails closed. UTC counters conservatively charge admission and one carry in each advanced bucket before clear, preserving same-day counts on hour-only rollover. Clock regression fails closed. These are attempted-admission/carry counters, not exact physical-start analytics, rolling quotas or spending guarantees.
- Admission commit/lost ACK starts no HTTP and retains a committed claim. Clear commit/lost ACK can legitimately leave an idle DB row and allow a safely spaced successor; old local stop still fails. Pre-commit clear failure leaves the claim held and local stop failed. The DB is authoritative; no false global-blocked guarantee is made.
- Stop closes admission synchronously, propagates merged caller/permit cancellation to actual body transport, waits settlement/cooldown/cleanup, and remembers earlier uncertainty. Ignored abort remains physically pending and claimed. The existing 15-second watchdog fails shutdown and withholds DB disconnect; it does not prove cancellation or fleet drain.

## Validation

Every command used the test environment helper and pinned Node24.19.0/pnpm10.17.1. PostgreSQL17.11 and the actual `sammlerraum_test` name were guarded before applying the migration. The existing PostgreSQL process/data directory are root-owned and remain running. Native suites ran serially with separate clients and only synthetic owned fixtures/credentials. No real provider request, account, paid operation, activation, purge or live recovery occurred.

| Check | Result | Evidence under `logs/` |
| --- | --- | --- |
| Database guard, additive migration, Prisma format/generate | exit 0 | `task-6-database-guard.log`, `task-6-migration.log`, `task-6-prisma-format.log`, `task-6-generate.log` |
| Final serial native tests: gate, production composition, existing domain market and worker sync | 48 passed, 4 files, no skips, exit 0 | `task-6-native-final-first.log` |
| Whole workspace regular tests after expected-default fixture update | 621 passed, 253 expected DB-gated skips, 96 files, exit 0 | `task-6-workspace-test-corrected.log` |
| Whole workspace lint after last fixture/test additions | exit 0 | `task-6-lint-corrected.log` |
| Whole workspace production build (NODE_ENV=production) | exit 0 | `task-6-build-final.log` |
| Whole workspace typecheck after generated-type quarantine/rebuild | exit 0 | `task-6-typecheck-corrected.log` |

Native command: `RUN_DATABASE_INTEGRATION=1 pnpm exec vitest run apps/worker/src/jobs/market-request-permit.integration.test.ts apps/worker/src/jobs/production-market.integration.test.ts packages/domain/src/market-data/market-data-service.test.ts apps/worker/src/jobs/market-sync.integration.test.ts --no-file-parallelism`, through the pinned runtime prefix. Both new native suites are registered in the real CI allowlist.

The 15 gate cases cover separate-client first-row races, paused sender/no takeover, measured physical spacing, independent tokens, conservative failure/abort accounting, hourly/daily limits and nonregression, all three actual transaction-ack outcomes, stop/ignored abort, ownership constraints, and both-window/hour-only carry. The hour-only same-day fixture is conditionally skipped during UTC hour zero because there is no earlier same-day hour satisfying native constraints; the recorded final run executed it. No database clock or native constraints were disabled.

The four production-native cases exercise actual composition/registry/handler and pg-boss, exact unsafe-integer/zero receipt persistence before cooldown, committed-receipt retry without refetch, transient retry with a new permit, actual stored broker redaction, remembered cleanup failure through main's disconnect guard, and standalone permit stop reaching adapter body cancellation.

## Preserved failures and corrections

All original failing logs remain alongside corrected evidence:

- `adapters-red`, `gate-red`, `composition-red`: missing factories/gate/composition and missing handler behavior before implementation.
- `lifecycle-red`: request stop was initially deferred by a microtask; corrected to synchronous close/abort.
- `rollover-red`: carried attempt not initially counted in the new bucket; implemented approved Ruling10 and both rollover proofs.
- `body-red`: normal aborted stream was initially misclassified as uncertain because it was cancelled again after read rejection; receivedAt initially followed UTF-8 decode. Corrected settled-stream handling and receipt timing, then green tests.
- `runtime-capability-red`: simulated runtime without reviver source initially exposed TypeError; corrected fail-closed capability check.
- `types-first` and `types-second`: test mock tuple and library type compatibility corrections; `types-third` passed before full workspace checks.
- `format-first`: Prettier does not parse Prisma schema; used Prisma's formatter, then formatted remaining supported files.
- `production-native-first`: test assertion interpreted a raw timestamp through existing non-UTC driver conversion. Diagnostic compared stored epoch and established correct production UTC persistence (epoch delta 1,035 ms versus raw Date offset). Final test queries SQL epoch; production timezone code was not widened. Diagnostic log retained.
- `workspace-test`: existing config expected-default object needed the eight new default fields. Corrected fixture and reran all regular tests successfully.
- `typecheck-final`: eight pre-existing numbered duplicate `.next/types` generated files caused duplicate declarations. With explicit root approval after prior generator owner stopped, moved exactly those eight files to outside-repo `../task6-generated-quarantine-20261018T053510Z/`, retaining content and recording exact source/destination paths and SHA256 in `task-6-generated-types-quarantine.log`. No deletion/broad cleanup or unknown process changes. Production build regenerated normal types; affected check rerun separately.

## Operational limitations and remaining gates

`docs/market-provider-operations.md` documents bindings, honest primary-doc limits, activation prerequisites and authorized disable/drain/replay-barrier/purge/verification/reactivation procedure. These remain gates rather than accomplished operations. Scrydex's single-card envelope remains unconfirmed by public docs; only the documented bare card object is accepted and unknown envelopes fail closed. PriceCharting is deliberately USD-only based on its documented guide profile; purchased-guide denomination and both providers' zero sentinel semantics still require verification. Fake fixtures are not authenticated provider evidence.

Written storage/retention/private/public-display/link rights, Scrydex credit ceiling/overage controls, exclusive shared-token routing across the fleet, real runtime/driver cancellation bounds and authorized fleet drain/replay barrier/purge/recovery rehearsal remain unverified. No destructive recovery/purge runner or license-generation replay barrier was added. A privileged stale payload replay is not prevented by such a generation mechanism; operational barriers remain mandatory. No live-ready claim is made.

Only Task6 source/tests/migration/runbook/report and implementer logs are staged. Root contexts/preflight/progress/ledger/Phase07/review documents and the root credential-serialization probe log are excluded. No children, source push, merge or branch reset was performed.

## Fix round 1 — independent review I1

Base `e97268f84263539e1a5cf41a948ff2af746d2392`. Verified the Important finding: fatal UTF-8 `TextDecoder.decode` threw a native TypeError inside the real permit callback, which the permit correctly sanitized as a retryable TRANSPORT error. The direct fake-permit test masked that interaction. The narrow fix translates only the synchronous fatal UTF-8 decoding failure into constant terminal INVALID_RESPONSE before it crosses the permit boundary. HTTP/body transport, uncertainty, cancellation, receipt-time ordering and cleanup logic are unchanged.

Added `apps/worker/src/jobs/market-provider-failure.test.ts` using the actual provider, actual request permit, fake persistence and malformed `[255]` Response bytes. One regression checks code INVALID_RESPONSE/retryable false, one HTTP/admission/own clear, body-receipt callback and successful stop. The second passes the same real seam through the existing registry/worker handler and verifies terminal acknowledgement, the constant skip reason, zero commits/receipts and one attempt (no broker retry requested).

Meaningful RED: both new tests failed on the previous source, observing TRANSPORT/retryable true and MARKET_SYNC_RETRY. `logs/task-6-fix1-red.log`, exit 1, is preserved. After the fix, the new tests plus production adapter contracts, sync handler and lifecycle tests passed: **65 tests / 4 files / exit 0**, `logs/task-6-fix1-green.log`. Command through pinned runtime: `pnpm exec vitest run apps/worker/src/jobs/market-provider-failure.test.ts packages/market-data/src/production-providers.test.ts apps/worker/src/jobs/sync-market-data.test.ts apps/worker/src/jobs/market-sync-lifecycle.test.ts`.

Relevant final checks all exit 0: `pnpm --filter @sammlerraum/worker --filter @sammlerraum/market-data lint` (`task-6-fix1-lint.log`), worker typecheck against shared root tsconfig (`task-6-fix1-types.log`), and production worker bundle build (`task-6-fix1-build.log`); formatting evidence is `task-6-fix1-format.log`. Existing bundle-size warning remains unchanged. No native/database suite rerun was needed for this synchronous decode-only fix; no DB/provider operation occurred. Root owns scoped re-review and new exact CI. All root/reviewer files and prior review probe remain excluded from this fix commit.
