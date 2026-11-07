# Task4A implementation report — owned dashboard

Source commit: `b974e7ce86981eba4e8e28591b1baf99d7e16633` (`feat: add bounded owned dashboard queries`). Implementation BASE: `6d2f425342d1e4b96c05306cb0dfa9a7be60e0b3`. Evidence is a separate commit containing this report and only `logs/task-4-*`; its exact SHA is supplied in the worker handoff, avoiding a self-referential commit hash. No push, root-ledger checkoff, merge, schema/index migration, provider operation or frontend change was performed.

This implements the approved available-owned Task4A milestone under P7.16–19. It does not close original Task4/Phase07, the full V1 metric contract, or the 91-task ledger. Root reported both exact foundation `5fa2f06` CI runs successful during this work; Task4's independent review and exact remote CI are root-owned and still required.

## Delivered behavior

- Strict browser-safe dashboard contract and `getDashboard(actor,input)` with text/filter/lifecycle only, fixed OWNED scope and the existing bounded parser. Thin `GET /api/v1/dashboard` uses fresh authentication, no-store/requestId, raw `f` parsing, the existing fixed-key decoder and closed error mapper. It rejects pagination/scope/owner overrides and unavailable leaves across the whole tree.
- `search/search-selection.ts` extracts the actual clock/reference/independent retained-fact/URL preparation from `executeItemSearch`. Search, saved resolution and dashboard retain the same owned/live/lifecycle candidate relation, mixed compiler and bounded RepeatableRead wrapper. Cursor validation stays before preparation, and search count/page semantics are unchanged. No second compiler, authorization resolver or transaction wrapper was introduced.
- Four parameter-bound set queries produce matched row/physical-unit/collection counts, independent all-live-owned collection count including empty collections, four trade buckets/trade-ready measures, precise missing-fact counts, latest own-estimate groups/current-quantity subtotals, real earlier-observation change, per-denomination top10 items, largest selected-unit collections, recent inventory additions, retained condition groups and grading record versus item counts.
- Latest manual selection precedes denomination. Amount/quantity aggregates remain exact canonical decimal strings, with 78-digit caps; counts must be safe integers. Change requires two actual strictly separated observation times and matching stored currency/exponent; immediate prior currency changes, absent values and insufficient history stay excluded, not zero. Both endpoints use current quantity and carry observation spans. No FX, historical membership, profit or common-period return is invented.
- Group cap sentinels run before array transfer (manual256, condition128, grading128); complete groups never truncate. The native grading129 test captures `{overflow:true,data:null}` from SQL. Lists explicitly disclose top10/eligibleCount/hasMore. Strict final JSON is bounded at1MiB and checked while the transaction budget remains active. Invalid numeric text remains invariant500, while actual capacity overflow is unavailable503.
- Purchase/market totals and duplicate/wishlist counts are typed UNAVAILABLE/null states, including empty scope. Purchase presence remains a distinct available missing-data fact. Shared discovery, producer capabilities, external rights and later UI/historical/milestone work remain open. `docs/dashboard/owned-dashboard.md` records these semantics and limitations.

Exactly17 source paths were staged, checked against an explicit allowlist. Root-owned progress, canonical ledger, Task5B preparation/context/brief and other evidence remained unstaged. No subagents or additional worktrees were created.

## Verification and exact commands

Pinned runner: Node24.19.0 and pnpm10.17.1 (`logs/task-4-runtime.log`). Existing root-owned PostgreSQL17.11 `sammlerraum_test` only, through the guarded test client and `source ../sammlerraum-test-env.sh`. No local test suite or DB mutation ran concurrently with another worker.

The actual commands (outputs redirected to the named logs) were:

```sh
source ../sammlerraum-test-env.sh
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run --no-file-parallelism packages/domain/src/dashboard packages/domain/src/search packages/domain/src/valuations/valuation-query.test.ts packages/domain/src/valuations/valuation-service.test.ts apps/web/src/lib/dashboard-routes.integration.test.ts apps/web/src/lib/item-search-routes.integration.test.ts apps/web/src/lib/smart-collection-routes.integration.test.ts apps/web/src/lib/valuation-routes.integration.test.ts
RUN_DATABASE_INTEGRATION=0 NODE_ENV=test npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm test
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm typecheck
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm lint
NODE_ENV=production npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm build
```

