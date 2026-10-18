# Task2 retained URL native-budget diagnostic report

Date: 2026-10-18. Baseline `1ab352edf29ac6b5b7b839d4105d345f5451c673`. Diagnostic-only ownership under P7.23, temporary harness ruling P7.24, corrected final run ruling P7.25. No product fix, commit, push, schema/index/default-setup change, budget relaxation, retry policy change, or Task2/Task3 checkoff.

## Result and causal limits

The corrected full CI allowlist/order ran **46 files /496 tests, all passing** on the separately created disposable PostgreSQL17.11 database. The historical CI five-second failure was **not reproduced locally**. This is not a fix or closure of either failed exact `be1a496` CI run.

The local diagnostic does establish a large, statistics-sensitive repeated-scan cost on the exact retained URL request. With stale statistics, the manifest, count and page each estimated one item but processed4,097; each repeated the selected-definition value index scan4,097 times, returned an average2,049 candidate values per scan, and discarded8,390,656 join candidates. Original request elapsed2,615.522ms; an explicitly unchanged comparator elapsed2,624.861ms. Targeted `ANALYZE "CollectibleItem", "CustomFieldValue"` on the same fixture changed the manifest to a hash join and count/page to one item-primary-key lookup per matching value; the same service request elapsed289.237ms. These exact plans and the unchanged comparator support the statistics mechanism rather than ordinary cache warming. They do not reveal the exact historical CI URL plan, which was not logged.

Root's last message proposes adjudicating a fixture-only statistics preparation change after reading this report; that is **not yet FIXGO**. A new exact candidate CI may supply remote validation if root authorizes that path. A separate bounded remote diagnostic remains an alternative, not an automatic additional run.

## Preserved boundaries and experiment design

No extra SQL was inserted inside the measured service transaction. A temporary test-side database adapter recorded monotonic acquisition, raw-phase and transaction-completion timings; exact Prisma.Sql objects stayed in memory for later replay. Manifest evidence contains count, UTF8 bytes and value count only. Plans retain exact SQL with placeholders and parameter types, with bound strings redacted from plan expressions. No URL values, credentials or arbitrary parameter payloads were emitted into the diagnostic measurements.

All measured service calls retained RepeatableRead, acquisition2,000ms, transaction5,000ms, statement2,000ms, lock500ms and total service12,000ms. Initial actual timeout arguments included transaction4,999ms. Each later EXPLAIN/EXPLAIN ANALYZE ran outside the original transaction through the same bounded read wrapper, separately subject to the existing5s/2s/500ms bounds. No failed plan was retried with larger limits. Twelve exact query plans each have estimated and actual JSON (24 bounded EXPLAIN operations), covering integrity/manifest/count/page for baseline, unchanged and analyzed requests.

P7.24 temporarily allowed a90s Vitest ceiling solely for the cap case's additional diagnostic work; the actual case completed13,925ms. The permanent30,000ms case ceiling was restored byte-for-byte. The original positive/negative assertions remained intact:4,097 distinct overflow rejects with NULL values and no count/page;4,096 distinct/exact8MiB succeeds with total4,097;8MiB+1 rejects with NULL values and no count/page; duplicate values collapse to one manifest value and still return total4,097. The comparator bypassed the fixture's assertion-counting wrapper to avoid polluting its original assertions, but its recorded manifest/count/page results match the baseline. The original baseline failure would have been rethrown even if a comparator passed.

The final sequence exactly matches the observed order of CI39110884618, not merely CLI path order. A temporary sequencer strictly validated all46 current workflow allowlist members. The temporary project-level setup ran original setup first, then applied/validated the dedicated URL and queried actual current_database/current_user before each test module. All46 identities are the new disposable DB and role test. No permanent sequencing or setup changes remain.

## Actual request timings

Milliseconds measured around the real adapter calls, including driver transfer/deserialization. EXPLAIN timings below are separate repeated SQL work and are not substituted for request wall time.

