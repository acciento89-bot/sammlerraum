### Spec Compliance

- ✅ Spec compliant for Task 4 at `40018a4198636daf6b621f4836d8dcfe80049ff8` against `e2b30e8daf316ed95cd05acdfc83c8048436cbe6`. The schema, condition service and real PostgreSQL behavioral tests requested by the brief are present; the approved supporting contracts, item seams, routes and CI registration are included.
- ✅ Personal category/condition facts remain nullable and independent of catalog/grading; the normalized band is derived from the option (`packages/domain/src/condition/condition-service.ts:88`). Category replacement/removal requires explicit clearing when a choice exists (`packages/domain/src/condition/condition-service.ts:173`). Existing inactive choices remain readable and are copied on split (`packages/domain/src/items/item-service.ts:565`; `packages/domain/src/condition/condition-service.test.ts:224`).
- ✅ The additive migration supplies category-scoped identities, RESTRICT foreign keys, the nullable-composite-FK bypass check, range/cardinality checks and actual scalar-label semantic guards (`packages/db/prisma/migrations/20261017225203_condition_schemes/migration.sql:58`, `:70`, `:78`, `:89`). No applied migration or public whitelist is changed in the package.
- ⚠️ Remote exact-source CI/browser/container/native Sharp results are outside this task diff and remain controller-owned (`.superpowers/sdd/2026-09-19-05-catalog-condition-grading/task-4-report.md:40`). Production/bootstrap usability and future grading/catalog-link integration remain explicitly deferred to their approved tasks.

### Strengths

- Owner and item/collection lifecycle checks use persisted facts; item UUID normalization does not normalize actor IDs (`packages/domain/src/condition/condition-service.ts:116`; `packages/domain/src/condition/condition-service.test.ts:263`).
- Selection holds item, scheme SHARE and option SHARE locks through assignment, while maintenance follows compatible definition ordering without item locks (`packages/domain/src/condition/condition-service.ts:141`, `:254`, `:281`). The concurrency test observes PostgreSQL lock waits for both option and scheme retirement (`packages/domain/src/condition/condition-service.test.ts:433`).
- Maintenance definitions have bounded authored labels/options, stable exact keys and independent optional bands; semantic mutation/deletion guards and the 100-option ceiling have real database coverage (`packages/domain/src/condition/condition-service.test.ts:302`, `:394`).
- Route integration covers fresh-session flags, exact Origin, foreign-owner hiding, strict bodies, streamed size enforcement and nullable explicit clearing (`apps/web/src/lib/condition-routes.ts:24`, `:65`; `apps/web/src/lib/condition-routes.integration.test.ts:133`, `:186`).
- Dedicated RED evidence fails on the exact label assertion, followed by GREEN; the original generic-path persistence probe is accurately distinguished (`.superpowers/sdd/2026-09-19-05-catalog-condition-grading/logs/task-4-dedicated-red.log:10`; `logs/task-4-dedicated-green.log:4`; `task-4-report.md:26`). Final source retains the separate exact-label and band assertions (`packages/domain/src/condition/condition-service.test.ts:93`).

### Issues

#### Critical (Must Fix)

- None found.

#### Important (Should Fix)

- None found.

#### Minor (Nice to Have)

- None found.

### Checks

- Reviewed the supplied full package in sequential chunks; used its hunk coordinates to resolve report line references. No changed source file was separately reread, no diff regenerated, and no suites rerun.
- Named external risk: strict route parse errors could bypass no-store envelopes, or the shared body helper could trust Content-Length. Inspected `apps/web/src/lib/api/route-handler.ts:18` and `apps/web/src/lib/api/read-bounded-body.ts:4`: error responses retain no-store, Zod failures map to bounded 400 envelopes, and actual stream bytes enforce the limit independently of the declared length.
- Named external risk: adding private DTO fields could redirect public item reads. Focused call-site search found the existing `getPublicItem` path retained at `apps/web/src/lib/collection-item-routes.ts:298` and `:312`; the package does not change public projection definitions.
- Read the saved complete full-suite log after the initial tool display truncated part of it: 65 files/467 tests passed, with no test warnings (`.superpowers/sdd/2026-09-19-05-catalog-condition-grading/logs/task-4-full-suite-final.log:75`). Reviewed saved lint/typecheck/build/schema/migration evidence. The final cleanup-only adjustment has later 15-test evidence (`logs/task-4-teardown-focused.log:8`), so the report does not misrepresent full-suite chronology.

### Assessment

**Task quality: Approved.**

**Reasoning:** The implementation enforces the approved personal/global boundary at service and database layers and preserves historical exact condition facts without duplicating normalized bands. Focused real PostgreSQL coverage addresses the main ownership, relational-integrity, retirement-locking and split-preservation risks; no blocking or minor defect was established.
