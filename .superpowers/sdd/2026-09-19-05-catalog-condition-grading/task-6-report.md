# Task 6 implementation report

Base: `6b87b34ec5b545eb887b64079ff62e559427ffed`. Implementation began only after root's explicit GO, following Task 5 independent review, exact-source CI and completion persistence. The preceding design preflight made no source/schema/test/database/index/commit mutations. Root approved the complete schema, locking, inference, read/API and original runnable RED design. No subagents were used.

## Result and consumer contracts

`createItemService(database, actorUserId)` now provides `linkItemToCatalog(itemId, entryId, variantId?)`, `unlinkItemFromCatalog(itemId)` and `getItemCatalogLink(itemId)`. New links infer category only when the personal category is null. A different existing category rejects with `ITEM_CATALOG_CATEGORY_MISMATCH`; exact condition, grading and all other personal facts are never rewritten. Unlink clears both catalog IDs and preserves inferred or independently chosen category, exact condition, grading, acquisition/private metadata and associated records.

Task 4's category setter rejects changing/clearing a linked category with `CATALOG_UNLINK_REQUIRED`, including when `clearCondition:true` is present. Explicit unlink must precede that category change. Same-category condition changes retain their existing behavior. Missing/foreign/deleted items and items in deleted collections remain hidden; archived/disposed owner reads work, mutations reject. Account IDs remain exact; catalog/link UUID inputs normalize lowercase.

An already selected retired variant remains readable and an identical assignment is an idempotent no-op. New selection of another retired variant rejects. No title/identifier-based relinking occurs. Variant summaries preserve UUID, authored primary/translated titles, language, edition and reference so equal titles remain distinguishable.

Both nullable catalog IDs reach the actual item DTO, ORM selection, locked raw item row, resource-query detail SQL, existing list reads and split result/creation data. Generic item create/update inputs do not provide a second catalog assignment path. The separate anonymous PublicItem whitelist is unchanged; owner resource responses expose the links. No personal facts are copied into canonical fields.

Split preserves shared catalog/category/condition links, including existing inactive identities. It retains Task 5's physical specimen policy: any grading-bearing source rejects splitting, and no grading/certificate is cloned or moved. It discovers catalog parents without the item lock, acquires entry SHARE then variant SHARE, locks the owner item and revalidates the discovered IDs. Changed references abort the transaction before another discovery; at most three attempts run. Exhaustion returns `ITEM_CATALOG_RETRY_EXHAUSTED`, including a stable HTTP409 code through the existing split route.

Linking uses entry SHARE -> variant SHARE -> item UPDATE, agreeing with canonical writers' entry-before-variant order. It rechecks ownership/lifecycle/category under the item lock. Category/condition setters never acquire catalog parent locks after their item locks; their existing catalog/category relationship is guaranteed by native constraints. Unlink only needs the item lock. Real tests observe PostgreSQL lock waits in both canonical writer/selection directions and during a competing category change.

## HTTP boundaries and Task 7 integration

All new endpoints require fresh sessions with `disableCookieCache:true` and `disableRefresh:true`; successful and error responses are no-store. This phase deliberately uses authenticated canonical reads, matching the existing condition-scheme API. No moderator grant is required for canonical reads. Anonymous catalog browsing is a later explicit policy change.

| Endpoint | Response/request |
| --- | --- |
| GET `/api/v1/items/[itemId]/catalog-link` | `{link:{itemId,categoryTemplateId,catalogEntryId,catalogVariantId,entry,variant}}`; entry is a current revision/title summary, variant is the retained selected identity summary plus `active` |
| PUT same path | Strict `{entryId,variantId?:UUID|null}`; `{item}` response |
| DELETE same path | No body; `{item}` response showing retained category |
| GET `/api/v1/catalog/search` | `{results,nextCursor}` |
| GET `/api/v1/categories` | `{categories:[{id,key,labels:{de,en}}],nextCursor}` without nested definitions |
| GET `/api/v1/categories/[categoryId]` | `{category}` with one template's typed definitions/stable option keys/authored DE/EN labels |
| GET `/api/v1/catalog/entries/[entryId]` | `{entry:{revision,state,rollbackFromRevision}}`, using the existing canonical snapshot contract |

