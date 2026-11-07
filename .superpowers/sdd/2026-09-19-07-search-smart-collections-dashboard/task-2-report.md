# Phase07 Task2A implementation report

Date: 2026-10-18. Status: **owned available-family milestone implemented and locally verified; original full Task2 is NOT complete**. Source commit `b57c9a371a566030eac31d74c0c7df3de85dc83b`; starting base `4b4dce2d0eefc5d4ec85139efbbf2de71d50dd6d`. No push, merge, deployment, provider activation, production data operation, ledger/checklist edit, reviewer or child agent was performed by this implementer. Root-owned ledger/progress modifications remain outside these commits. The canonical original task count is unchanged.

## Delivered contract and design

- `createItemSearchService(database).searchItems(actor, query)` implements strict text/filter/lifecycle/limit/cursor input, fixed OWNED scope and createdAt/id descending order. Direct null filter is supported; HTTP `f=null` is rejected.
- One internal `Prisma.sql` compiler handles the validated mixed AST with fixed identifiers and bound operands. No unsafe SQL, user-selected column/path/sort, in-memory inventory filtering or per-item service calls. Count and limited rows share the exact owner/live-parent/lifecycle/predicate relation.
- One bounded RepeatableRead view covers clock, reference resolution, relevant typed integrity, pre-cursor total and keyset rows. Batch reference validation returns one boolean and applies before Boolean matching, including NOT/OR/empty matches. Invalid private/nonexistent references share one closed outcome. Unknown tag/custom selection identities can match nothing; selected catalog option keys must exist.
- The narrow internal composition seam is `runSearchRead(database, work)` plus `executeItemSearch(tx, actor, normalizedQuery, trustedResolutionContext)`. A future saved-query resolver may load its owned row through that bounded tx and pass its id/revision; the public direct query accepts no context. Root explicitly accepted this seam. No SmartCollection schema/framework was added.
- Typed catalog casts use CASE-protected shape/format/range guards, including PG17 date input validation and exact numeric conversion. Relevant malformed retained facts fail the whole owned outer scope before matching. Native SQL constraints protect typed row shape; explicit guards additionally reject nonfinite custom decimals and out-of-range native dates. False, zero and empty authored multi-select remain present. Exact entry/selected variant facts may be retained/inactive; removed values are missing with no history fallback.
- Latest manual per-unit row is chosen before denomination and inclusive range, using observedAt/createdAt/id ordering and bound bigint strings. Raw purchase/custom/catalog money presence does not classify legacy denomination.
- Literal broad text uses NFKC plus explicit `pg_catalog."und-x-icu"`; exact typed strings and producer-normalized identities use `pg_catalog."C"`. Required ICU collation availability is checked closed. Broad fields follow the approved whitelist, excluding private notes, other variants and unselected option labels. Deployment/collation/live-pagination semantics are documented in `docs/search/owned-item-search.md`.
- Canonical bounded base64url cursors bind actor, normalized filter/text, lifecycle, limit, fixed versions/sort, and trusted saved context. Live revalidation runs every request; cursors are unsigned context checks, not authorization or frozen snapshots.
- GET route uses fresh auth (cookie cache/refresh disabled), raw encoded-query size before decoding, strict percent/UTF-8/key/numeric validation, no-store/request IDs, and closed 400/401/414/422/503/500 errors. No submitted payload, SQL cause, Zod issue input or unavailable reason is projected. Summaries use the exact approved whitelist; total overflow fails before Number conversion. The response is validated and capped at 1 MiB.
- A narrow shared read dependency classifier was extracted verbatim from valuation-query. Existing exported `isValuationDependencyFailure` is an alias; valuation retry/query behavior is unchanged. Search retries only recognized SQLSTATE40001, at most three complete transactions. Its 12s total, 5s transaction, 2s acquisition/statement and 500ms lock budgets recompute remaining time and check after awaits.

## TDD and actual failure history

