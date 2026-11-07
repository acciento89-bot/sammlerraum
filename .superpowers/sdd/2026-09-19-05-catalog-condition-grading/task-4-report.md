# Task 4 implementation report

Base: `e2b30e8daf316ed95cd05acdfc83c8048436cbe6`. Root GO was received only after Task 3 review, exact-source CI and completion persistence. Preflight was read-only; no Task 4 source, schema, test, database, index or commit mutations preceded GO.

## Result and consumer contracts

One maintenance-authored condition scheme belongs to each canonical CategoryTemplate. Ordered options preserve exact stable `labelKey`, authored DE/EN labels, activity, and optional integer normalized band 1–5. Personal items have independently nullable `categoryTemplateId` and `conditionOptionId`; no catalog link is required and no duplicate normalized band is persisted on the item. The public item whitelist remains unchanged.

`createConditionService(database, actorUserId)` provides `getConditionScheme(categoryId)`, `getItemCondition(itemId)`, `setItemCondition(itemId, optionId | null)`, and `setItemCategory(itemId, { categoryTemplateId, clearCondition? })`. Reads retain historical inactive choices. New selections require active scheme and option. Category replacement/removal rejects a selected condition unless `clearCondition: true` explicitly requests the atomic clear; `null` explicitly clears condition without clearing category. Existing inactive values survive quantity splitting. Task 6 must consume this personal category seam and preserve these facts when catalog links change. Task 5 grading remains a separate future fact.

Authenticated no-store routes are GET `/api/v1/categories/[categoryId]/condition-scheme`, GET/PUT `/api/v1/items/[itemId]/condition`, and PUT `/api/v1/items/[itemId]/category`. PUT bodies are strict, independently stream-bounded at 2048 bytes, use exact Origin validation and uncached/unrefreshed live sessions. Authoritative owner checks run again in the actor-bound domain transaction. Foreign/missing items are hidden by 404; inactive mutations and implicit condition clearing return 409. Item create/update/read/list/split results expose both nullable relation IDs; dedicated routes own category/condition writes.

Maintenance-only `createConditionMaintenanceService` exposes create scheme, append option and scheme/option active toggles. No ordinary-user definition-write endpoint exists. Creates/reads/options are bounded at 100 entries; keys, label keys, DE/EN labels and body size are bounded. Semantic corrections append a new key and retire the old choice.

## Approved design choices and costs

- One scheme/category and immutable semantic identities simplify selection. Corrections retain prior identities rather than editing selected historical labels or mapping.
- V1 uses scalar `labelDe`/`labelEn` with the existing bounded normalized `CatalogLabels` contract and `labels: { de, en }` DTO. Additional locales require an additive schema extension. No user text is automatically translated.
- PostgreSQL guards semantic UPDATE of scheme ID/category/key/labels and option ID/scheme/category/labelKey/labels/band. These cover actual label storage. Native RESTRICT foreign keys prevent deletion of referenced options and schemes. Unused fixture definitions remain normally deletable; no trigger toggles, resets or bypasses were used. This is not a tamperproof operator audit-history guarantee.
- Composite item option/category and option scheme/category foreign keys enforce scope. An explicit option-implies-category CHECK closes nullable MATCH SIMPLE bypass. Integer-band and 0–99 option-position CHECKs preserve range and bounded cardinality.
- Selection locks item, scheme FOR SHARE, then option FOR SHARE within one transaction. Maintenance activation never acquires an item lock and follows compatible scheme/option order, so deactivation cannot commit between active validation and assignment.
- No production bootstrap, fabricated complete category scale, provider write, production migration, push, merge or deployment was performed. Bootstrap/Task 7 usability remains separate.

## Genuine test chronology

1. `task-4-original-red.log`: with the original schema, a real PostgreSQL owner/collection/item fixture succeeded. Existing generic item update dropped unsupported synthetic condition facts; reread failed on absent exact label (`undefined` versus `vinyl.vg_plus`). That was an existing-path persistence probe, not the final service test, and is not claimed to have passed unchanged.
2. Added the nullable schema and runnable dedicated nonassigning seam after root clarification. Working PostgreSQL category/scheme/option/item fixtures called `setItemCondition`. `task-4-dedicated-red.log` failed on `saved.conditionOption?.labelKey` before functional assignment. `task-4-dedicated-green.log` passed the same dedicated call and unchanged exact-label/band assertions after implementation; reread also verifies persisted option identity and band.
3. Expanded PG tests first exposed missing item DTO/split preservation plus Prisma raw unique-error mapping (`task-4-integration-red.log`). Added the integration and adapter-aware conflict mapping; 34 scoped condition/item/API tests passed (`task-4-domain-green.log`).
4. The runnable route scaffold failed five behavioral API tests (`task-4-routes-red.log`); authenticated handlers and dependency adapter passed (`task-4-routes-green.log`). Final focused tests: 15/15 (`task-4-focused-final.log`), including actual PostgreSQL lock-wait observations for both option and scheme deactivation, exact historical labels, nullable bands, owner/lifecycle rejection, explicit clearing, bounded maintenance, database relational guards and inactive split retention.
5. A final self-check tightened route fixture teardown to use the always-defined unique prefix even if setup fails before assigning IDs. This changes only scoped test cleanup; the affected 15 tests passed again (`task-4-teardown-focused.log`).
6. Additive migration `20261017225203_condition_schemes` follows the latest existing `20261017225202_catalog_rollback_audit_target`. An initial migrations-directory diff required unavailable shadow configuration and failed before any DDL; the successful generation used the pure local Prisma executable against the configured test datasource. Complete SQL was inspected before deployment. No applied migration was edited or renamed. Migration deployment and client generation succeeded (`task-4-migrate.log`, `task-4-generate.log`).

## Final verification

- Full serial suite with real PostgreSQL enabled: **65 files, 467 tests passed**, zero failures (`task-4-full-suite-final.log`). This includes all existing unit and database tests, not only the new files.
- Workspace lint: passed (`task-4-lint-final.log`).
- Workspace typecheck: passed (`task-4-typecheck-final.log`).
- Production workspace build: passed, including worker bundles and Next.js production compilation with all three new route entrypoints present (`task-4-build-final.log`).
- Prisma schema validation passed; all 18 migrations applied; schema drift reports no difference (`task-4-schema-validate.log`, `task-4-migration-status.log`, `task-4-schema-drift.log`).
- CI real-database test registration includes both new condition domain and route test files. CI browser/container/native Sharp gates remain root-owned; no local Docker is available.

Root-owned progress/context and canonical checklists are excluded from implementer staging. Root owns independent review, exact-source CI, push and completion persistence.