| Gate | Actual result | Evidence |
|---|---|---|
| Serial native-enabled regression gate | exit0;16 files,366 passed,0 skipped: **221 real DB cases plus145 pure cases** | `logs/task-4-final-native.log` |
| Regular workspace suite | exit0;74 files passed,38 skipped;790 tests passed,420 expected integration/browser skips | `logs/task-4-final-regular.log` |
| Workspace types | exit0 | `logs/task-4-final-types.log` |
| Workspace lint, corrected | exit0 | `logs/task-4-final-lint-corrected.log` |
| Production build, exact corrected source | exit0; `/api/v1/dashboard` present in route output | `logs/task-4-final-build-corrected.log` |
| Source ownership/fingerprints |17 committed source paths equal final SHA256 manifest; staged whitespace check passed | `logs/task-4-final-source.json`, `logs/task-4-final-gates.json` |

The native-enabled total is not claimed to be366 database cases. Real DB breakdown: dashboard21, dashboard routes12, search78, retained integrity17, read settlement5, saved queries18, saved routes4, search routes12, valuation query27, valuation service17 and valuation routes10 =221. Pure cases in that gate: dashboard boundaries5, filter AST117, search input12, search budget6 and URL manifest5 =145.

Functional/native/regular/types gates used `task-4-frozen-source.json`. Lint found one style warning in the new `dashboard-result.ts`; formatter correction was the only subsequent source change. `task-4-format-equivalence.log` proves identical TypeScript transpilation before/after, and records that sole changed path. Original lint failure and original passing build are retained. Corrected full lint and production build were rerun on `task-4-final-source.json`, whose17 fingerprints were verified against the committed source bytes. No semantic source change followed the functional gates.

## Meaningful failures retained

Initial native RED created real users/collections/items and called the real manual-valuation producer with mixed currencies, quantities and foreign public inventory. The deliberately unavailable dashboard entry-point scaffold failed the expected response assertions with SEARCH_UNAVAILABLE (`task-4-native-red.log`,1 failure; `task-4-native-expanded-red.log`,6 failures). This was not a missing DB, parser-only test or missing module. The additional route scaffold RED is separately retained (`task-4-route-red.log`,12 missing-adapter failures); it is not the sole behavioral RED.

A later boundary regression deliberately reproduced malformed79-character numeric text incorrectly being treated as capacity overflow503 rather than invariant500 (`task-4-malformed-overflow-red.log`,1 failed/4 passed). The numeric capacity refinement now applies only to valid integer strings; its GREEN is5/5 in `task-4-malformed-overflow-green.log` and the frozen gates.

All implementation-attempt failures remain in their original logs; no failed attempt is presented as verification:

| Attempt | Failure and correction |
|---|---|
| `task-4-native-first-green-attempt.log` |5 passed/1 failed: media fixture lacked actual required originalFileName. Added the real field and required link position. |
| `task-4-types-iteration.log` | Fixture field types plus importing Zod directly from domain without a declared dependency. Kept Zod in contracts and used a narrow structural result-schema type in domain. |
| `task-4-initial-green.log` |17 passed/1 failed: synthetic fixture cleanup hit actual MediaAsset owner RESTRICT FK. Cleanup now deletes owned items/links, then assets, then its user. The single abandoned task-specific synthetic fixture was cleaned, and the temporary recovery cleanup was removed. |
| `task-4-native-expanded-green-attempt.log` |24 passed/1 failed:129 condition options in one scheme violated native position0..99. The cap fixture now uses two actual category/scheme groups with valid positions, preserving the129-group test. |
| `task-4-native-plans-attempt.log` |16 passed/1 failed: URL fixture omitted normalizedName. |
| `task-4-dashboard-native-green.log` |33 passed/1 failed: URL definition incorrectly included a nonexistent position field. Corrected to actual schema. The focused URL case then passed, including17 calls and nonmatching corrupt URL invariant. |
| `task-4-types-iteration2.log` | Structural issue type needed explicit optional undefined under exactOptionalPropertyTypes. Corrected type only. |
| `task-4-types-iteration3.log` | The same nonexistent URL definition position was reported before its correction. |
| `task-4-dashboard-native-final-focused.log` / `task-4-types-pre-freeze.log` |37 passed/1 failed: document-link fixture required explicit position. Added position0; both real media-kind cases then passed. |
| `task-4-final-lint.log` | One formatter warning in dashboard-result.ts; corrected and proved transpilation-equivalent, then lint/build passed. |

Focused selection logs with intentional skips (`task-4-url-focused.log`, `task-4-media-focused.log`) are diagnostic only. The frozen native gate executes all selected files with zero skips. Actual same-observedAt valuation ties use explicit deterministic timestamps/IDs in their fixtures, avoiding dependence on millisecond timing between producer calls.

