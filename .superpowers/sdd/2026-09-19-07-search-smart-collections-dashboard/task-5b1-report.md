# Task5B1 — private search/dashboard POST transport

Local implementation and verification report. B1 only; independent root SPEC/QUALITY review, root remote CI and acceptance remain separate. No original Task5/Phase07 completion, task-count change, checkoff, push, main merge or deployment is claimed.

## Source identity and scope

Dispatched clean BASE: `6d4fe74b3d0b1e15f5196aaf02edd81a58529e1c`, branch `work/sammlerraum-v1`. Root explicitly supplied source/suite/DB GO while immutable dependency CI ran; this worker never pushed. Task5B1 brief was read first, followed by task-5b-context rulings P7.28–33 and task-5b-contract-preparation sections1–3,8–9. The full Phase07 plan was not read.

Production implementation/source commit: `72b023cf7f24d50c4cac228a742ee5c60d1da4a5` (`feat(search): add private query POST transport for search and dashboard`). Corrective test-only source commit and final frozen candidate: `c5fc3f2236c6ac4f93a09f982c8e5fe5a41bdadb` (`test(search): type private transport response readers with actual DTO schemas`). The latter changes only `apps/web/src/lib/api/read-search-body.test.ts` and `apps/web/src/lib/private-search-routes.integration.test.ts`; all production, CI and documentation hashes remain identical to72b023c. It replaces a DOM-only test type with `RequestInit["body"]`, validates native response bodies with the real DTO schemas, and types closed error reads. There is no production correction after72b023c.

Evidence commit is the separate commit containing this report and the explicit `logs/task-5b1-*` evidence files. Its exact SHA is provided in the final handoff and resolves reproducibly with `git log -1 --format=%H -- .superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/task-5b1-report.md`; a report cannot embed its own commit hash. The source commits contain no report/log/root-ledger files.

The 17 owned source/doc/test/CI paths and their final SHA256 are:

```text
f777735f9805a87c7dd74454597c847d54b2b16fd86c4dfe101a46303e1c5b36  .github/workflows/ci.yml
ab7e6f31927f89422b109ce159dfd1c3007df897a8b41a819d9d524106fe84e7  apps/web/src/app/api/v1/dashboard/route.ts
9aa6b2e14d04df32e228cf73533ef583b0723ad6951e5c266da9320206d5ac9d  apps/web/src/app/api/v1/search/items/route.ts
db4b775f3bd0a08f7c78ec4f6150509cee38a6de373a515f589994c0af5a8d21  apps/web/src/lib/api/read-search-body.test.ts
4967882d7a5881af2d42e0ff3dd9590429364e645922ea038c1da0a68616cc34  apps/web/src/lib/api/read-search-body.ts
9a3bdd389b3da71a2d1526047c0bd341a1ef0e5eb2ae7f725a4cb751fc72cae1  apps/web/src/lib/dashboard-route-dependencies.ts
3ef76f4ffc4348df0bb755041e79c1c6d33e40fd1ac4fd730217cbce08b1eb99  apps/web/src/lib/dashboard-routes.integration.test.ts
17113bd8089521e72a104cb3dbf179d7259fa9f761dbbd7fb1c96bfa31ebe94a  apps/web/src/lib/dashboard-routes.ts
09761777b7942bfce39cffcb25c737e6c6e87ef6313bea8880a5708121d14da9  apps/web/src/lib/item-search-route-dependencies.ts
d265b33c3ca85edce62a50ee39df7ae6bc0762b71cf8b95a1186e32128d0ddfc  apps/web/src/lib/item-search-routes.integration.test.ts
1b9da0db8d362f780fa4aa54aeef32ed9e0eec5fd76528953935994ced31b1b4  apps/web/src/lib/item-search-routes.ts
fc20f730bbb90c64d98c00430e2ddac11b2e1fa97d18ad7bf7dad2b0756f8ba5  apps/web/src/lib/private-search-routes.integration.test.ts
da570e7929172edeabb71a48660c73be449561e14534a8d228bb2561608ff52f  docs/dashboard/owned-dashboard.md
ed62e4acafab38c565be5fc68ab9d67f7e395ba1b1abaebd48f1b36f79bc6843  docs/search/owned-item-search.md
662af9b75b80dfbe5b9f5f5dd3dcbef99749da72b099b338e7f709f8b946748c  packages/contracts/package.json
8e7130c019e5c81931f207880522dc2731c91149af10bdfb2b7320de3cf81d68  packages/contracts/src/private-search-query.test.ts
01fab1bc39546ae80157cc35a783f9c3143cd904eec5f370819e56b09b0a6488  packages/contracts/src/private-search-query.ts
```