1. `logs/task-2-red.log`: real guarded PostgreSQL ownership fixture, missing authorized service assertion failed (1 test). The retained final test asserts inaccessible private/public rows are absent and total is exactly the owner match count.
2. `logs/task-2-route-red.log`: native authenticated adapter fixture and route contract tests failed because the route handler did not exist. `task-2-first-green.log` then passed 141 tests (including the unchanged Task1 AST suite).
3. `logs/task-2-native-matrix-first.log`: 62/66 passed; three typed contains cases exposed PostgreSQL POSITION grammar with collated expressions, and the literal `% _ backslash quote` broad fixture exposed the JS/SQL escape boundary. Replaced POSITION with parameterized `strpos` and bound the fixed escape character. `task-2-native-matrix-green.log`: 66/66 passed. These are preserved pre-fix behavioral failures, not mocked compiler-string tests.
4. `logs/task-2-budget-integrity-red.log`: the new native NaN/custom-date regression failed because the relevant native integrity checks were absent. Added guards; `task-2-budget-integrity-green.log`: 77/77 passed. That initial run also exposed a test-harness void return from advisory-lock SQL; it was changed to a supported text projection without changing production logic.
5. `logs/task-2-wire-boundary-red.log`: 3 failing tests proved that splitting on `?` truncated subsequent literal question marks and could undercount encoded bytes. First-marker slicing now preserves the full query and includes its leading marker in the 32 KiB limit. `task-2-wire-boundary-green.log`: 11/11 passed.
6. Other preserved iteration failures: initial domain Zod dependency/schema placement and strict TypeScript narrowing were corrected by keeping schemas in contracts and reusing validUnicode; manual tie fixtures initially violated existing currency/exponent and observedAt<=createdAt constraints. Fixtures were corrected, never constraints or producers. `task-2-focused-complete.log` passed 230 tests before the additional 11 wire-boundary tests were added.

Tests were expanded against actual storage after the initial feature RED, with further RED/GREEN regressions for discovered hazards. This report does not claim that every eventual matrix assertion preceded every line of implementation.

## Frozen validation and source identity

`logs/task-2-frozen-source.json` records SHA256 for all 24 owned source/test/document/configuration files before the final gates. Every hash was rechecked unchanged before staging/commit. `logs/task-2-staged-source-check.log` records the explicit staged file diff check/stat. No source edits occurred during final gates or generated-cache recovery.

All commands use `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm ...`, with synthetic environment loaded by `source ../sammlerraum-test-env.sh`. `logs/task-2-runtime.log` confirms Node24.19.0, pnpm10.17.1, `sammlerraum_test`, PostgreSQL17.11(Homebrew), and deterministic `und-x-icu`. Test clients enforce nonproduction and a database name ending `_test`.

| Gate | Exact command suffix | Result | Evidence |
| --- | --- | --- | --- |
| Regular workspace | `test` with RUN_DATABASE_INTEGRATION=0 | **71 files passed /33 skipped; 769 tests passed /348 DB-gated skips** | `logs/task-2-final-regular.log` |
| Workspace types, initial | `typecheck` | Failed on pre-existing generated Next duplicate declarations | `logs/task-2-final-types.log` |
| Workspace types, recovered | `typecheck` | **exit0** | `logs/task-2-final-types-recovered.log` |
| Workspace lint | `lint` | **exit0** | `logs/task-2-final-lint.log` |
| Production build | `build` with NODE_ENV=production | **exit0**, new `/api/v1/search/items` route in build output | `logs/task-2-final-build.log` |
| Full CI-listed native gate | `vitest run --no-file-parallelism` plus all 43 CI database files, RUN_DATABASE_INTEGRATION=1 | **43 files/457 tests passed; zero skips** | `logs/task-2-final-native.log` |

