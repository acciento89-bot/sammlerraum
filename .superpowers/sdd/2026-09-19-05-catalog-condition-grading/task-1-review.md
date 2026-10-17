# Task 1 review — spec and quality

## Spec Compliance

- ❌ Minor error-contract deviation: oversized MULTI_SELECT arrays containing non-string elements receive `CATALOG_ATTRIBUTE_VALUE_INVALID` before the shared primitive check can produce `CATALOG_ATTRIBUTE_TYPE_MISMATCH` (`packages/domain/src/catalog/category-template-service.ts:43`). The core Task 1 requirements otherwise match the diff.
- ✅ All brief-listed files have their required changes. Stable authored keys and bounded strict DE/EN labels are defined in `packages/contracts/src/catalog.ts:6`; the ten existing primitives are reused at `packages/contracts/src/catalog.ts:28`; definition and option constraints are enforced at `packages/contracts/src/catalog.ts:32` and `packages/contracts/src/catalog.ts:57`.
- ✅ One nested create atomically persists templates, definitions, options and translations (`packages/domain/src/catalog/category-template-service.ts:166`); ordered reads use `templateInclude` (`packages/domain/src/catalog/category-template-service.ts:87`). Scoped key/position indexes and foreign keys appear in the additive migration (`packages/db/prisma/migrations/20261017201618_catalog_templates/migration.sql:61`).
- ✅ Maintenance factory and structural database interface keep the domain independent of Prisma runtime and HTTP authorization (`packages/domain/src/catalog/category-template-service.ts:113`, `packages/domain/src/catalog/category-template-service.ts:155`). No personal data fields, ordinary-user routes, collection-policy changes, entries, proposals, condition, grading or UI were added. Contracts/domain exports are registered (`packages/contracts/package.json:14`, `packages/domain/package.json:22`); the real-DB test is registered in CI (`.github/workflows/ci.yml:140`).
- ⚠️ Exact-head Node 24 CI is pending with the controller. Source/license retention, catalog moderation, optional personal links, and condition/grading separation remain later-task responsibilities; this template-only diff introduces no conflicting relationships.

## Strengths

- Shared canonical validation is called directly and custom-field errors are mapped without changing legacy code (`packages/domain/src/catalog/category-template-service.ts:55`). Real PostgreSQL tests cover persisted DTO validation, concurrent duplicate keys, scoped indexes and nested rollback (`packages/domain/src/catalog/category-template-service.integration.test.ts:46`, `:105`, `:128`). Fixture cleanup deletes only owned children before parents (`packages/domain/src/catalog/category-template-service.integration.test.ts:31`).
- The new production modules are cohesive and modest in size (91-line contracts, 215-line service). Strict property rejection prevents an arbitrary private-data payload from entering template storage (`packages/contracts/src/catalog.ts:16`, `:31`, `:57`).

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

None.

### Minor (Nice to Have)

1. `packages/domain/src/catalog/category-template-service.ts:43`: MULTI_SELECT bounds precede primitive-member validation. For example, a valid MULTI_SELECT definition plus `Array.from({ length: 101 }, () => 1)` returns VALUE_INVALID, although the shared validator rejects every non-string member with TYPE_MISMATCH. The approved report states oversized wrong-primitive inputs retain mismatch precedence (`task-1-report.md:20`), but the added regression only checks INTEGER (`packages/domain/src/catalog/category-template-service.test.ts:19`). Check member primitives before returning the bounds error and cover an oversized wrong-member MULTI_SELECT input. This still safely rejects the value, so the issue is limited to public error consistency.
2. `.superpowers/sdd/2026-09-19-05-catalog-condition-grading/logs/task-1-build.log:36`: the saved production build emits `dist/worker.cjs 6.8mb ⚠️`. The build succeeds and the task does not change worker code; nevertheless the supplied evidence is not entirely warning-free. Record the bundle-size warning as an acknowledged build diagnostic and assess it in the owning worker work; no failing suite or new worker regression is inferred.

## Assessment

**Task quality:** Approved with minor findings. **Counts:** Critical 0 / Important 0 / Minor 2.

**Reasoning:** The task has a clean maintenance boundary, reusable contracts, atomic persistence and meaningful database coverage. No blocking correctness or maintainability defect was found; mismatch precedence has one untested multi-select edge case.

## Checks and evidence

- Read the supplied diff once. The initial tool response omitted the contracts/schema/migration segment because of output truncation; read only that missing segment separately. No changed source file was reread and no git command or test suite was run.
- Named external risk — validator reuse and package boundary: inspected unchanged `packages/domain/src/custom-fields/custom-field-service.ts:1` and `packages/contracts/src/custom-fields.ts:1`. The validator has no runtime DB import and preserves the required primitive/precision/date/selection semantics; this also establishes the MULTI_SELECT counterexample above by control-flow inspection, without rerunning tests.
- Named external risk — integration database safety: inspected unchanged `packages/db/src/test-database.ts:8`; it rejects production mode and database names without `_test` suffixes.
- Inspected saved evidence: `logs/task-1-red.log:59` shows the genuine required rejection failing; `logs/task-1-bounds-red.log:40` shows the later behavioral RED; `logs/task-1-final-focused-green.log:7` reports 33/33; `logs/task-1-full-suite.log:66` reports 57 files / 410 tests; `logs/task-1-cleanup-green.log:6` reports the final cleanup-only 4/4 rerun. Lint, final typecheck, production build, create-only migration, deployment of migration 13, and Prisma generation logs all show successful completion. No test warning/error noise appears in the passing test logs; the build warning above is observed separately.
- Only this review report was written; source, index, HEAD and branch state were untouched. No helper agents were used.