Mutations require exact Origin before consuming input. Link JSON is counted from the stream independently of Content-Length, limited to2048 bytes, decoded with fatal UTF-8 validation, and checked with strict schemas. Unexpected DELETE bodies are bounded then rejected. Foreign resources return hidden404; inactive/category/variant/retry conflicts return409. Invalid path identities return404, malformed body/query data400, oversized bodies413, absent sessions401 and wrong mutation Origin403. Responses retain the shared redacted request-ID envelope.

Search requires explicit `mode=text` or `mode=identifier`. Text is trimmed2–200 characters and searches authored entry/variant titles, explicit translated titles and variant edition/reference. `%`, `_` and backslash are escaped as literal text. Identifier queries preserve the original value, case, punctuation and leading zeros, bounded1–500 characters; optional namespace/type filters use stable key contracts. Optional category UUID is supported. Retired variants/identifiers are excluded from new search candidates.

Search and category pages default20/max50, use UUID keyset order and bounded canonical base64url cursors with version1 and SHA-256 query/filter identity. Cursors bind normalized query/filter values, not page size; they are pagination state, not authorization tokens. Unknown/duplicate query keys, invalid numeric limits, malformed/filter-mismatched cursors and query strings longer than8192 characters reject. Cursor input is capped2048 characters. Each search result has category identity/authored labels, entry revision, authored primary/translated titles, at most5 variant previews and5 identifier previews/provenance, and total counts. SQL projects these compact summaries without transferring full snapshots, descriptions or attribute arrays per hit.

Current entry detail joins entry.revision to its immutable revision snapshot in one SQL statement; it does not call the writer's multi-query state assembler outside its lock. Category detail also uses one statement. Each response is coherent at its MVCC statement snapshot and includes explicit entry revision. Pagination remains live across requests. Owner link-state reads separately identify a retained inactive variant absent from today's snapshot. Title summaries carry authored translations only; Task 7 should choose an explicit locale match or fall back to the authored primary title, never fabricate translations.

## Native schema and explicit costs

Additive migration `20261017225206_item_catalog_links` follows the inspected latest applied migration225205. Complete hand-authored additive SQL was inspected before applying it to the synthetic PostgreSQL17 test database. No applied migration was edited, renamed or reset.

- Nullable item catalog IDs have composite entry/category and variant/entry foreign keys with ON UPDATE RESTRICT.
- Two CHECKs require category whenever entry is non-null, and entry whenever variant is non-null, closing MATCH SIMPLE partial-null bypasses.
- PostgreSQL column-specific `ON DELETE SET NULL (catalogEntryId)` and `(catalogVariantId)` preserve the personal category; deleting a variant retains its entry link.
- Both item FK tuples have indexes. Exact identifier search has a value-leading `(value,active,entryId)` B-tree.

Prisma7.10 cannot express the deletion-column subset in its schema relation declaration. Comments retain that limitation beside the relations and migration. Both actual migration-diff invocations reported **empty migration/exit0**. This means Prisma reports no represented drift; it does **not** establish that Prisma captures or protects the column subset. Integration tests explicitly inspect `pg_constraint.confdelsetcols`, deletion action `n` and update action `r`. The final native metadata log independently prints the exact two FKs, two CHECKs and three index definitions. Future generated FK replacements must preserve these custom column lists; schema-only recreation is insufficient.

Ordinary canonical hard deletion remains restricted by history, variants, identifiers, attributes and proposal/audit relations. There is no new hard-delete API. Tests prove ordinary unlink, rejection of canonical deletion with retained children, and native deletion behavior using otherwise-deletable isolated synthetic targets with no canonical history. They do not bypass guards or claim normal history-bearing entries are hard-deletable.

Root accepted V1 costs: literal text matching can scan canonical rows; limiting results does not bound scanning work. Exact identifier lookup is indexed. A single existing snapshot/template detail can be large within producer maxima; list/search responses stay compact. Additional full-text indexes, response pagination within a single snapshot, anonymous visibility and broader locale support are deliberate future work. No provider calls, external index, global write route or private proposal/account/item joins are introduced into canonical reads.

## Genuine test chronology and retained attempts

