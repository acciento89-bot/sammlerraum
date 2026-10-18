# Task 1 implementation report

Status: DONE.

## Implementation

Added global maintenance-authored category templates with relational DE/EN labels, ordered typed attribute definitions, and ordered keyed selection options. Template keys are globally unique; definition keys/positions are unique within a template; option keys/positions are unique within a definition. Template creation uses a single Prisma nested create, so template, definitions, options, and translations commit atomically. Reads include deterministic position ordering and return validated public DTOs.

The server maintenance factory `createCategoryTemplateMaintenanceService(database)` exposes `createCategoryTemplate`, `getCategoryTemplate`, and `validateAttributeValue`. There is no HTTP route, user-supplied authority flag, or collection policy change. Contracts and domain package exports are registered. The new PostgreSQL integration test is in CI's explicit integration allowlist.

`validateAttributeValue` accepts a strict input definition or persisted DTO and calls the existing `validateFieldValue` implementation. It preserves all ten primitive types and the existing decimal precision, calendar date, URL, money, selection normalization, and selection deduplication behavior. Selection values are stable option keys, independent of translated labels. Legacy custom-field behavior is unchanged. Catalog mismatches map to `CATALOG_ATTRIBUTE_TYPE_MISMATCH`; invalid values and definitions map separately to `CATALOG_ATTRIBUTE_VALUE_INVALID` and `CATALOG_ATTRIBUTE_DEFINITION_INVALID`. Invalid template input and duplicate template keys have stable template-specific errors.

## Decisions

Root approved the following normal design choices before implementation:

- Required strict `{de, en}` labels, each NFKC-normalized, trimmed, nonempty, and at most 200 characters. Raw labels are bounded to 400 characters before normalization. Extra locale or private properties are rejected.
- Authored stable lowercase ASCII keys matching `^[a-z][a-z0-9_]{0,63}$`. Keys are never translated, generated from labels, or silently normalized.
- At most 100 definitions per template and 100 options per selection definition. Definitions and options persist their input order. Non-selection fields reject options, selection fields require options, and duplicate keys are rejected.
- At most 100 multi-select input entries and 20,000 raw characters per string value/selection entry, bounding work before shared normalization. Primitive mismatches retain mismatch errors even if a wrong-type input is oversized.
- Relational translation rows allow future locale expansion, but expanding the public DE/EN contract needs an intentional contract change. The bounded maintenance capacity is intentional.

No entry, variant, proposal, condition, grading, or UI work was included. No personal ownership, purchase, location, or private-note fields were introduced.

## TDD evidence

All commands below ran from the repository after `source ../sammlerraum-test-env.sh`. The pinned runner was `npm exec --yes --package=pnpm@10.17.1 -- pnpm`.

### Initial RED

The test file was written first, then a behaviorless identity scaffold was added for the exported async validation function so the rejection assertion could execute rather than fail module loading.

Command:

```sh
npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/category-template-service.test.ts
```

Exit 1; 23 failed, 4 passed. The required INTEGER/string test failed with `AssertionError: promise resolved "not-a-number" instead of rejecting`. Other missing normalization and rejection cases also failed. Exact output: `logs/task-1-red.log`.

The real database test was also run before its factory and schema existed:

```sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/category-template-service.integration.test.ts
```

Exit 1; 4 tests failed because `createCategoryTemplateMaintenanceService` did not yet exist. Teardown also found the absent Prisma model. This is missing-feature evidence, separate from the genuine behavioral RED above. Exact output: `logs/task-1-db-red.log`.

### Initial GREEN

```sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/category-template-service.test.ts packages/domain/src/catalog/category-template-service.integration.test.ts
```

Exit 0; 2 files, 31 tests passed. Exact output: `logs/task-1-green.log`.

### Self-review bounds RED/GREEN

Additional tests exposed an oversized selection entry that still normalized to a valid key and oversized wrong-primitive inputs that incorrectly returned invalid-value errors. Before the fix, the focused unit command above exited 1 with 2 failed / 27 passed. Relevant output: `promise resolved "[ 'mint' ]" instead of rejecting`, and expected `CATALOG_ATTRIBUTE_TYPE_MISMATCH` versus actual `CATALOG_ATTRIBUTE_VALUE_INVALID`. Exact output: `logs/task-1-bounds-red.log`.

After bounding selection entries and retaining mismatch precedence, the combined focused command above exited 0: 2 files, 33 tests passed (29 unit + 4 PostgreSQL). Exact output: `logs/task-1-final-focused-green.log`.

## Database migration and validation

PostgreSQL 17.11 at localhost was used through the configured synthetic `sammlerraum_test` database. New tests use `createTestDatabaseClient`, which refuses production/non-test databases, and `RUN_DATABASE_INTEGRATION` gating. Cleanup deletes only fixture-owned children before fixture parents; it never deletes unrelated fixtures.

```sh
npm exec --yes --package=pnpm@10.17.1 -- pnpm --filter @sammlerraum/db prisma migrate dev --create-only --name catalog_templates
npm exec --yes --package=pnpm@10.17.1 -- pnpm --filter @sammlerraum/db prisma migrate deploy
npm exec --yes --package=pnpm@10.17.1 -- pnpm --filter @sammlerraum/db prisma generate
```

All exited 0. Created and applied additive migration `20261017201618_catalog_templates`; all 13 migrations applied successfully. Generated Prisma Client 7.10.0. No reset, old migration edit, or schema deletion occurred. Exact outputs: `logs/task-1-migration-create.log`, `logs/task-1-migration-deploy.log`, `logs/task-1-prisma-generate.log`.