`logs/task-5b1-source-manifest-72b023c.sha256` preserves the original freeze; `logs/task-5b1-source-manifest.sha256` is the final c5fc3f2 freeze. Both gate runners explicitly found `SOURCE_MANIFEST_CHANGED=[]` after their runs. Root-owned progress/preparation/canonical ledger paths are excluded from staging and this manifest.

## Actual export reconciliation and implementation

Search uses actual `contracts/item-search.parseItemSearchQuery`, actual `contracts/search.parseItemFilterJson`, and actual `createItemSearchService(database).searchItems({userId}, input)`. Dashboard uses the reviewed actual `contracts/dashboard.parseDashboardQuery` and `createDashboardService(database).getDashboard({userId}, input): DashboardData`. The new browser-safe `contracts/private-search-query` package subpath exports `PRIVATE_SEARCH_MAX_BODY_BYTES=32768`, `parsePrivateItemSearchWire`, and `parsePrivateDashboardWire`. Dashboard normalization delegates to the real dashboard parser and introduces no pagination fields or parallel normalization.

POST is registered at the two actual existing route.ts paths. Dependencies receive configured `serverEnv.APP_ORIGIN`. Each POST checks exact configured Origin, obtains the fresh session with both `disableCookieCache:true` and `disableRefresh:true`, rejects URL query members through actual `readItemSearchQuery(request,[])`, parses the application/json body, then calls its actual service once with only the session actor and normalized query. GET method bodies are unchanged. Bare `?` remains empty. No body values enter request URLs, logs or errors.

The item wire accepts only text/f/lifecycle/limit/cursor, with empty text/no filter/ACTIVE/limit20/no cursor defaults and a safe JSON integer limit1..50. The dashboard wire permits only text/f/lifecycle. Unknown/prototype-looking keys, owner/scope/context overrides, raw AST objects, malformed lifecycle/cursors and nested values fail closed. JSON null/omission f means no filter; empty f and string `"null"` retain FILTER_INVALID from the actual inner filter parser.

The private web reader supports only ITEM_QUERY and DASHBOARD_QUERY. It counts actual streamed bytes with unchanged `readBoundedBody(32768)`, explicitly rejects leading EFBBBF before fatal UTF8 decoding, and performs a small fixed scalar-envelope lexical precheck. Quoted values are opaque; only root key tokens are decoded to detect literal/escaped-equivalent duplicates and unknown members. JSON.parse remains the full syntax validator. No filter-scanner modification, parser dependency, general JSON framework, unused reference shapes or saved-mutation duplicate fix was introduced.

Raw f passes intact to its existing16KiB scanner; it does not inherit the filter-copy guard's10000 UTF16 per-string cap or16KiB envelope bound. Existing text200 codepoints/800 UTF8 bytes before/after normalization, raw/canonical f16KiB, logical depth5, leaves50, structural512 and cursor limits remain authoritative. Legal inner filters may exceed the outer32KiB cap after escaping; this intentionally retains UPLOAD_TOO_LARGE413. Encoded URL size retains SEARCH_QUERY_TOO_LARGE414. Outer body/media/UTF8/BOM/duplicates are SEARCH_INVALID400; existing filter/service closed errors, no-store and request IDs remain unchanged.

## Behavioral RED and retained failures

All commands below ran from the repository after `source ../sammlerraum-test-env.sh`, using the pinned prefix shown literally. Runtime proof `logs/task-5b1-runtime.log` records Node `v24.19.0` and pnpm `10.17.1`. Only the guarded synthetic local sammlerraum_test database and root-owned running PostgreSQL were used. There were no production data, provider calls, environment/DB setup changes or concurrent local suites/DB workers.

