# Task 2 implementation report

Status: DONE. Base: `1a96ea3569be83195ddd26b9ec47c5a95c3c8ce4`.

## Implementation and approved design

Added global reference entries, UUID variants, namespace/type/original-value identifiers, category-bound typed entry/variant attributes, authored multilingual text, explicit source/license records, and complete revision snapshots. Same-title variants, including identical language/edition display data, retain distinct reference identities. Actual content keeps its authored primary language; the display helper selects an explicit authored translation or safely falls back to primary text. No content is automatically translated.

`createCatalogMaintenanceService(database)` provides `createCatalogEntry`, `updateCatalogEntry`, `addCatalogVariant`, `updateCatalogVariant`, `addExternalIdentifier`, `rollbackCatalogEntry`, and `getCatalogEntryAtRevision`. Creation returns a revision envelope; adding a variant/identifier returns its authored DTO with the new revision number. Entry patches replace only explicitly supplied validated fields; variant updates replace the complete authored variant DTO (including its default empty source/attribute lists). Every existing-entry write requires the caller's expected revision. Identical identifier tuples are scoped by entry/optional variant, namespace, type and original value; identical provenance is a no-op, changed provenance records a revision.

`createCatalogMutationService(tx)` is the transaction-aware seam for Task 3 approval. It never opens an independent transaction. The caller must pass its active transaction, verify persisted moderator/proposal authority, and let a mutation failure abort that transaction. Public maintenance wrappers own a ReadCommitted transaction. Existing-entry mutations lock the entry row, check expected revision BEFORE no-op detection, validate the proposed state, persist canonical relations, append the complete snapshot, and advance the monotonic revision together. Revision uniqueness plus the entry lock prevents duplicate versions/lost writes. Revision 1 is creation; actual changes append one revision; no-op replacements append none.

Typed values reuse Task 1 `validateAttributeValue`, including all existing primitive semantics and keyed selections. Decimal strings retain full precision; money values remain JSON-safe minor-unit integers/currency objects. Definition metadata is batch-loaded for each attribute list. Composite foreign keys independently enforce that entry and definition share a category and optional variant targets belong to the same entry. A database check also makes the attribute uniqueness target match the variant UUID or entry scope.

Historical reads parse only their stored complete authored snapshot, with no join to today's variants or attributes. Serialization sorts object keys and stable list identities. Snapshots contain entry/variant text, explicit translations, identifiers, typed values plus definition ID/key/type, and every source/license record. They contain no personal DTOs. Strict bounded whitelists reject ownership, purchase price, location, private notes, condition and grading properties; no user HTTP mutation route, role flag, ownership/item link or external metadata fetch was added.

Rollback restores a selected stored authored state as a NEW revision, records its target revision, and preserves all earlier snapshots. Variant and identifier UUID rows absent from restored state become inactive, and restoring a later snapshot reactivates those same identities. No canonical hard-delete API was added. Root approved small explicit JSON records for translations/provenance/typed values with relational identities and category checks, entry+variant attributes and variant-targeted identifiers, and inactive identity retention.

History is application-immutable with a database UPDATE guard and restrictive parent foreign keys. Fixture-scoped DELETE is deliberately allowed for cleanup. This does not claim tamper-proof history against a database operator with arbitrary SQL/DDL access. Root explicitly approved that boundary.

## TDD and behavioral evidence

All commands ran from the repository root using the pinned runner and, except the explicitly noted ad-hoc validation attempt, after `source ../sammlerraum-test-env.sh`. Logs are in `logs/task-2-*.log` beside this report. Every logged pipeline used `set -o pipefail`.

Initial behavioral RED:

```sh
npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/catalog-service.test.ts
```

`task-2-red.log`: 2 failed. Primary-only text selection returned `Moneta` rather than authored `Münze`; plain JSON serialization preserved insertion order rather than deterministic nested key order. These were assertion failures against a functional baseline, not module/fixture errors. The canonical service was then implemented. Chronology deviation: the brief's variant-distinction scenario first executed GREEN with that integrated service, rather than being the first original RED. This is recorded honestly, not relabeled as original TDD.

Real PostgreSQL behavioral RED before the immutable-history guard:

```sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/catalog-service.integration.test.ts -t 'guards persisted'
```