`logs/task-2-final-gates.json` records every exact expanded command, exit code and duration, including the initial typecheck failure. The final native allowlist includes new search-service78, search-read5, search-route12 tests (**95 new native tests**) and unchanged valuation-query27 plus valuation-route10 regressions. The new always-on tests are input/cursor12, budget/total6 and wire11 (**29 regular tests**). Existing Task1 AST117 tests are unchanged; they are not new work or a repeated Task1 acceptance review.

### Generated-cache recovery

Workspace typecheck included ignored `.next/types/**/*.ts` duplicates: `routes.d 2.ts`, `routes.d 3.ts`, `cache-life.d 2.ts/3.ts`, duplicated root-params and validator files. Root independently confirmed no active Next server for this checkout. Only `apps/web/.next/types` was moved reversibly to:

`/var/folders/tg/78fwjs7j4zd62l39w92v2gtw0000gn/T/sammlerraum-search-next-types-7zqaq16j/types`

Then installed `next typegen` regenerated route types. Source remained unchanged; types/lint/build subsequently passed. Original failure, quarantine path and regeneration output are retained in `task-2-final-types.log`, `task-2-next-cache-quarantine.log`, `task-2-next-typegen.log`. No unknown process was stopped or other ignored subtree deleted.

## Native evidence map

| Available capability / hazard | Native evidence in item-search-service unless noted |
| --- | --- |
| Ownership, live parent, stored visibility | Owned private/public versus foreign private/public; hidden count; deleted item/parent; no public discovery |
| Lifecycle and pagination | ACTIVE/ARCHIVED/DISPOSED/ALL, both timestamps; tied createdAt keys, limit+1, full pre-cursor total including exhausted page; actor replay rejection |
| Snapshot / live edits | Changes committed between count and rows: lifecycle, item deletion, parent deletion, tag deletion, custom value edit, catalog value edit; response remains internally consistent and next read sees new state |
| Collection/category/condition | eq/in/present/missing and retained inactive condition; selected category semantics |
| Grading | Same-row provider+grade+certificate, ASCII-only provider identity, exact scale/decimal comparison, absence; different rows cannot compose one match |
| Purchase/manual money | Raw zero presence/missing; latest-before-currency, >safe-number bigint, zero/int64 maximum, timestamp/id ties, quantity7 per-unit semantics; allowed native exponents0/2/3/4 and exponent1 non-match |
| Tags / Boolean logic | Producer folding including İ expansion/space collapse; hasAny/hasAll/present/missing; nested AND/OR/NOT with absent relations |
| Media/document | Both relation types, private document category, owner checks; READY versus pending/processing/failed and cleanup-claimed assets; scheduled orphan does not itself make READY unreadable |
| Ten custom types | SHORT/LONG_TEXT, INTEGER, DECIMAL, DATE, BOOLEAN, URL, SINGLE/MULTI_SELECT, MONEY; presence/missing, false/zero/empty array, safe integer boundary, exact 18-digit decimal fraction, 2 versus10 numeric order, literal case-sensitive text, normalized nonexistent identity non-match, multi subset/all/any |
| Ten catalog types | Same supported tests on actual JSONB roots, reference option keys, guarded casts, scoped missing outside category, retained inactive exact variant, no entry fallback after selected typed value removal |
| Malformed relevant facts | Wrong number/string/boolean/array/object shapes; decimal exponent/NaN/overflow; invalid calendar date/year zero; unsafe integer; invalid option array/money; native NaN/BC date. Whole-query invariant under NOT and nonmatching text; foreign-only corrupt catalog fact ignored |
| Broad text and collation | DE/EN category/selected option labels; composed/decomposed accents; ÄÖÜẞ folding; literal percent/underscore/backslash/quote; identifiers/grading/custom/catalog titles/translations; no private notes/other variant/unselected labels; injected absent-collation condition closes before text SQL |
| Whole-tree dependency/reference rejection | Duplicate/market/purchase/custom-money/catalog-money ranges under NOT/OR and no-match text; private/nonexistent/type-mismatched definitions and invalid catalog keys yield constant reference error |
| Native deadline/driver | Actual settings; ~2s pg_sleep statement timeout => installed Prisma P2010/nested57014; ~500ms advisory lock timeout; ten occupied connections => ~2s P2028 acquisition failure; actual RAISE SQLSTATE40001 retries exactly3; all return no partial result |
| Budget/overflow/cursor/wire | Always-on tests cover post-await/acquisition/overall retry budget, safe-count overflow, canonical/fatal-UTF8/context cursor decoding; native and regular route suites cover raw/encoded limits, duplicate/unknown keys, malformed percent/UTF8, strict numeric grammar, auth freshness, no-store/requestId, exact whitelist and safe closed status/code envelopes |