1. Before production implementation, `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run --no-file-parallelism apps/web/src/lib/private-search-routes.integration.test.ts` with `RUN_DATABASE_INTEGRATION=1` exited1. `logs/task-5b1-behavioral-red.log`: **1 failed file, 5 failed tests**. The existing actual GET adapters/services executed against native producer-written fixtures; the absent POST handler was dispatched as an HTTP405-equivalent by the initial test helper. Assertions expected200 for actual search rows, valid16384-character raw f and actual dashboard aggregates, and400 for literal/escaped root duplicates. All five failed at405, not module startup. The final test helper invokes required actual POST handlers directly; the missing-handler fallback was removed.
2. Auxiliary startup RED: `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run packages/contracts/src/private-search-query.test.ts apps/web/src/lib/api/read-search-body.test.ts`, `RUN_DATABASE_INTEGRATION=0`, exited1. `logs/task-5b1-contract-startup-red.log`: two suites could not load the not-yet-created module/package subpath, zero tests. This is retained but is **not** the meaningful behavioral RED claim.
3. First combined run, `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run --no-file-parallelism packages/contracts/src/private-search-query.test.ts apps/web/src/lib/api/read-search-body.test.ts apps/web/src/lib/private-search-routes.integration.test.ts`, `RUN_DATABASE_INTEGRATION=1`, exited1. `logs/task-5b1-focused-green.log`:79 passed,2 failed. Native5 and reader43 passed; two wire fixtures did not exceed their intended limits. Diagnostics showed six normalized Arabic compatibility expansions produced only10141 bytes for the50-element array, while the five-value structural fixture visited fewer than512 nodes. Increasing the respective fixture operands to ten compatibility expansions and six list values exercised the actual existing caps. No production parser/limit was changed to satisfy these fixtures.
4. The same combined command then passed87/87 after native cases expanded to11 (`logs/task-5b1-focused-expanded.log`). The native-only command passed14/14 after actual timeout/output-error/delete-parent coverage (`logs/task-5b1-native-errors.log`). The combined source precheck passed91/91 after the lifecycle/two-actor parity case (`logs/task-5b1-source-precheck.log`).
5. The first frozen native and regular gates passed, then frozen `pnpm typecheck` exited2 (`logs/task-5b1-frozen-types.log`). Errors were confined to the two new tests: unavailable base-config `BodyInit` and unknown Node Response.json values. Shared packages compile the ES-only root test graph; the web-only DOM type could not be used there. The exact test-only corrective commit is recorded above. Changed-test precheck passed58/58 (`logs/task-5b1-types-fix-precheck.log`), followed by the exact final candidate affected gate below. The failed original types output is retained without replacement.

## Exact frozen gates and output

Original freeze command transcript:

```sh
FROZEN_SOURCE_SHA=72b023cf7f24d50c4cac228a742ee5c60d1da4a5
source ../sammlerraum-test-env.sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run --no-file-parallelism packages/domain/src/search packages/domain/src/dashboard packages/contracts/src/private-search-query.test.ts apps/web/src/lib/api/read-search-body.test.ts apps/web/src/lib/private-search-routes.integration.test.ts apps/web/src/lib/item-search-routes.integration.test.ts apps/web/src/lib/dashboard-routes.integration.test.ts apps/web/src/lib/smart-collection-routes.integration.test.ts apps/web/src/lib/item-search-routes.test.ts
FROZEN_SOURCE_SHA=72b023cf7f24d50c4cac228a742ee5c60d1da4a5
source ../sammlerraum-test-env.sh
RUN_DATABASE_INTEGRATION=0 NODE_ENV=test npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm test
FROZEN_SOURCE_SHA=72b023cf7f24d50c4cac228a742ee5c60d1da4a5
source ../sammlerraum-test-env.sh
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm typecheck
```

Results at72b023c:

- Native: exit0; **17 passed files,422 passed tests,0 skipped**; `logs/task-5b1-frozen-native.log`. This contains **186 database-enabled fixture cases across9 files** and **236 pure cases across8 files**; it is not a claim that all422 cases perform native SQL. It includes actual search/saved/dashboard services, read-budget/retained-integrity regressions, existing GET routes and the new native POST routes.
- Regular: exit0; **76 passed files,39 skipped files (115 total);870 passed,439 skipped (1309 total)**; `logs/task-5b1-frozen-regular.log`. RUN_DATABASE_INTEGRATION=0 intentionally skips the database-enabled workspace cases; those439 are not reported as native passes.
- Types: exit2 as described above; lint/build were not run on the failing original candidate.

Final c5fc3f2 command transcript:

```sh
FROZEN_SOURCE_SHA=c5fc3f2236c6ac4f93a09f982c8e5fe5a41bdadb
source ../sammlerraum-test-env.sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run --no-file-parallelism apps/web/src/lib/api/read-search-body.test.ts apps/web/src/lib/private-search-routes.integration.test.ts
FROZEN_SOURCE_SHA=c5fc3f2236c6ac4f93a09f982c8e5fe5a41bdadb
source ../sammlerraum-test-env.sh
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm typecheck
FROZEN_SOURCE_SHA=c5fc3f2236c6ac4f93a09f982c8e5fe5a41bdadb
source ../sammlerraum-test-env.sh
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm lint
FROZEN_SOURCE_SHA=c5fc3f2236c6ac4f93a09f982c8e5fe5a41bdadb
source ../sammlerraum-test-env.sh
NODE_ENV=production npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm build
```