## Native semantics and cost evidence

Actual tests cover owned/private/public-foreign isolation; live empty collections; deleted parent/item and disjoint lifecycles; complete matched search total versus a limited search page; quantity sums; latest-before-denomination; EUR/USD/JPY/KWD scales; genuine zero/missing/history insufficiency; negative comparable changes; same-observedAt ties; huge products beyond int64/JS safe precision; actual item-service split without valuation-history copying; current-quantity weighting; deterministic top10 and selected collection rankings; trade status distinctions; retired conditions; multiple grading records per item;128/129 distribution caps; READY/PENDING/FAILED/cleanup-started image and document presence; closed raw `f`/query/auth errors; SQL timeout57014; and one actual MVCC response across a concurrent quantity/valuation/collection-name change, followed by a new response seeing the update.

The URL dashboard case uses the actual selected-value manifest and validates a corrupt URL on a text-excluded owned item before matching. Existing search retained-integrity tests also remain green after extraction, including exact producer normalization/URL caps and foreign-fact isolation. Saved-query native regressions retain dynamic membership, CAS/revisions, cursor binding and saved-row/count/page consistency.

Complete monetary group256/257 and exact1MiB/+1 byte output boundaries use strict complete synthetic DTOs at the actual final result validator. Native current denomination constraints admit165 currency/exponent pairs, so an impossible native257-denomination history is not fabricated by disabling constraints. Numeric78/79-digit and malformed-output boundaries are tested without claiming physically attainable test inventories of that size.

`task-4-final-native.log` contains actual full PostgreSQL EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) output for each of the four production SQL statements. `task-4-plan-summary.json` is extracted from that exact log. Synthetic cases use1/50/500 owned items in a skewed collection, with1/50/1500 valuation rows respectively; the500-item case includes1000 extra observations on one item. The explicit text match selects1/5/50 items. Fixture ANALYZE on CollectibleItem and Valuation supplies current synthetic statistics before measured reads.

| Owned rows | Actual calls including settings | Request time | Summary/manual/distribution/ranking execution times |
|---|---:|---:|---|
|1|15|22.523ms|0.250 /0.288 /0.167 /0.161ms|
|50|15|13.693ms|0.512 /0.451 /0.286 /0.304ms|
|500|15|17.753ms|1.540 /1.541 /1.009 /1.080ms|

The actual URL query count is17. These totals are seven/eight data queries plus one initial settings query and per-data-query settings calls, excluding driver transaction-control calls. Full plans show zero shared-read blocks in these warm synthetic runs; these are not cold-storage or production throughput promises. Existing collection/item/valuation indexes support the measured plans; no new index was requested or added. LIMIT bounds output, not scans, sorting, histories or aggregate work. Broad/skewed production requests can still reach the existing closed503 budget. Known burst-growth/stale-statistics risk remains the Phase13 operations/readiness gate from P7.26.

## Remaining gates and handoff

Approved producer plans remain authoritative: legacy-money M1–M6 coverage/readPurchaseCost; market-batch exact-selector preparation with independent detail/aggregate rights and source/quantity-basis grouping; Phase10 real duplicate/wishlist relations; Phase09 bulk shared authorization. Their independent outer coverage must precede text/filter matching, with matched totals only after successful preparation. No parser/schema acceptance is treated as capability enablement. This source exposes no new rights or provider activation.

The UI and full historical-analysis/milestone semantics remain open. The current change metric is explicitly the current selected cohort's comparable own-estimate change, not a common-period portfolio chart. Root must independently review this source and capture exact remote CI before declaring the partial milestone accepted; original Task4/count41 remains unchanged by this worker.

## Exact committed source SHA256 manifest

These are the final17 source entries, each verified against source commit b974e7ce86981eba4e8e28591b1baf99d7e16633. The earlier functional freeze and single formatting delta are separately retained in logs.