Response size is enforced after schema validation. Valid 50-row summaries are already far below 1 MiB because the DTO bounds each field; no artificial overlarge valid native response was manufactured. Required limits are not interpreted as scan bounds or universal HTTP wall-clock guarantees.

## Measured plans

Frozen native run added and removed 1000 synthetic owner items (1002 owner candidates including the fixture), then ran actual EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) for pre-cursor counts and 21-row pages. Full plans are in `task-2-final-native.log`; no estimates are presented as measurements.

| Query | Planning ms | Execution ms | Shared hit blocks |
| --- | ---: | ---: | ---: |
| Owned count | 0.149 | 0.228 | 24 |
| Owned rows | 0.111 | 0.280 | 24 |
| Broad count | 0.905 | 1.454 | 45 |
| Broad rows | 0.744 | 1.595 | 45 |
| Custom decimal count | 0.132 | 2.503 | 2027 |
| Custom decimal rows | 0.118 | 2.520 | 2027 |

This small synthetic workload does not establish production-scale guarantees. Typed correlated lookups used many buffer hits; no workload evidence here justified changing indexes or schema. Broad search/count can scan authorized inventory, still subject to statement/total deadlines.

## Owned files

- `.github/workflows/ci.yml`
- `packages/contracts/package.json`
- `packages/db/package.json`
- `packages/domain/package.json`
- `packages/domain/src/valuations/valuation-query.ts`
- `docs/search/owned-item-search.md`
- `apps/web/src/app/api/v1/search/items/route.ts`
- `apps/web/src/lib/item-search-route-dependencies.ts`
- `apps/web/src/lib/item-search-routes.integration.test.ts`
- `apps/web/src/lib/item-search-routes.ts`
- `packages/contracts/src/item-search.ts`
- `packages/db/src/search-sql.ts`
- `packages/domain/src/api/read-dependency-errors.ts`
- `packages/domain/src/search/item-search-service.test.ts`
- `packages/domain/src/search/item-search-service.ts`
- `packages/domain/src/search/search-compiler.ts`
- `packages/domain/src/search/search-cursor.ts`
- `packages/domain/src/search/search-input.test.ts`
- `packages/domain/src/search/search-read.integration.test.ts`
- `packages/domain/src/search/search-read.test.ts`
- `packages/domain/src/search/search-read.ts`
- `packages/domain/src/search/search-text.ts`
- `packages/domain/src/search/search-typed-guards.ts`
- `apps/web/src/lib/item-search-routes.test.ts`

## Self-review and retained gates

Reviewed fixed SQL identifiers/operand binding, nullable-to-two-valued logic, owner/live-parent equality in count and rows, selection/category scoping, protected numeric/date/array expressions, latest-before-denomination ordering, output whitelist, error privacy and live cursor context. Checked the shared classifier against its original body and ran the existing native valuation regressions. Checked staged source file identity against the frozen manifest and excluded all root ledger/preparer/progress work.

No independent SPEC/QUALITY review or exact remote CI/persistence gate was performed by this implementer; those remain root-owned. Historical phase browser suites were not rerun locally, as root directed; production compilation and all native CI-listed tests did run. The root's exact CI includes browser suites.