| Request | Integrity | Manifest | Count | Page | Transaction elapsed | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
|4,097 distinct overflow |67.602|469.248|not issued|not issued|539.346|expected SEARCH_UNAVAILABLE; count4,097/bytes8,390,656/valuesNULL |
|Original exact8MiB |67.680|651.340|943.956|941.481|2,615.522|success; count4,096/bytes8,388,608/values4,096; total4,097;21 raw page rows |
|Unchanged comparator |67.481|663.321|941.053|941.348|2,624.861|same metadata/count/page |
|After targeted ANALYZE |68.248|203.476|3.597|4.074|289.237|same metadata/count/page |
|8MiB+1 overflow |67.415|8.049|not issued|not issued|77.526|expected SEARCH_UNAVAILABLE; count4,096/bytes8,388,609/valuesNULL |
|Duplicate values |3.030|1.889|1.593|2.314|11.269|success; one24-byte value; total4,097;21 raw page rows |

Acquisition was0.221–0.445ms, excluding acquisition as the local dominant cost. The baseline gap between manifest return and next settings call was7.724ms; unchanged8.142ms; analyzed6.981ms. This bounds local producer parsing plus intervening wrapper work and is small relative to repeated scans. The analyzed manifest's203ms adapter duration versus10.807ms EXPLAIN execution includes real8MiB transfer/deserialization; EXPLAIN does not send the URL array to the client. Do not label that difference SQL execution time or pure parser CPU.

## Exact plans, statistics and cache controls

`logs/task-2-native-budget-measurements.json` is authoritative. `logs/task-2-native-budget-plan-summary.txt` is a derived compact node summary. For baseline and unchanged manifest/count/page, CollectibleItem estimates1 versus4,097 actual, CFV selected-definition index scans have4,097 loops/2,049 average rows, and each join removes8,390,656 rows. All these scans report shared hits, zero shared reads, zero temporary reads/writes. Buffer visits remain199,042 for each baseline/unchanged query despite warm data. Baseline EXPLAIN execution: manifest692.355ms, count1,141.095ms, page1,142.911ms; unchanged692.747/1,147.938/1,144.218ms. Instrumented EXPLAIN overhead explains differences from direct-call time; it is not added to service time.

After targeted ANALYZE, manifest uses hash join, estimates4,092 versus4,097 rows, and visits173 shared buffers; execution10.807ms. Count/page scan CFV once then perform4,097 CollectibleItem primary-key lookups, visit12,380 buffers and execute3.582/4.132ms. Count/page CFV estimate remains20 versus4,097 actual (the type/text predicate still has estimation limitations); therefore this experiment does not establish perfect cardinality estimates or that every production distribution is robust. Integrity remains roughly67ms throughout, with a single CFV scan; it is not the dominant A/B difference.

Before bulk growth, table stats showed CollectibleItem reltuples0 and CustomFieldValue reltuples-1. Background autoanalyze ran around fixture setup, before its bulk state was represented. At both after-original and after-unchanged snapshots, reltuples were **2 items and4 custom values**, while observed live tuple counts were4,098 and4,101 respectively. Those counts are statistical estimates, not exact count queries. last_autoanalyze remained09:01:11.141Z/09:01:11.145Z and manual analyze_count0 in both comparator snapshots. Targeted analysis at09:01:24 updated reltuples to4,098 items/4,100 values and n_mod_since_analyze0; manual analyze_count1 for each. Collection was not analyzed by the experiment and remained2 rows. Thus background analyze did not account for the unchanged-to-analyzed improvement.

Settings recorded for every snapshot: plan_cache_mode=auto, work_mem4MiB, jit=on, random_page_cost4, seq_page_cost1, effective_cache_size524,2888KiB pages, default_statistics_target100, autovacuum=on, threshold50/scale0.1. No global or session planner mode was changed. Installed app client creates PrismaPg with connectionString and optional connection timeout, without statementNameGenerator (`packages/db/src/create-client.ts`). Installed adapter-pg7.10.0 passes `name: this.pgOptions?.statementNameGenerator?.(query)` at dist/index.js682; pg8.23.0 `hasBeenParsed` requires a name. This code evidence does not indicate a persistent named-statement generic-plan cache in this path. No same-connection pg_prepared_statements snapshot was captured, so do not claim direct server evidence that all prepared-plan effects were excluded. The unchanged comparison, stable stats and plan-node differences support the observed statistics effect independently of assuming a cache mode fix.