`task-2-database-red.log`: 1 failed, 7 skipped. Updating a persisted snapshot resolved with `{changed:true}` instead of rejecting. The subsequent additive UPDATE-guard migration made this test pass. An earlier missing-table setup failure is retained separately in `task-2-database-setup-failed.log` and is NOT counted as behavioral RED.

Further actual failures preserved before fixes:

- `task-2-focused-green-attempt.log`: 9 passed, 1 failed. Empty entry patch unexpectedly advanced revision 2 to 3 because Zod 4 applied default source/attribute lists inside optional patch fields. A direct isolated schema probe confirmed `{}` parsed to `{sources:[]}`; patch lists now have no defaults and source/attribute content is preserved.
- `task-2-self-review-red.log`, command below: 2 failed, 6 skipped. No-op following rollback returned null rollback metadata instead of its persisted target; malformed provenance URL leaked `ERR_INVALID_URL` instead of `CATALOG_INPUT_INVALID`. Read-state metadata now comes from the corresponding immutable revision, and URL refinements safely catch parse failures.

```sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/catalog-service.integration.test.ts -t 'records rollback|strictly bounds'
```

Additional clearly labeled variant regression mutation check:

```sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/catalog-service.integration.test.ts -t 'keeps same-title'
```

After the production build had completely finished, a temporary fault reused the first same-title variant UUID. `task-2-variant-mutation-red.log`: 1 failed, 7 skipped, specifically `expected 1 to be 4` distinct identities. An EXIT trap restored the original source, and `cmp` verified byte-for-byte restoration. This is mutation evidence, NOT a claim of original variant TDD. No build or other verification overlapped the temporary fault. The final restored focused run passed cleanly.

Final focused GREEN:

```sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=pnpm@10.17.1 -- pnpm vitest run packages/domain/src/catalog/catalog-service.test.ts packages/domain/src/catalog/catalog-service.integration.test.ts
```

`task-2-variant-mutation-restored-green.log`: 2 files, 10/10 passing (8 real-PG integration + 2 unit), no warnings. Tests exercise same-title/language/edition separation; authored translation fallback; deterministic precision-preserving serialization; entry/variant typed values including 38-digit decimal, maximum-safe money, false Boolean and keyed multiselect; foreign-category rejection without partial writes; direct relational scope constraints; identifier namespaces/original values/provenance; immutable historical reads; concurrent expected-revision conflicts; stale no-op rejection; surrounding transaction failure rolling back external approval-marker work AND canonical rows/revisions; two canonical operations committing inside one outer transaction; rollback as a new revision; inactive identity preservation/reactivation; and strict private/unsafe/oversized input rejection.

## Warning investigation

`task-2-warning-trace.log` captured pg `Client.query` -> PrismaPg `PgTransaction.performIO` -> Prisma query interpreter deprecation about overlapping queries on one connection. A direct nested definition read in a transaction was clean (`task-2-warning-isolated.log`). A direct CatalogEntry multi-relation include of variants, identifiers and attributes/definition reproduced it (`task-2-warning-isolated-full-state.log`). Prisma scheduled its child relation reads concurrently even though service calls were sequential. Replaced that one full-state include with sequential bounded relation reads under the already-held entry lock; attribute definitions remain batched. No dependency/driver upgrades. Focused output is now clean.

## Migrations and recovered attempts

