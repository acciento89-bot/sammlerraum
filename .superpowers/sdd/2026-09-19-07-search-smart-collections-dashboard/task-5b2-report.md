# Task 5B2 — bounded search references and catalog picker modes

Implemented on reviewed BASE `fbc0b9fbee421f13622298f8ccacfc1d952bb28b`. Ready for root's independent SPEC/QUALITY review and exact CI; no push, merge, deployment, Phase07 checkoff or producer activation occurred.

## Immutable source and evidence

- Source/final frozen commit: `f17393415262ad2074f1434957a6aa01236927e0`.
- Separate verification-evidence commit: `b4826ed2328248a740143234149f3d62c71370a6` (logs, command scripts, source manifest and validation receipt only).
- Original native-gate source tree: `3b104fd8950dbcbab275cc377549783d72e6f3c6`.
- Final source tree: `3ef3e136f5b6b144ab5f0cc34f83de517a5c70ef`, exactly the source commit's tree.
- Only change between those trees: pure test fixture in `packages/domain/src/search/search-reference-service.test.ts`; original blob `5e90ff85355015832b93176f406e42ce9f58c722`, final blob `49162df9909c6ed1a6a0ca437b6188aecba1d420`. Production source and native tests are identical between the native and final gates.
- `logs/task-5b2-source-manifest.txt` lists all 24 owned source/config/test files. `logs/task-5b2-validation-receipt.json` records their SHA256 values, tree/blob identities and gate results. This report is committed afterward so it can name the exact source and evidence commits without a self-referential hash.

All artifacts are inside `.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/`. Root-owned progress, 5C/5D/5E briefs, B1 CI captures, preparation and review files were excluded from staging. Both build/test process sessions settled before handoff. Root reported both exact BASE CI runs successful and released the dependency hold; this does not claim B2 CI has run.

## Delivered boundary

Three real authenticated GET/POST route families now exist at `/api/v1/search/references/{collections,custom-fields,conditions}`. Browser-safe strict contracts are exported through `@sammlerraum/contracts/search-references`. Domain service methods use fixed set SQL, current native metadata and the existing bounded RepeatableRead wrapper. No item values, inventory counts, provider data, rights, sharing, money interpretation, schemas, migrations or indexes changed.

Collection and custom joins require the exact live owned collection. Resolve returns one input-ordered normalized reference per request; public foreign, private foreign, deleted, wrong-parent and missing references return identical unavailable/null entries. Scoped browse failures use generic `FILTER_REFERENCE_INVALID`422. Empty owned collections and canonical categories without schemes succeed with empty results. Conditions retain inactive schemes/options and exact active flags. Category-only `[categoryId,null]` tuples use the same condition family; mismatched nonnull options expose no category/scheme payload.

Lists default20/max50, sort by ID_ASC, have no total, and page with a separate ID-only canonical cursor. SHA256 context uses the exact actor/family/parent/limit tuple. Cursor schema, field order, lowercase ID, fatal UTF8, unpadded base64url, byte bounds and re-encode equality are enforced. Shared byte-level token decoding was extracted to the seven-line internal `cursor-json.ts`; existing search cursor schemas/identity remain unchanged.

The B1 body reader gained only the three actual reference envelopes. Root keys remain fixed, duplicate escape-equivalent keys fail, nested objects fail, collection array depth is1 and tuple array depth2. The actual B1 streamed32KiB/fatalUTF8/BOM/media-type behavior remains. A narrow decoded-map seam factors existing strict raw query mechanics without broadening item-search input. POST is body-only and checks exact Origin, then fresh session, then query/body. GET retains normal Origin behavior. Success/error no-store/requestId and closed error mapping reuse the existing API boundary.

The existing category detail route now supports only the two new explicit modes: `view=definitions` returns complete metadata for up to100 definitions without options; `view=definition&definitionId=...` returns exactly one category-matching definition and up to100 authored keyed options. Each uses one data statement. Omitted-view callers retain the old full-template behavior and 404 boundary. New mode failures are strict400/generic422 as specified. Canonical categories/definitions/options have no invented active flag.

The exported fixture `packages/contracts/src/search-references.fixture.ts` contains 100 reference IDs across two valid leaves. Contract tests parse it through the real bounded AST parser while permitting only per-leaf50 hydration. Future5C must keep the complete draft independent of lazy active-leaf/current-page label hydration and cache eviction. An authored custom identity missing from suggestions remains a valid filter operand; missing definition is separately unavailable.

## RED, corrections and preserved failures