The four PostgreSQL tests cover localized ordered roundtrip; stable-key validation from persisted DTOs; missing-template reads; rejection of private/invalid/beyond-capacity definitions without leftover rows; concurrent duplicate-template conflict mapping; same attribute key in different templates; database enforcement of scoped definition/option key and position uniqueness; and atomic nested failure rollback. The direct nested-failure test characterizes the database transaction mechanism used by the service.

## Broader verification

```sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm test --no-file-parallelism
npm exec --yes --package=pnpm@10.17.1 -- pnpm lint
npm exec --yes --package=pnpm@10.17.1 -- pnpm typecheck
NODE_ENV=production npm exec --yes --package=pnpm@10.17.1 -- pnpm build
```

- Full suite: exit 0, **57 files / 410 tests passed**, no skipped tests or warning/error output. Run once after final production behavior changes; exact output `logs/task-1-full-suite.log`.
- Lint: exit 0, all workspace checks passed; `logs/task-1-lint.log`.
- Final typecheck: exit 0, all workspace checks passed; `logs/task-1-final-typecheck.log`.
- Build: exit 0, all workspace builds passed, including the Next.js production build; exact output `logs/task-1-build.log`.
- After the full suite, test cleanup was tightened to explicitly remove child rows before parents, as requested by context. The affected real-DB test file was rerun: exit 0, 4/4 passed; `logs/task-1-cleanup-green.log`. This changed test cleanup only, not production behavior.
- Prisma schema formatting and `git diff --check` passed. No unrelated files were reformatted.

Exact command outputs are preserved under this phase workspace's `logs/task-1-*.log` (ignored local evidence); this report contains the reproducible commands and key results.

## Files changed

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20261017201618_catalog_templates/migration.sql`
- `packages/contracts/src/catalog.ts`
- `packages/contracts/package.json`
- `packages/domain/src/catalog/category-template-service.ts`
- `packages/domain/src/catalog/category-template-service.test.ts`
- `packages/domain/src/catalog/category-template-service.integration.test.ts`
- `packages/domain/package.json`
- `.github/workflows/ci.yml`
- This report.

## Self-review and concerns

Reviewed contracts, service, migration, integration constraints, cleanup scope, and package/CI exports. Fixed selection-entry bounds and mismatch precedence with observed RED/GREEN tests. No unresolved design or correctness concerns. DE/EN and capacity limits above are intentional approved constraints. Local Node is 26 while CI uses 24, per the provided environment; CI remains responsible for the Node 24 run. Browser journeys and Docker builds were outside this task's requested local validation; no browser/worker UI behavior changed.

No push, merge, deploy, canonical ledger, or phase completion edits were performed. Root's `progress.md` change is excluded from this commit.

## Review fix round 1

Addressed review M1 and M2. The bounds guard ran before the shared MULTI_SELECT member-type check, so an oversized array containing non-string members incorrectly received `CATALOG_ATTRIBUTE_VALUE_INVALID`. The service now checks member primitives before returning any selection bounds error. This only scans primitive types: selection normalization and deduplication still occur through the unchanged shared validator after the existing input bounds pass.

Added three regression cases: 101 numeric members; 100 valid string members followed by a numeric member; and an oversized string entry plus a numeric member. All must return `CATALOG_ATTRIBUTE_TYPE_MISMATCH`. Existing oversized valid-string array and entry cases continue returning `CATALOG_ATTRIBUTE_VALUE_INVALID`.

### RED

After adding the regression tests and before changing production code:

```sh
source ../sammlerraum-test-env.sh
npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/category-template-service.test.ts
```

Exit 1: **3 failed / 29 passed**. All three regressions expected `CATALOG_ATTRIBUTE_TYPE_MISMATCH` and received `CATALOG_ATTRIBUTE_VALUE_INVALID`. Exact output: `logs/task-1-fix-1-red.log`.

### GREEN and covering checks

```sh
source ../sammlerraum-test-env.sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/category-template-service.test.ts packages/domain/src/catalog/category-template-service.integration.test.ts
npm exec --yes --package=pnpm@10.17.1 -- pnpm --filter @sammlerraum/domain lint
npm exec --yes --package=pnpm@10.17.1 -- pnpm --filter @sammlerraum/domain typecheck
```

Focused tests exited 0: **36/36 passing** (32 unit + 4 real-PostgreSQL). Exact output: `logs/task-1-fix-1-green.log`. Domain lint and typecheck both exited 0; exact outputs: `logs/task-1-fix-1-lint.log` and `logs/task-1-fix-1-typecheck.log`.

The earlier 410-test full-suite and production-build evidence applies to the original implementation commit `7dce6cc`. Per controller direction, no full-suite or build repeat is required for this narrow error-precedence correction; its focused unit/database regressions and covering lint/typecheck are the review-fix evidence.

### Existing build diagnostic (M2)

The saved successful production build includes `apps/worker build: dist/worker.cjs 6.8mb ⚠️` at `logs/task-1-build.log:36`. This is an acknowledged existing worker bundle-size diagnostic, not warning-free build output. Category-template work does not modify worker code or bundling; this finding does not establish a new worker regression. Any bundle-size improvement belongs to the owning worker work and is outside this task. The full test run itself had no warning/error output.

Self-review: checked mismatch precedence before both the array-count and entry-length caps, retained the shared validator for valid primitive input, and left all schema/database/maintenance interfaces unchanged. No unresolved correctness concerns from this fix. Only the service, its unit tests, and this report are changed in the follow-up commit.