Local runtime is pinned Node24.19.0/pnpm10.17.1, Vitest3.2.7, PG17.11 Homebrew/ARM. Historical CI uses Node24.21.0 and PG17.11 Debian/x86_64. CPU/runtime/background workload differences and exact historical URL plans remain unmeasured. The CI logs prove a transaction timeout while page SELECT was active, not which phase consumed most of that original five seconds.

## Commands, unsuccessful attempts and complete results

Commands with exact argument arrays, exit codes, wall times and logs are retained in `logs/task-2-native-budget-runs.json`; executable runner files retain environment handling without credentials. Commands used `source ../sammlerraum-test-env.sh` and pinned `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm …`. The native allowlist was parsed from `.github/workflows/ci.yml` and required exactly46 files. No third actual broad run was made.

| Attempt | Actual outcome | Evidence |
| --- | --- | --- |
|Normal migrations on new DB |success|task-2-native-budget-migrations.log |
|Regular `pnpm test`, native flag0 |73 files passed/36 skipped;785 tests passed/387 skipped; exit0;7.03s Vitest |task-2-native-budget-regular.log |
|Initial native CLI sequencer syntax |startup failure before collecting/running tests; Vitest requires constructor through configuration, not path as CLI value; exit1 |task-2-native-budget-full-native-startup-failed.log |
|First actual configured full native attempt |45 files passed/1 failed;495 tests passed/1 failed; exit1;70.32s Vitest. **Used shared sammlerraum_test**, not requested disposable DB |task-2-native-budget-full-native-shared-db-guard-failed.log |
|Corrected actual-DB preflight using same project setup/config as final |1 file/1 test passed; actual current_database and role verified; exit0 |task-2-native-budget-preflight.log |
|Second and final actual full native attempt, P7.25 |46 files/496 tests passed, no skips; exit0;85.05s Vitest/86.466s runner |task-2-native-budget-full-native.log |

The first actual full attempt was an avoidable diagnostic setup mistake: original `vitest.setup.ts` unconditionally overrides DATABASE_URL. I should have inspected it before relying on child environment override. Most synthetic suites ran on shared sammlerraum_test; the diagnostic guard rejected the cap case before its bulk setup. This was a real unsuccessful measurement attempt with shared synthetic mutations, **not zero-test** and not fresh-database evidence. Parent was informed immediately; no shared reset/drop was attempted. P7.25 authorized one corrected final broad run after fixing only temporary setup and proving current_database through a tiny focused test. Final configuration replaces setupFiles at the actual workspace project level; original setup executes once, then strict dedicated URL/current_database validation runs before imports. There was no default-setup source modification.

The regular run requested the disposable URL but native flag0 skipped database-backed cases; original default setup still replaced the URL at that stage. Its passed/skipped totals are valid regular-test evidence, not proof of database selection. The run metadata preserves requested/actual distinctions for the failed native measurement.

No types/lint/build rerun was warranted for temporary diagnostic-only files that are now removed; this is not a product candidate verification claim. No historical media/browser suite was rerun outside the explicit full native allowlist.

## Proposed minimal next scope; no FIXGO assumed

The smallest supported candidate is **fixture-only** explicit ANALYZE of CollectibleItem and CustomFieldValue immediately after deliberate bulk growth in this retained cap test and before the negative/positive requests. Keep all4,097/4,096/8MiB/8MiB+1/duplicate assertions, exact matching/integrity/ownership semantics and permanent30s case/5s transaction/2s statement limits. No application ANALYZE, new index, schema change, query rewrite, timeout increase, retry or skip follows from this diagnostic.

