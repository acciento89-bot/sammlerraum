# Task 3 review — catalog proposal moderation

## Spec Compliance

- ✅ **Spec compliant** for the reviewed Task 3 scope at `37cb8dd`, based on the supplied `911e0cc7eb9fcb4e3b08611f443ddbd18e22dd2b..37cb8dd` package and approved context. All four brief files have corresponding changes, with the supporting contracts, routes, authorization foundation, additive migrations and CI registration explicitly authorized by the context.
- The strict seven-operation contract and deliberate new-entry null target/base semantics are implemented in `packages/contracts/src/catalog-proposals.ts:23` and `:49`; the application grant is independent of collection membership in `packages/db/prisma/schema.prisma:673` and `packages/domain/src/authz/application-role.ts:12`.
- Submission bounds, actor advisory locking and the fail-closed ReadCommitted requirement are implemented together in `packages/domain/src/catalog/proposal-service.ts:83`. No private item DTO copying, provider action, translation generation, submitted role authority or email allowlist was introduced.
- The decision path in `packages/domain/src/catalog/proposal-service.ts:220` checks the authoritative grant, locks the proposal, rejects terminal replay, locks the canonical target, and invokes the shared canonical seam. Its explicit conflict result is converted to the public error only after the transaction completes at `:316`.
- Real restoration and approved no-op rollback semantics retain a separate actor/reason/expected/target/result audit in `packages/domain/src/catalog/proposal-service.ts:279`; the two migrations are additive and ordered after the producer migration. Current grant metadata and restrictive provenance FKs match the explicit operator-policy ruling (`docs/catalog-moderation-operations.md:19`).
- ⚠️ Remote exact-source CI, browser/container/native-image gates are not established by this review package and remain controller-owned. Unchanged producer validators and canonical persistence internals were not re-audited; their use and the supplied integration results were reviewed within this task's boundary.

## Strengths

- **Atomic decision semantics:** `packages/domain/src/catalog/proposal-service.ts:220` keeps the canonical operation and terminal proposal metadata inside one transaction; `:316` avoids rolling back the required committed CONFLICT by throwing too early. The real PostgreSQL stale scenario asserts both the returned error and committed state plus absence of a new revision (`packages/domain/src/catalog/proposal-service.test.ts:65`).
- **Revocation-safe authorization:** `packages/domain/src/authz/application-role.ts:16` uses an actual grant-row `FOR SHARE`, with all protected service methods calling it in the same transaction. The supplied PostgreSQL test uses `pg_blocking_pids` to observe revocation waiting, then checks denial after revocation; it does not substitute an elapsed-time guess or mocked role lookup (`packages/domain/src/catalog/proposal-service.test.ts`).
- **Quota concurrency is explicit:** `packages/domain/src/catalog/proposal-service.ts:86` rejects unsupported enclosing isolation before quota counts/writes, and `:92` serializes count/insert without a User-row update lock. The retained RepeatableRead RED demonstrates 21 pending rows before the guard; GREEN and the final suite establish the regression check (`logs/task-3-isolation-red.log:73`, `logs/task-3-isolation-green.log:4`, paths relative to this report).
- **Narrow canonical extension:** identifier update/remove uses the existing `mutate` seam, scopes identifiers and variants to the entry, checks active-tuple conflicts, and retains historical identity through existing persistence (`packages/domain/src/catalog/catalog-service.ts:376`). The real tests verify foreign scope rejection, stale CAS, unchanged historical snapshots, retirement and restoration.
- **HTTP boundary separation:** `apps/web/src/lib/catalog-proposal-route-dependencies.ts:12` requests fresh sessions; `apps/web/src/lib/catalog-proposal-routes.ts:83` checks exact Origin before consuming mutation bodies, and `:111` exposes only submission/own reads or protected decision routes. The bounded-body helper is extracted without changing its behavior (`apps/web/src/lib/api/read-bounded-body.ts:3`). Own reads are filtered by actor in `packages/domain/src/catalog/proposal-service.ts:124`.
- **Evidence is behavioral:** the 16 domain PostgreSQL tests and three HTTP/PostgreSQL tests cover competing proposals, replay, enclosing rollback, stale/no-op CAS, authored translations/provenance, foreign actors and real quotas. The fixture cleanup is scoped to random owned prefixes/categories and deletes children first (`packages/domain/src/catalog/proposal-service.test.ts:45`; `apps/web/src/lib/catalog-proposal-routes.integration.test.ts:64`).

## Issues

### Critical (Must Fix)

- None found.

### Important (Should Fix)

- None found.

### Minor / diagnostics triage

- `logs/task-3-build-isolation-final.log:43` retains esbuild's `6.8mb ⚠️` worker bundle-size diagnostic. This is a non-blocking build diagnostic, not a failed build or evidence of a Task 3 regression; worker source/build configuration is unchanged by this task. If bundle size becomes an operational issue, evaluate its dependency composition separately. No change is required for this gate.
- `logs/task-3-domain-focused-initial.log:4` records an initial pg overlapping-query deprecation. The final fixture uses sequential batches, and the final focused/full outputs contain no recurrence. Resolved for this gate; the original log is correctly retained.
- `logs/task-3-full-suite.log` records the inherited worker fixture interference (450 passed, one failed). The untouched worker test passed in isolation (`logs/task-3-worker-isolated.log:4`), and the final serial run passed all 452 tests (`logs/task-3-full-suite-isolation-final.log:78`). The approved dedicated DB CI serialization at `.github/workflows/ci.yml:123` addresses that shared-database harness issue without weakening worker source or assertions.
- Expected stale/isolation RED failures and the earlier typecheck errors are preserved historical evidence, not unresolved final-source defects; final typecheck and lint logs pass.

## Review checks and evidence

- Read the supplied brief, controller context, implementation report and exact full review package. Initial tool output truncated the log portion, so the affected log range was recovered; production/test source hunks were reviewed once. No changed source file was separately reopened, no Git diff was regenerated, and no suite or focused test was rerun.
- **Named focused external check — private error caching/redaction:** inspected unchanged `apps/web/src/lib/api/route-handler.ts:19` and `:66` because the new route factory sets no-store locally only on success. The shared error path supplies no-store, request IDs and redacted envelopes for validation, authorization and unexpected errors; no issue found.
- Reviewed supplied final evidence: 452/452 tests across 63 files (`logs/task-3-full-suite-isolation-final.log:77`), workspace lint (`logs/task-3-lint-isolation-final.log`), workspace types (`logs/task-3-typecheck-isolation-final.log`), production build including all six route paths (`logs/task-3-build-isolation-final.log`), 17 migrations up to date (`logs/task-3-migration-status.log:6`) and empty drift (`logs/task-3-schema-drift.log:3`). These are inspected implementation evidence, not reviewer reruns.
- No root-owned dirty progress/context/phase-review state was included in the verdict. The only review mutation is this report.

## Assessment

**Task quality: Approved.**

The implementation matches the approved operational and transaction contracts, uses a small shared authorization primitive and the existing canonical mutation seam, and has meaningful real-database evidence for its failure and concurrency cases. No Critical or Important issue was found; the remaining diagnostic is non-blocking and the remote release gates remain controller-owned.