Full original Task2/Phase07/V1 acceptance remains blocked on the named producer/integration gates: L1 complete legacy interpretation/provenance coverage across all writers; exact bounded market mapping/metric/qualifier/denomination/rights eligibility; Phase09 trusted bulk shared authorization and lifecycle integration; Phase10 real duplicate/wishlist producers; saved-query/dashboard/UI integration and revisiting every partial acceptance gate. Unsupported leaves are rejected now, never silently compiled to false. No original task checkbox/count is advanced by this milestone.


## Fix round 1/5 — accepted review I1 and I2 (2026-10-18)

Root accepted both Important findings in the independent review and authorized this bounded fix on fresh base `52dfd875270da103c63313d7a93480e93bb4ff4b`. That base contains only root documentation beyond the original `888f073` evidence commit; the original source was unchanged. This section appends the correction and does not erase the original failure/gate chronology. Source commit: `3d52a5cefdbc66e5cc7dea68f18bbdbb688b809f`. Full original Task2 remains partial; the count41/ledger is unchanged.

### Changes and exact scope

- **I1:** Broad-text integrity now checks the native custom SHORT_TEXT/LONG_TEXT facts it can read, using item+collection equality under the same independently owned/live-parent/lifecycle outer relation. It checks them before broad text, AST matching, count or rows, including no typed leaf, nonmatching text and an otherwise-false Boolean condition. Foreign corrupt native text is excluded.
- **I2 text:** Shared retained text guards now compare against NFKC followed by the complete ECMAScript trim set, with explicit `C` equality. Length is PostgreSQL codepoint length plus the count of supplementary codepoints, giving the producer's UTF-16 limits (255/10,000). Native tests compare against the actual unchanged `validateFieldValue` producer for all 25 trim characters, supplementary boundaries and legitimate non-trim Unicode/internal whitespace. Native/catalog URL shape guards likewise enforce the producer's 2,048 UTF-16-unit size before any manifest.
- **I2 URL / P7.13:** Replaced the approximate catalog regex/native default guard with shape/size checks plus one optional bounded distinct URL manifest. The manifest reads only selected native definitions and exact catalog ENTRY/SELECTED_VARIANT targets from independently authorized candidates, with bound operands and fixed SQL aliases. It materializes no inventory IDs. A DISTINCT C-collation CTE is limited to a 4,097-value sentinel; SQL returns count/UTF-8-byte metadata but NULL values when count exceeds 4,096 or sum bytes exceeds 8,388,608. No overcap values reach JavaScript. Within bounds, the existing `validateFieldValue("URL", value)` must return exactly the stored string; no new URL parser was introduced. Invalid values close with SEARCH_INVARIANT; overflow closes with SEARCH_UNAVAILABLE. No URL leaf performs no manifest read or producer parsing. No values are logged or attached to errors/HTTP responses.
- The internal same-MVCC seam remains `runSearchRead` followed by `executeItemSearch`. The wrapper now provides `BoundedSearchReadTransaction.checkBudget()` and `executeItemSearch` requires that bounded type, so a later trusted saved-query resolver can load its owned row then execute predicates/count/rows in the same read. The URL helper checks the remaining budget before/after the read and around every producer call. Database adapters still accept the existing raw `SearchReadTransaction`; there is no new persistence or routing framework.
- Added the native retained-integrity suite to the CI database allowlist and documented manifest limits and producer parity. No schema, producer, route/wire, unavailable-family behavior, Phase06 classifier, provider or real-data changes were made.

### Genuine RED → GREEN and preserved intermediate failure

Every command below used `source ../sammlerraum-test-env.sh` and `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm`, with RUN_DATABASE_INTEGRATION=1 for these focused runs. Logs are retained exactly as produced.