| Path | SHA256 |
|---|---|
| `.github/workflows/ci.yml` | `44ed70f05381c44907a8512d6a1ca5a9ac8b971ad85071b03135e3e48c982d53` |
| `packages/contracts/package.json` | `52019b5881a3af957a7537182ee30a85948eaa3455abd3bfe7596d1e60370159` |
| `packages/contracts/src/dashboard.ts` | `f9f206598431f825e840ab517c40b483473be5dbd4504bdc3ecf60259bffda36` |
| `packages/domain/package.json` | `821153aa68f0fddd36fac020584627ed7995dad5bf35b083f64c76680adba4a6` |
| `packages/domain/src/search/item-search-service.ts` | `a2456c401c09058f30fe7c6c38e58cfe31c0d9f8456ec497ad3bb176646db3db` |
| `packages/domain/src/search/search-selection.ts` | `ec5b80421e943e68dd271aa650487c074310db90ac16398187da0c4559d48837` |
| `apps/web/src/lib/item-search-routes.ts` | `0a021ad678f7d0a5db8f0c9aaef1329b1b5c3c05c4be83c490a87d000bf44738` |
| `apps/web/src/lib/dashboard-routes.ts` | `a1003aa078f70f92f9915d200430d87e1aecde42410c7f0113d021fee1410b39` |
| `apps/web/src/lib/dashboard-route-dependencies.ts` | `550f6711381c5dbfc24dead164b0ee0e036b86076d23eb07f9a8022a07abdd83` |
| `apps/web/src/lib/dashboard-routes.integration.test.ts` | `80dd5b5d63f1a521f99d44af6bdabbba63d12f81b79e560c4760d2c0f3395bce` |
| `apps/web/src/app/api/v1/dashboard/route.ts` | `798c55764e33bccaac243e591807d8a65b8de0944584ef3494884eacc1128f26` |
| `docs/dashboard/owned-dashboard.md` | `b433c84d4d79bd65ed626248b8cef44f6c81050fa3849769d14891cdf9ef6dad` |
| `packages/domain/src/dashboard/dashboard-input.test.ts` | `1adc247c0f142339ca8c7992d53aeb30e4eec217b108b324c0e426d9f2f35892` |
| `packages/domain/src/dashboard/dashboard-result.ts` | `e3f55934b810d5f914e2bafceea2aa53251226068788206c6ac2268d57b7c036` |
| `packages/domain/src/dashboard/dashboard-service.test.ts` | `1b0470df324bd7c1bfb8d0df49d8c243d60b73bac6402c32f497bc12ec0b292f` |
| `packages/domain/src/dashboard/dashboard-service.ts` | `332e82298985ac6f9d15fdce8b56a2cd5268d8a0181eb19466008a8190d77577` |
| `packages/domain/src/dashboard/dashboard-sql.ts` | `d8b1e9a3165c6a9a6be100abf3f8e122d965efbad8d9952dec1db03b2c3ee447` |


## Task4A fix round 1 — review I1

Fix BASE: `bb2aaabd87b42ec1a97f3dd1f8591d9b5c1643a5`. Source: `91ae759a0465530d7ddb8b01fd38f635a16991b2` (five dashboard source/test paths only). The accompanying evidence-only commit contains this appended report and `logs/task-4-fix1-*`. No push, ledger/checkoff, schema/index, producer, budget, shared preparation, or UI changes.

The complete formal review identified one Important issue: chosen latest manual denominations were accepted by shape alone, while an invalid immediate prior could be silently excluded as noncomparable. Both chosen points now pass a bounded SQL validity guard derived directly from the existing `valuationCurrencyCodes` and `currencyMinorUnitExponent` authority. There is no copied currency table. Selection still precedes denomination comparison, and prior selection remains the immediate strictly earlier observation; invalid prior data never causes fallback to an older valid point.

The existing manual statement materializes selected points, computes a single validity sentinel against the authoritative 165 current pairs, and passes points into classification/aggregation only if all chosen pairs are valid. An invalid pair returns `denominationsValid:false` and `data:null`; the service requires the sentinel to equal true and returns `SEARCH_INVARIANT` before accepting data or proceeding to later dashboard statements. Final result validation also checks both bounded manual value/change group arrays through `currencyMinorUnitExponent`, protecting the output boundary from malformed intercepted driver values. The ordinary contracts remain browser-safe. The synthetic 256-group response-cap fixtures now repeat a valid EUR/2 pair; they test array/byte capacity, not denomination uniqueness or native attainability.

### RED, fixture correction, and exact execution boundary

`task-4-fix1-red.log` preserves the first run: eight failures, one unrelated selected test passed, 25 skipped. Four pure tests reached the missing response defense; four new DB fixtures initially supplied a Date to the existing producer's ISO-string input and failed with `VALUATION_INVALID`. Only that fixture input was corrected before the second RED. `task-4-fix1-red-corrected-fixture.log` then records eight intended failures, 26 diagnostic skips: four complete service calls resolved instead of rejecting, and four complete final-response validations did not throw. No implementation had been changed before this corrected RED.