This would make synthetic fixture statistics reflect its intentional thousands-row jump; it does not repair production burst-growth or guarantee healthy statistics. A production owner whose data changes faster than autoanalyze can still encounter these poor plans and receive bounded SEARCH_UNAVAILABLE. That is a material known limitation to record, not conceal with a fixture change. Product query robustness against stale statistics would require a separately scoped measured query change and result-equivalence evidence; this experiment does not authorize it.

Root should adjudicate fixture FIXGO only after reading the exact measurements and this limitation. If accepted, retain these prechange measurements and both actual historical RED CI failures, preserve all assertions, perform relevant focused verification and one frozen full46-file/native candidate gate plus appropriate regular/types/lint/build, then independent scoped review and exact candidate CI. A new green candidate CI validates that candidate under remote conditions; it does not retroactively prove the historical URL plan.

If root instead needs direct remote causal confirmation before a candidate, use **one** bounded remote diagnostic on the exact source: same measured adapter/phases/clock/settings, all46 CI files serialized, phase plans outside the service transaction, one unchanged comparator and evidence-supported two-table ANALYZE only, same budgets/assertions. Adapt the dedicated DB identity guard to a positively created ephemeral CI database and upload measurement JSON/patch/log artifacts even on failure. Root owns remote dispatch/push. No such remote run or workflow change was made here.

## Restoration, database cleanup and evidence inventory

Original retained source restored exactly from baseline; SHA256 `f7238099ba2d473d9990e2497d7bc9ca25d32fe796523326330107c90867bb87`. Temporary helper and preflight test removed. Permanent case30,000ms restored. Default configuration/workflow/application source untouched. Staged diff is empty. Remaining tracked modifications are root-owned progress.md/task-5-context.md and were not edited/staged by this task. See restoration receipt.

Created database was exactly `sammlerraum_budget_20261018_test`, OID27487, owner test on the positively owned local PG17.11 server/data directory. Normal migrations applied. Before cleanup, matching OID/name/owner/server/postmaster-start identity was verified and pg_stat_activity showed no connections to it. Only that database was dropped, absence verified at09:04:23Z. Shared sammlerraum_test was neither reset nor dropped. Receipt files retain server/DB identity without credentials.

All files below are in this plan's `logs/` directory:

- `task-2-native-budget-measurements.json`: full phase records, snapshots and24 estimated/actual exact plans.
- `task-2-native-budget-plan-summary.txt`: derived plan-node summary; original JSON remains authoritative.
- `task-2-native-budget-observation.patch`: exact removed instrumentation, including90s diagnostic ceiling; SHA256 `daa03940e810cd23bcf2098102c5189f1bfa679923d9ee61c2f081b28d46d439`.
- `task-2-native-budget-source.json`: temporary file hashes and baseline restored-file hash. Earlier observation-v1.patch/source-v1.json preserve the initial diagnostic version.
- `task-2-native-budget-order.json`, `task-2-native-budget-order-identity-verification.json`: intended/actual46-file order and actual DB proof; final log also contains each identity.
- `task-2-native-budget-runs.json` and the six named command logs above: exact attempts/results, including both failures and preflight.
- `task-2-native-budget-runner.py`, `task-2-native-budget-native-runner.py`, `task-2-native-budget-corrected-native-runner.py`, `task-2-native-budget-preflight-runner.py`: exact execution scripts.
- `task-2-native-budget-sequencer.ts`, `task-2-native-budget-setup.ts`, `task-2-native-budget-vitest.config.ts`: retained temporary harness scripts, inactive by default after source restoration.
- `task-2-native-budget-db-receipt.json`, `task-2-native-budget-db-cleanup.json`, `task-2-native-budget-restoration.json`: ownership/cleanup/restoration receipts.
- Historical root-retained `task-3-ci-39110884618-connector-full.log` and `task-3-ci-39110881850-connector-full.log`: actual timeout evidence; unchanged by this task.

No further local suite or database work remains authorized by this diagnostic. Root review/ruling is the next step.