| Log | Command suffix | Actual result |
| --- | --- | --- |
| `logs/task-2-fix1-red.log` | `vitest run packages/domain/src/search/search-retained-integrity.integration.test.ts` | **8 failed /3 passed**, before production changes: broad native NFKC corruption, custom/catalog JS boundary whitespace, UTF-16 overflow and invalid/noncanonical URL acceptance |
| `logs/task-2-fix1-red-caps.log` | same command, with cap test added before production changes | **9 failed /3 passed**; the 4,097-distinct case returned a successful page/total4098 instead of SEARCH_UNAVAILABLE |
| `logs/task-2-fix1-green-attempt1.log` | same command after implementation | **12 passed**; actual native parity and both exact cap branches |
| `logs/task-2-fix1-focused.log` | `vitest run packages/domain/src/search/search-retained-integrity.integration.test.ts packages/domain/src/search/search-url-integrity.test.ts packages/domain/src/search/search-read.test.ts packages/domain/src/search/item-search-service.test.ts` | **103 passed /1 failed**; newly added cross-source fixture reused the same object instance twice, which the unchanged bounded AST parser correctly rejected as FILTER_INVALID. Replaced that shared test object with a structured clone; no production correction was needed. |
| `logs/task-2-fix1-focused-green.log` | `vitest run --no-file-parallelism packages/domain/src/search/search-retained-integrity.integration.test.ts packages/domain/src/search/search-url-integrity.test.ts` | **22 passed**, comprising 17 native and 5 regular tests |

The first RED runs fail at the first violating element in several table-driven loops; the final passing runs exercise every loop element. Snapshot/budget/scoping proof was added after the initial behavior RED. This is not a claim that every final assertion preceded every implementation line.

### Frozen candidate verification

`logs/task-2-fix1-frozen-source.json` records SHA256 for all nine owned source/test/doc/config files before the final gates; each was checked unchanged before source staging. `logs/task-2-fix1-staged-source-check.log` records the explicit staged diff check/stat. No source changes occurred during or after those gates. Runtime evidence in `logs/task-2-fix1-runtime.log`: Node24.19.0, pnpm10.17.1, guarded `sammlerraum_test`, PostgreSQL17.11 Homebrew. All fixtures are synthetic and cleaned up.

`logs/task-2-fix1-final-gates.json` records all five exact expanded commands, exit codes and durations. Every gate exited0 on its first frozen invocation; no generated-cache repair was needed in this fix round.

| Gate | Command suffix / environment | Result | Log |
| --- | --- | --- | --- |
| Regular | `test`, RUN_DATABASE_INTEGRATION=0 | **72 files passed /34 DB-gated files skipped; 774 tests passed /365 DB-gated tests skipped** | `task-2-fix1-final-regular.log` |
| Types | `typecheck` | **pass** | `task-2-fix1-final-types.log` |
| Lint | `lint` | **pass** | `task-2-fix1-final-lint.log` |
| Production build | `build`, NODE_ENV=production | **pass**, search route present | `task-2-fix1-final-build.log` |
| Relevant native | `vitest run --no-file-parallelism packages/domain/src/search/item-search-service.test.ts packages/domain/src/search/search-read.integration.test.ts packages/domain/src/search/search-retained-integrity.integration.test.ts apps/web/src/lib/item-search-routes.integration.test.ts packages/domain/src/valuations/valuation-query.test.ts apps/web/src/lib/valuation-routes.integration.test.ts`, RUN_DATABASE_INTEGRATION=1 | **6 files /149 tests passed, zero skips** | `task-2-fix1-final-native.log` |

The native total is search service78 + actual installed-driver/read5 + retained-integrity17 + search route12 + unchanged valuation query27 + valuation route10. The 37 valuation regressions preserve the original shared-classifier behavior; no Phase06 source changed in this round. Regular total increased by five processing tests; the 17 new native tests explain the additional regular skips. Five final successful logs were checked for warning/error/stderr markers and none appeared. Root retained its full native gate from the prior source and directed this relevant subset; full historical native/browser suites were not unconditionally repeated locally. Root owns scoped independent re-review and exact new remote CI. Old888 CI success does not attest this new source.