Final candidate results: affected tests exit0 (2 files,58 passed,0 skipped), typecheck exit0, lint exit0 and production build exit0. The build completed with both actual API routes present and no warning/error matches in the final type/lint/build logs. Full exit codes and UTC starts are retained in `logs/task-5b1-fix1-frozen-gates.json`, with raw corresponding logs. The changed tests rerun comprises reader43 pure cases and private-route15 database-enabled cases. Broader native422 and regular870 were not automatically repeated: final changes affect only these two test readers/types, their actual schema assertions were checked by the focused58 rerun, and every production hash is identical. This is an explicit two-freeze evidence chain, not a claim that the unchanged full regular/native sets reran at c5fc3f2.

## Concrete proofs

New pure tests:33 wire plus43 body-reader cases (76). New real-DB route fixture:15 cases, run with real owned collection/item/valuation and saved-query producers. No mocked DB substitutes are used for rows, counts, pagination, currencies or errors. The timeout case wraps the actual transaction only to run PostgreSQL pg_sleep(3) at the first real selection read under unchanged statement limits; the actual service/rollback maps the resulting timeout to503 once. The invariant case temporarily writes an empty retained native TEXT title under the guarded synthetic fixture, observes the actual output-validator500 through each POST, and restores it in finally. Normal fixture creation/lifecycle/delete/manual values use actual producers.

The proofs cover:

- Literal and escaped duplicate root and inner-filter keys; quoted f punctuation/brackets/braces/escaped quotes/backslashes; prototype-looking and unknown keys; null/array/nonobject roots and nested objects/arrays; malformed syntax/numbers/trailing roots/data/control/escape sequences; explicit BOM and fatal malformed UTF8.
- Actual streamed32768 acceptance and32769 rejection with absent, dishonest1 and32768 Content-Length; declared oversize retention; valid raw f10001 and16384 characters; raw/canonical filter caps; escaping-induced outer413; text and filter complexity/version/cursor limits.
- Exact GET/POST rows/counts/first-page cursor and next-page identity, no duplicated rows, actor/query/limit/lifecycle cursor binding, cross-method cursor acceptance, saved-resolution context rejection in both directions. Lifecycle/filter parity includes ACTIVE/ARCHIVED/DISPOSED/ALL, uppercase filter IDs and NFKC text; two actors see only their owned inventory; public foreign and deleted-parent inventory is excluded.
- Actual dashboard selected rows and metric groups (EUR300,USD500 for3/2 current units plus4 missing-value units), matching recent rows/counts across GET/POST. Dashboard calls the aggregate service, never search-page aggregation. Unsupported whole-tree filters reject under NOT even with no text matches; deleted/missing references remain generic422.
- Origin before session, fresh-session flags,401 before body/query, query cap414 before body, bare? compatibility, strict body-only keys, no-store/requestId on success/errors, privacy-safe messages with no submitted secret/SQL/cause; exact once actual-service calls with the session actor and normalized input.

Existing GET query/parser regression cases include f=null remaining invalid, malformed percent/UTF8, duplicate/unknown URL keys, decimal-limit grammar and encoded bytes. Smart Collection mutation source was not modified and receives no duplicate-key-fix claim. The existing saved service/route native regression passed, and saved cursor context remains distinct.

## Limits and handoff

Local validation is scoped to these adapters and existing touched search/saved/dashboard boundaries. Existing services own authorization, reference availability, query budgets, DTO sizes, currency/source separation and native integrity. This change introduces no metric/producer/schema/index/rights/runtime-budget behavior, fake availability, truncated success or provider access. Only the actual new native path `apps/web/src/lib/private-search-routes.integration.test.ts` was added to CI's allowlist.

B2 references/catalog modes, frontend/query-state/cache/filter-builder work, remaining monetary/market/duplicate/wishlist/shared dashboard integrations and original Task5/Phase07 completion remain outside B1. Root owns the progress/canonical ledger, independent review, dependency CI result capture, subsequent B1 remote CI and acceptance. Root reported both exact6d4fe74 dependency CI runs39117402899/job117645875575 and39117399604/job117645866554 successful and released their dependency hold after capture; this worker did not independently capture or stage those root-owned receipts, and still performs no push. This worker did not dispatch reviewers/subagents, change the environment, push, deploy, merge, check off tasks, clean up worktrees or create another worktree.

## Root evidence-location note

After the independent review completed, root moved the24 tracked `logs/task-5b1-*` artifacts from the repository root to this plan workspace `logs/` directory, byte-for-byte. All such evidence references above now resolve beneath `.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/`. Historical command output and authored review findings are preserved. Exact original/new paths and hashes are in `logs/task-5b1-root-relocation.json` within this workspace. No source/test/build rerun or behavior change accompanied this relocation.