`logs/task-5b2-native-red.log` records two actual PostgreSQL behavioral failures before implementation, with real native producer fixtures: an owned-only raw collection projection returned just the existing row rather than five ordered available/unavailable states covering missing/public-foreign/owned/deleted/private-foreign; the real legacy active-only condition service returned null for an inactive scheme/option. The later new service passes those same required behaviors. This RED is not a missing-module startup failure. Its wrapper subsequently attempted a read-only zsh variable assignment; the completed Vitest RED output remains intact.

Other encountered failures are preserved rather than removed:

- `task-5b2-native-first-green.log`: domain lacked a direct zod dependency. Fixed by using contract-owned schemas, consistent with existing domain patterns; no dependency or lockfile change.
- `task-5b2-expanded-first.log`: all85 test cases passed, but fixture teardown used a nonexistent ConditionOption relation. Corrected to the actual scheme relation; precisely the abandoned fixture prefix was removed in one transaction, recorded in `task-5b2-fixture-cleanup.log`. Native constraints stayed enabled.
- `task-5b2-types-first.log`: route relative imports and exact optional-property type corrected.
- `task-5b2-types-second.log`: tests now validate unknown JSON through actual DTO schemas before accessing response members.
- `task-5b2-final-regular.log`: first frozen regular run had899 passes, one failed pure boundary test and482 skips. Stricter category identity validation correctly rejected its empty synthetic category before reaching the intended101-option resource sentinel. Only that test fixture changed to valid category metadata. The final corrected regular run passed900/482skip. Root explicitly accepted retaining the unaffected native gate without rerunning it.

Pre-freeze native greens are recorded in `task-5b2-native-green.log` (2), `task-5b2-routes-first.log` (28), and `task-5b2-expanded-green.log` (43). All subsequent passing gates were preserved; no cache cleanup, DB reset or repeated passing suite was used to improve results.

## Exact final commands and results

Working directory: `/Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum`. Every command sourced `../sammlerraum-test-env.sh` and used Node24.19.0/pnpm10.17.1. Database access used the guarded root-owned PostgreSQL17.11 `sammlerraum_test` environment. The exact executable command records are `logs/task-5b2-final-checks.sh` and `logs/task-5b2-final-checks-continue.sh`.

```sh
source ../sammlerraum-test-env.sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run --no-file-parallelism packages/domain/src/search/search-reference-service.integration.test.ts apps/web/src/lib/search-reference-routes.integration.test.ts packages/domain/src/search/search-read.integration.test.ts packages/domain/src/search/search-retained-integrity.integration.test.ts packages/domain/src/search/item-search-service.test.ts packages/domain/src/search/smart-collection-service.test.ts packages/domain/src/catalog/catalog-read-service.test.ts packages/domain/src/catalog/category-template-service.integration.test.ts packages/domain/src/condition/condition-service.test.ts apps/web/src/lib/item-search-routes.integration.test.ts apps/web/src/lib/private-search-routes.integration.test.ts apps/web/src/lib/dashboard-routes.integration.test.ts apps/web/src/lib/smart-collection-routes.integration.test.ts apps/web/src/lib/catalog-link-routes.integration.test.ts apps/web/src/lib/condition-routes.integration.test.ts
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm test
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm typecheck
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm lint
NODE_ENV=production npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm build
```

| Gate | Exact result | Evidence log |
|---|---|---|
| Relevant database-enabled suites |15 files,235 passed,0 skipped;30.72s; exit0|`task-5b2-final-native.log`|
| Corrected regular workspace suite |79 passed files/41 skipped;900 passed cases/482 skipped;7.19s; exit0|`task-5b2-final-regular-corrected.log`|
| Workspace types |all10 packages Done; exit0|`task-5b2-final-types.log`|
| Workspace lint |all10 packages Done; exit0|`task-5b2-final-lint.log`|
| Production workspace build |Done, including all3 new route modules; exit0|`task-5b2-final-build.log`|

235 is the **DB-enabled suite total**, not a claim that every individual assertion independently queries PostgreSQL. Existing regression files also include transport-only cases. Within the43 new guarded B2 cases:14 domain cases execute real DB reads/mutations;5 route cases execute actual domain SQL;24 route cases exercise authentication/raw transport validation before SQL, with shared native fixtures. Separately,30 new pure cases comprise5 contracts,13 cursor,4 output/budget boundary cases and8 body-reader cases. Regular900 passes are the regular/non-DB gate; its482 skips are intentionally guarded database cases, not native coverage. The selected native gate does not claim all482 skipped cases were executed.

## Bounded execution, plans and capacity

All metadata list/hydration and new catalog modes use one data statement per attempt: initial transaction settings plus per-statement settings plus data =3 `$queryRaw` calls. Custom OPTIONS uses two data statements in one snapshot =5 calls. Native wrappers assert1/50 collection hydration,50 custom summaries,50 condition tuples,1/2 custom OPTIONS and the two catalog modes; driver transaction control and authentication overhead are explicitly excluded. Inputs and cursors fail before acquisition. ReadAt comes from the first SQL transaction clock, including empty-parent markers.