1. Correct additive schema and a dedicated nonmutating unlink scaffold were made runnable. The first fixture used `.variant.id` against Task 2's flat variant result and failed setup; `task-6-unlink-fixture-failed.log` is explicitly **not behavioral RED**. The fixture was corrected after reading the producer return statement.
2. `task-6-original-unlink-red.log` then records the actual PostgreSQL failure: both persisted catalog IDs remained non-null instead of null, while the personal item/condition/grading/purchase fixture worked. `task-6-incomplete-scaffold.log` preserves the approved scaffold. Implementing unlink passed the same unchanged persisted-null/preservation assertions in `task-6-original-unlink-green.log`. This is a new-service incomplete-scaffold RED, not a claim of a pre-existing production defect or later fault injection.
3. Expanded domain tests initially failed on missing link API surface (`task-6-domain-red.log`); that is API-surface RED, not another preservation-behavior claim. Implemented links/category/read/split integration passed8 tests (`task-6-domain-green.log`), then36 link/item/condition tests including concurrency passed (`task-6-links-concurrency.log`).
4. Runnable canonical-read scaffolds returned empty data; three data assertions failed (`task-6-reads-red.log`) and all4 initial read tests passed after implementation (`task-6-reads-green.log`). Route scaffolds returned501; all4 route scenarios failed (`task-6-routes-red.log`). First implementation passed2 and failed2 because the shared body reader rejects absent bodies; DELETE now invokes it only for present bodies, matching the existing grading boundary. Both the failed attempt (`task-6-routes-green.log`, despite its attempted name) and clean4-pass rerun (`task-6-routes-fixed-green.log`) remain.
5. A dedicated split retry-code regression failed because the older route mapper returned generic `INVALID_STATE` instead of the actionable domain code (`task-6-retry-code-red.log`). The route now preserves `ITEM_CATALOG_RETRY_EXHAUSTED`; final focused/full tests include the unchanged assertion.
6. Expanded134-test focused execution had133 pass/1 fail: after upgrading the race fixture to the actual canonical mutation seam, the test's pg_stat_activity substring still expected an unquoted ID. The real writer quotes `"id"`; the observation filter was corrected, with no application locking change (`task-6-focused-complete.log` retains the failure). The three task-specific files then passed24 tests (`task-6-focused-final.log`). One additional disposed/deleted-collection case and explicit deletion-action metadata assertion were added before the final full suite below.
7. Initial typecheck passed. Prisma validate/deploy/generate/format succeeded. No dependency or driver changes, test-database reset, trigger bypass, global cleanup or ignored generated-output repairs were needed in this task.

## Final verification

All commands ran from this feature checkout after `source ../sammlerraum-test-env.sh`, using `npm exec --yes --package=pnpm@10.17.1 -- pnpm` for workspace commands. Logged pipelines used pipefail. Final test/build/lint/type outputs are retained verbatim; raw log whitespace is intentionally preserved.

| Gate | Command/result | Log |
| --- | --- | --- |
| Complete serial real-PG suite | `RUN_DATABASE_INTEGRATION=1 PNPM test --no-file-parallelism`: **70 files,515 tests passed**, zero failures/unhandled errors | `task-6-full-suite-final.log` |
| Workspace lint | `PNPM lint`: passed | `task-6-lint-final.log` |
| Production workspace build | `NODE_ENV=production PNPM build`: passed, including all new Next route entries | `task-6-build-final.log` |
| Post-build types | `PNPM typecheck`: passed | `task-6-typecheck-final.log` |
| Schema validation | Local Prisma executable, `validate --config packages/db/prisma.config.ts`: passed | `task-6-schema-validate-final.log` |
| Migration status | `migrate status`:21 migrations, up to date | `task-6-migration-status-final.log` |
| Represented drift | `migrate diff --from-config-datasource --to-schema packages/db/prisma/schema.prisma --config packages/db/prisma.config.ts --script --exit-code`: empty/exit0, with subset limitation above | `task-6-schema-drift-final.log` |
| Native metadata | Read-only psql `pg_get_constraintdef` and index definitions: exact approved actions/guards/indexes | `task-6-native-metadata-final.log` |

CI's serial real-database allowlist registers both new domain files and the route integration file. No UI was added; Task 7 owns browser selection/separation journeys. Root owns independent review, exact-source remote CI, push/integration and canonical completion persistence. No local Docker, provider, production migration, deployment, push, merge, role grant or checklist update was performed. Root-owned context/progress/phase-review/Task 7 artifacts remain outside implementer staging.

No known unresolved functional failure remains in the implemented scope. Accepted operational limits are the Prisma subset-action representation, live keyset pages, text-scan cost, potentially large single-resource detail and authenticated-only canonical visibility described above.