### New proof details and limits

- Native SHORT/LONG text: non-NFKC fullwidth corruption, every ECMAScript boundary whitespace, no typed leaf, presence/NOT and nonmatching predicates. Exact producer UTF-16 boundaries with emoji; over-limit supplementary strings admitted by PostgreSQL's codepoint bounds are rejected. Accepted accents, U+0085, U+180E, U+200B, internal tab/newline, U+10000, U+10FFFF and U+FFFF are preserved.
- Native and catalog URL: rejected credentials, bad host/IPv6, port99999, uppercase/noncanonical authority, default-port serialization, missing terminal slash, dot-segment normalization and embedded tab; tested under presence/NOT/otherwise-false Boolean with no-match text. Accepted canonical IPv6 with nondefault port, path/query/fragment `@`, percent escapes and punycode. URL UTF-16 overflow fails in boolean integrity before a manifest read.
- Manifest cap fixture: **4,097 distinct** 2,048-byte strings returns count4097/bytes8390656/valuesNULL and executes no count/page; **4,096 distinct /exactly8MiB** succeeds and counts4097 matching items (one duplicated URL); **8MiB+1** returns valuesNULL and no count/page; **4,097 items sharing one value** succeeds with one distinct manifest entry. The +1-byte retained Unicode mutation is deliberately within the shape/UTF-16 bound but over the manifest byte cap; overflow is resolved before URL parsing. Test duration includes fixture insertion/deletion and multiple requests, not one transaction.
- Exact native/catalog selector union and repeated equivalent leaves yield one distinct value; unselected definition/variant corruption is ignored, but malformed selected-variant data rejects even under NOT/nonmatching text. Foreign native text is ignored. No-URL tests assert no manifest query and no producer call.
- Native concurrent edits after the boolean-integrity read and after the URL-manifest read preserve the current response's snapshot; the next request observes the corrupt URL and rejects. Existing count/page snapshot regressions also pass.
- Controlled-clock tests expire the actual wrapper budget before manifest, after manifest and during producer parsing. Parsing stops after the first expiring call; matching never proceeds. Closed installed-driver failure projection remains tested, with no raw cause/value disclosure. The original native driver suite still exercises real statement/lock/acquisition/serialization failures.
- Bounds apply to returned manifest values and processing time, not scanned rows or universal network wall-clock duration. No index/schema changes or production-scale performance claims are made. Broad scopes may return SEARCH_UNAVAILABLE under the explicit caps/deadlines.

### Fix-owned files and self-review

The nine committed files are `.github/workflows/ci.yml`, `docs/search/owned-item-search.md`, `packages/domain/src/search/item-search-service.ts`, `search-read.ts`, `search-text.ts`, `search-typed-guards.ts`, `search-url-integrity.ts`, `search-url-integrity.test.ts`, and `search-retained-integrity.integration.test.ts` (the final seven share that domain/search directory).

Self-reviewed exact authorized scoping, selector/variant equality, distinct C-collation semantics, sentinel/byte-cap SQL projection, same-snapshot ordering, no pre-cap value transfer, producer equality and closed error handling, UTF-16/trim boundaries, budget checks, CI inclusion, and frozen source identity. Root-owned progress/context/review/ledger files were neither staged nor changed by this implementer. No push, independent reviewer, task checkbox/count advancement or provider activation occurred. Remaining gates are the root's scoped re-review/new exact CI and the previously named full-Task2 producer/integration work.

Evidence staging note: a whole-evidence `git diff --cached --check` reports original tool-output trailing spaces (Next static-page progress) and terminal blank lines in raw logs. These are preserved verbatim; source staging passed its whitespace check, and the report/JSON metadata check passes. This was a staging check, not a failed product/test/build gate.