- Added `20261017225000_global_catalog`: five new Catalog tables, their indexes/FKs, and the intentional `CatalogAttributeDefinition(id,categoryTemplateId)` composite unique key. SQL was reviewed: no DROP and no unrelated ALTER.
- Added `20261017225200_catalog_revision_guard`: immutable revision UPDATE trigger, positive revision checks and attribute-target consistency check.
- `prisma migrate dev --name global_catalog --create-only` was rejected because the environment is noninteractive, including a TTY retry. Exact initial diagnostic is retained in `task-2-migration-create.log`; it contained the composite unique warning and noninteractive error, no drift/reset request.
- Generated additive SQL using `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`. The package-script banner accidentally prefixed generated SQL; first deploy failed at its first `>` token, before any DDL. `task-2-migrate.log` retains the complete error. Removed that banner from this new uncommitted migration only; marked only this failed migration rolled back with `prisma migrate resolve --rolled-back 20261017225000_global_catalog`; redeploy succeeded (`task-2-migration-resolve.log`, `task-2-migrate-retry.log`). Guard deploy succeeded (`task-2-migrate-guard.log`). No reset, unrelated data deletion or old migration edits.
- First failed integration setup had created two template fixtures before the missing-table error. Retrieved their exact UUID prefix from the narrow test time window, verified no catalog children, and removed only those two exact template keys children-first. All successful suites clean only their own fixture prefix.
- One ad-hoc `prisma validate` inspection omitted the environment source and failed with missing `DATABASE_URL`; rerun after sourcing succeeded (`task-2-schema-validate.log`). An initial ad-hoc fixture inspection also used the wrong relative environment path and made no writes; rerun with the absolute environment path completed the exact fixture cleanup.
- Prisma generation succeeded (`task-2-generate.log`). Initial TypeScript errors about optional variant ID versus null and UUID template-literal inference were fixed; failed diagnostic retained in `task-2-typecheck-attempt.log`.

Migration folder IDs are explicit sequence identities and happen to be ahead of current UTC; names do not prove execution time. Root requires future migrations to sort after `20261017225200_catalog_revision_guard` using max(latest+1,currentUTC). Existing applied history remains unchanged.

## Final verification

```sh
npm exec --yes --package=pnpm@10.17.1 -- pnpm test
npm exec --yes --package=pnpm@10.17.1 -- pnpm lint
npm exec --yes --package=pnpm@10.17.1 -- pnpm typecheck
NODE_ENV=production npm exec --yes --package=pnpm@10.17.1 -- pnpm build
npm exec --yes --package=pnpm@10.17.1 -- pnpm --filter @sammlerraum/db prisma validate
git diff --check
```

- Standard full suite: 48 files passed / 11 gated files skipped; 369 tests passed / 54 gated tests skipped, 0 failed (`task-2-fullsuite.log`). Ran once after implementation fixes.
- Workspace lint: all workspace checks passed (`task-2-lint.log`).
- Workspace typecheck: all workspace checks passed (`task-2-typecheck.log`).
- Production workspace build: passed, including Next production pages and worker bundles (`task-2-build.log`). The normal esbuild bundle-size indicator is informational.
- Prisma schema validation passed. The pre-staging tracked-file `git diff --check` passed, but a final staged source-path check reported one cosmetic trailing blank line at EOF in generated `20261017225000_global_catalog/migration.sql` (`task-2-staged-whitespace.log`). That already-applied generated SQL is deliberately unchanged to preserve its checksum; there are no TypeScript formatting errors.
- Final focused PostgreSQL+unit suite: 10/10 passing, clean output, as above.
- CI PostgreSQL allowlist includes the new integration file. Local Docker/browser journeys and exact-commit CI are root-owned follow-up gates; no claim is made that they ran locally.

## Files changed

- `packages/contracts/src/catalog.ts`: explicit authored inputs, snapshots and DTOs.
- `packages/db/prisma/schema.prisma`: relational catalog identities/relations and revision model.
- `packages/db/prisma/migrations/20261017225000_global_catalog/migration.sql`.
- `packages/db/prisma/migrations/20261017225200_catalog_revision_guard/migration.sql`.
- `packages/db/src/catalog-types.ts` and `packages/db/package.json`: narrow type-only transaction seam export.
- `packages/domain/src/catalog/catalog-service.ts`, `.test.ts`, `.integration.test.ts` and `packages/domain/package.json`.
- `.github/workflows/ci.yml`: real-PG integration allowlist registration.
- This report and `logs/task-2-*.log` evidence.

Root-owned progress/context edits were preserved and excluded from staging. No subagents, pushes, merges, deployment or canonical completion edits.

## Costs and integration obligations

The explicit JSON record schemas need deliberate versioned extension for richer locale/provenance formats. Retaining inactive variant/identifier rows grows stored history; Task 6 must hide inactive candidates and block new links to them while preserving existing personal items. No current deletion API forecloses Task 6's later safe unlink/delete policy. Immutable history intentionally does not prohibit operator-level DELETE. The supplied mutation seam assumes an active caller transaction and server-side authority checks; it is not an authorization API. No known functional failure remains in the covered scope. Independent review and root CI are still required before completion persistence.