The four DB-backed corruption cases create three valid EUR observations through the actual valuation producer. A narrowly intercepted manual driver query changes only one selected-point projection: latest currency to ZZZ, latest exponent to9, immediate prior currency to ZZZ, or immediate prior exponent to9. It preserves parameters and executes the remaining actual SQL through PostgreSQL and the real bounded transaction/service path. This is **selected-point corruption simulation**, not ordinary native-writer bypass, not a claim that current constraints permit corrupt persisted rows. Constraints remain enabled; stored rows remain valid. Each case asserts exactly one interception, actual SQL `data:null`/invalid sentinel, closed service failure, and a subsequent ordinary read returning the valid EUR total and zero comparable change. The third older valid observation cannot mask an invalid immediate prior.

`task-4-fix1-focused-green.log` records all eight targeted cases passing. The pure tests reject unsupported/wrong-exponent pairs in both value and change groups at the actual final response validator. Existing JPY/0, KWD/3, genuine EUR→USD switches, absent histories, real zeroes, strict-earlier ties, exact numeric/group/UTF8 caps and current-quantity semantics remain green in the frozen gate.

### Frozen verification and costs

All final gates ran after formatting on the exact five-file manifest below, with no post-freeze source edits. Commands, outputs and exit codes are preserved in `task-4-fix1-commands.txt`, `task-4-fix1-final-gates.json` and corresponding raw logs. Runtime remains pinned Node24.19.0/pnpm10.17.1 and the guarded local PostgreSQL17.11 test database.

- Affected native gate: **3 files,46 passed,zero skips**:25 domain dashboard DB-backed cases (including the4 explicit projection simulations),12 dashboard route DB-backed cases,9 pure dashboard input/output cases. Thus37 DB-backed cases plus9 pure cases; not46 real-native-write corruption cases.
- Regular workspace gate:74 files passed/38 expected skipped; **794 passed/424 expected integration/browser skips**.
- Full types, lint, production build: exit0. The build includes `/api/v1/dashboard`.
- Shared search/saved source and authority/producer source are unchanged. The affected dashboard gate retains actual search-selection comparison, URL independent-integrity behavior, snapshot consistency and driver timeout coverage. No unrelated full DB/media suite rerun was needed for this five-file fix.

The four dashboard statements, seven/eight data queries,15/17 calls including configuration, and existing snapshot/transaction budgets are unchanged and asserted by the final native gate. The guard uses330 bound scalar values for the165 authoritative pairs in the existing manual statement; no additional statement or per-item application query is introduced. Full EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) plans for all four actual queries and1/50/500 owned-row cases are retained in `task-4-fix1-final-native.log`; `task-4-fix1-plan-summary.json` is extracted from those outputs. Manual execution times are0.388/0.574/1.705ms respectively; requests are22.385/14.314/18.892ms, each15 calls. The URL case remains17 calls. These are warm, analyzed synthetic fixtures with zero shared-read blocks, not production latency/capacity claims. The original dense-history scenario and Phase13 stale-statistics/burst-growth risk remain unchanged.

All original partial-milestone limitations remain: future money/market/shared/relations/UI/full-history work is unavailable/deferred explicitly; original Task4/count41 is open. Root owns scoped rereview, exact remote CI and acceptance. The narrow reader defense uses the current authoritative currency mapping as required by I1; future deliberate currency-table evolution must preserve the separately documented historical-money policy rather than silently adding alternate interpretation here.

### Fix round 1 exact committed SHA256 manifest

| Path | SHA256 |
|---|---|
| `packages/domain/src/dashboard/dashboard-input.test.ts` | `ddaa1fdde4c5f5fcbc60f51f72062752159790f2c1fdd6c22b8bb33d0f0e3a7b` |
| `packages/domain/src/dashboard/dashboard-result.ts` | `ce8e51132d8760b65079d50f27606c6d8a41c956819c488a36e40b14f7e92226` |
| `packages/domain/src/dashboard/dashboard-service.test.ts` | `04cc58d942bd7167d3fc7b29e00bdfbd1347501239ee108711eccdb616ae0fc1` |
| `packages/domain/src/dashboard/dashboard-service.ts` | `5b3f102e2155a0c1ad275444b456c04f803aa8214b193455095cdc02ddcbae41` |
| `packages/domain/src/dashboard/dashboard-sql.ts` | `d895d850c75d673f264c27cd6db5526bbc306c0714148512a2d21e74edf560b8` |