SQL transfers at most51 list entries,50 hydration entries,101 condition options for complete native-cap validation,101 canonical definitions/options, or two custom101-option arrays. Custom OPTIONS uses a single set statement for both authorized definitions, not application loops. Metadata-only canonical choice SQL never joins option rows; the selected-definition SQL restricts category+definition before reading at most101 options. All TEXT projections have bounded-byte guards returning invalid/null markers, followed by native producer DTO validation. The native2,000,000-character collection corruption is projected to a small invalid result and rejected500, never truncated to a plausible label. Incorrect custom UTF16 output, absent select options and unexpected nonselect options also fail500; declared cardinality/byte/time exhaustion fails503 with no partial result.

`logs/task-5b2-query-plan-summary.json` extracts the actual final `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)` evidence from the native log:

| Operation | Execution ms | Root shared hits/reads | Dataset/transfer |
|---|---:|---:|---|
| Owned collection list |0.727|18/0|1000 owned collections;51 candidate labels max|
| Collection hydration50 |0.230|18/0|50 missing IDs against the1000-owned inventory;50 closed outputs|
| Custom summary |0.032|4/0|one exact owned definition|
| Custom options |0.036|7/0|one two-option definition; bounded option subquery|

These plans measure finite local fixtures, not production latency guarantees. Existing owner/index and sequential/sort choices are visible in the full plans. The owner list may scan/sort owned candidates; LIMIT proves bounded transfer, not constant scan cost. No measured requirement justified an index request or schema change.

The actual valid100-definition×100-option canonical fixture produced:

- Definition-choice response: **59,280 bytes**, all100 definitions selectable, no options.
- Selected-definition response: **51,676 bytes**, exact last definition with100 keyed DE/EN options.
- Unchanged legacy full template: **5,108,419 bytes**, all100×100 options returned.

Native101 canonical definition/option and custom-option fixtures hit503 without truncation. Two valid100-option custom definitions succeed together. Native condition position constraints prevent a101st option; the101-option sentinel is therefore tested explicitly at the projection boundary, with constraints left enabled. The1MiB final serialization guard is tested using a synthetic schema boundary because the supported native projection cardinalities and string limits are already substantially below1MiB; it is not presented as an oversized valid native DTO. Validation/serialization and post-transaction budget checks are pure controlled-clock/boundary tests; installed statement timeout, lock timeout and recognized serialization retry are covered by the actual existing native read-wrapper suite included above.

## Proof coverage and compatibility

- Native ownership/order/availability proofs cover actual foreign and deleted custom definitions as well as collection labels, absent IDs, wrong-parent pairs, uppercase normalization, inaccessible browse parents and successful empty parents.
- Lists cover empty/single/default20/max50/51/exhausted states, duplicate names, relabeling, parent deletion,51 custom definitions and100 retained conditions. Cursor tests bind actor/family/parent/limit and reject noncanonical encodings, malformed UTF8, extra keys, wrong versions and createdAt-shaped search tokens. Existing search/saved replay regressions run on the shared byte helper.
- Strict contracts and actual adapters reject malformed IDs, alias duplicates, empty/51 batches, SUMMARY overflow and OPTIONS3. Authored custom option values remain positional; missing suggestion membership retains the real filter identity. Condition category-only/null, mismatch, missing, inactive and no-scheme cases retain their distinct closed outcomes.
- Native custom snapshot test performs concurrent definition rename, authored option edit and parent deletion between metadata and option reads. The response retains the original name/options; the following request becomes unavailable. SQL statement settings and wrapper bounds are unchanged.
- B1 raw-f/private POST/GET equivalence, inner/outer duplicate rules,32KiB/fatalUTF8/BOM handling, auth/cursor behavior and dashboard semantics remain covered by the relevant native gate plus regular contract/body tests. Existing saved, catalog and condition regressions pass. Smart Collection mutation parsing was not expanded.
- New route errors preserve closed generic messages, no-store/requestId and do not expose fixture labels or SQL. New malformed/cap cases map500/503 rather than escaping as caller Zod400. The old omitted-view catalog404 and full response remain explicitly tested.

## Remaining gates

Root independent SPEC and QUALITY review, root acceptance, and exact B2 CI/push remain outstanding. Task5C owns frontend lazy hydration/cache/draft behavior, including the lossless exported100-reference fixture. Label route availability does not enable new filter producers. Full original Task5/Phase07, UI/browser behavior, provider/rights work and production deployment are not completed by this bounded backend milestone. Source, DB and suite ownership are released to root after this report; no further worker process or mutation remains active.
