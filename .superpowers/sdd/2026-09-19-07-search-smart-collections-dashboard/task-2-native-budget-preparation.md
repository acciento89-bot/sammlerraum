# Task2 retained URL native budget — read-only preparation

Prepared on local HEAD `a6e73099647af92a8a487a03930be5f215c0b3a5`, after root reported both exact `be1a496` CI native failures. Scope is diagnosis/preparation only. The media worker still exclusively owns source/DB/browser work. This preparation performs no database connection, suite execution, source/test/configuration edit, staging, commit, agent dispatch or checkoff. Only this file is written. Experiment and any fix require root's fresh source/DB GO after that owner releases.

## Confirmed evidence

Read the complete current retained-boundary fixture/query path and relevant workflow, transaction wrapper, compiler, typed guards, DB client/schema/index definitions; compared actual changes since `08c0e02`. Read the relevant failure blocks, native file order, database server errors and existing measured plans from both retained connector-full logs. No remote numeric total is inferred from a truncated tail.

| Exact CI run/job | Boundary test duration | Native result | Database evidence |
| --- | ---: | --- | --- |
| 39110884618 /117626582815 | 13,654 ms | 1 failed /495 passed, 46 files | `task-3-ci-39110884618-connector-full.log:1644`: PostgreSQL terminated PID547 at08:22:53.212 UTC for **transaction timeout**; next line identifies the final item-summary SELECT with ORDER BY/LIMIT |
| 39110881850 /117626572768 | 13,385 ms | 1 failed /495 passed, 46 files | `task-3-ci-39110881850-connector-full.log:1626`: same failure for PID543 at08:22:57.581 UTC; next line is the same final page query |

Both stack traces identify `search-retained-integrity.integration.test.ts:426:15`, the positive 4,096-distinct/exact8MiB request, and `runSearchTransaction`'s dependency-error projection at line72. These are PostgreSQL transaction failures, not the 30-second Vitest case timeout. Test duration includes fixture setup, the preceding negative request and cleanup, so it is not the positive request duration. Other server timeout entries belong to intentional pg_sleep/advisory-lock/valuation timeout tests and must not be conflated with this failure.

The negative 4,097-distinct branch completed its exact metadata/NULL-values assertions before line426. The positive request reached the final rows query: clock, references, boolean integrity, bounded manifest, canonical parsing and total-count stages had completed. This does **not** establish which stage spent most of the five-second budget or that the page query alone is slow. Current logs have no per-phase duration or plan for this exact URL fixture.

The unchanged request executes six data queries (clock, references, integrity, URL manifest, count, rows), initial timeout configuration, and remaining-budget settings before each data query. The wrapper preserves RepeatableRead, total12s/transaction5s/acquisition2s/statement2s/lock500ms, retries only recognized40001, and checks after every await. No diagnostic or fix may enlarge/disable those limits, skip the boundary, accept unavailable on the positive assertion, or add automatic retries.

Source comparison: only the transaction function's name/compatibility alias and SmartCollectionError pass-through changed along this call path for Task3. Query predicates, manifest, producer, retained fixture and deadline arithmetic did not change. Both CI runs use Node24.21.0 and PostgreSQL17.11 Debian/x86_64, while retained local evidence uses Node24.19.0/PostgreSQL17.11 Homebrew/ARM. Local Task3 eight-file/171-test gate passed with the boundary case taking9,231ms overall; earlier Task2 six-file gate passed with8,452ms overall. Neither test-level duration measures a single transaction.

The saved-query domain suite runs **after** the failed retained suite in both CI logs; it cannot cause earlier fixture churn. Its route suite runs earlier and remains in the full sequence. The previous item-search suite inserts/deletes1,000 plan-fixture items; its plan test does EXPLAIN ANALYZE, not ANALYZE table statistics. The retained suite then performs many text/URL updates and inserts4,097 new items plus4,097 URL values, immediately performs the overcount request, deletes one item and issues the positive request. No explicit relevant-table ANALYZE is present in this setup. PostgreSQL autovacuum/autoanalyze timing and table statistics are not recorded.

## Evidence-supported hypothesis, not a conclusion

**Leading hypothesis:** the sudden fixture cardinality change, possibly compounded by prior suite churn/statistics, permits a poor repeated nested-loop/definition scan plan for selected custom facts. Cumulative integrity/manifest/count/page work then exhausts5s on the slower/different CI environment. The final query merely happens to be running when the deadline expires.

There is a concrete warning in existing CI plans just before this fixture: the typed decimal diagnostic estimates1 candidate but returns1,002, and scans `CustomFieldValue_fieldDefinitionId_collectionId_fieldType_idx` **1,002 times**, with the item equality enforced at the join. CI typed count execution is3.595/3.658ms on that small one-value relation; it is not itself a failure. Local estimates also show1 versus1,002 but select a different item index and CFV sequential scan. The URL fixture puts4,097 values under one selected definition, so a comparable repeated scan could be materially more expensive. This is an extrapolation requiring the exact URL plans, not proof of O(n²) behavior in the failing request.

Alternative explanations remain open: unavoidable manifest sorting/transfer/deserialization cost at8MiB, URL producer CPU time, other SQL stages, prepared/generic plan behavior, connection/round-trip cost, runtime architecture/Node patch differences or contention/background maintenance. The SQL cast `fieldType::text` is worth inspecting because it cannot directly use the enum equality component of the existing composite index; no rewrite is justified from that observation alone. There is already an item+definition primary key and definition+collection+type index; no new index is proposed without measured need.

## Minimal causal experiment after ownership release and fresh GO

1. **Freeze and reproduce once.** Retain a source hash/HEAD and exact runtime/settings. Use the approved PostgreSQL17.11 synthetic `_test` database only; a fresh separately named disposable `_test` DB with normal migrations is preferable to resetting the shared database, but requires explicit root authorization. Preserve all fixture contents/caps and production budgets. Run the exact46-file native command from `.github/workflows/ci.yml` after the workflow's regular-test step, with `--no-file-parallelism`. Record actual execution order and initial statistics. Do not assume CLI path order is execution order: installed Vitest uses test result/stat caches in its sequencer, and the two CI runs swap a few early suites. If exact replay is necessary, use a temporary diagnostic-only sequencer with the observed list below, validated against installed Vitest; do not change permanent CI order merely to obtain green. A focused-only pass is insufficient.
2. **Add minimal test-side observation, not extra SQL in the timed path.** Extend only the fixture's existing `observed` adapter temporarily. Time transaction acquisition/callback entry, every raw call and return/failure, plus successful completion. Label fixed phases `settings/clock/references/integrity/manifest/count/page`, request branch `4097/exact8MiB/8MiB+1/duplicate`, and retain driver code/elapsed times. Record manifest count/bytes/value-count only. Keep the actual Prisma.Sql objects for diagnostic replay in memory; never log URL strings or arbitrary parameter values. The time gap after manifest return and before the next settings/count call isolates URL parsing and wrapper work without modifying the producer. Use monotonic timing; no mocks, sleeps, retries or changes to result assertions. This gives one instrumented exact-sequence baseline, not a repeated attempt until success.
3. **Capture stats and exact plans after the measured request.** Outside its transaction and before fixture cleanup, obtain `pg_class.reltuples/relpages`, selected `pg_stat_all_tables` live/dead/modified counts and analyze/autovacuum timestamps for CollectibleItem/CustomFieldValue/Collection, relevant `pg_stats` n_distinct/null fraction/correlation, server/driver versions and planner/work_mem/JIT/timeout settings. Snapshot these before bulk setup as well. Do not dump MCV payloads, URL data or unrelated rows. Retain EXPLAIN FORMAT JSON for the **exact captured** integrity, manifest, count and full-summary page SQL with the same bound parameters. Then EXPLAIN(ANALYZE,BUFFERS,SETTINGS,FORMAT JSON) each separately in diagnostic read transactions with the same existing2s statement/5s transaction bounds. Do not put EXPLAIN inside the measured service transaction: it repeats work and would contaminate the five-second measurement. If an individual plan times out, retain that failure and its non-ANALYZE plan; do not increase a limit to force a completed plan.
4. **One-variable statistics comparison, only if baseline supports it.** On the identical retained fixture, first make one explicitly labeled no-change timing/plan comparator to distinguish ordinary cache warming; then `ANALYZE` only the implicated tables (start with CollectibleItem/CustomFieldValue, include Collection only if its estimates require it), re-record stats, and run the same positive request and exact plans once. No fixture cardinality, URL byte lengths, query, timeout, Node version or assertions change. This is a finite causal A/B, not retry-on-failure. A collapse in repeated scans/buffer visits and cumulative latency after ANALYZE supports the stats hypothesis. If it does not change the offending phase/plan, stop that hypothesis and investigate the actually expensive phase instead.
5. **Close the evidence gap.** If the existing local setup cannot reproduce CI's plan/cost, do not claim a fix from a local pass. Compare the recorded Node/architecture/server settings; isolate one runtime variable or request one bounded CI diagnostic run on the exact candidate. Distinguish native output truncation from full evidence. The root owns any remote push/run and later review.

The first requested deliverable after GO is phase timings plus exact plans/stats, with no product patch. This keeps source scope narrow while resolving whether a test setup adjustment or a real compiler/query change is warranted.

## Conditional implementation scope and acceptance

- If the failure is causally established as an unrepresentative bulk-fixture stats transition, the smallest potential change is explicit statistics preparation **in this synthetic cap fixture**, preserving all success/overflow/zero-transfer assertions and checking both fresh and full-sequence behavior. It must be described as deterministic fixture preparation, not proof that production tables always have good statistics. One successful analyzed run alone is insufficient evidence that the product query is acceptable.
- If exact plans show avoidable repeated scans in the product compiler despite representative stats, root should authorize a narrow query/compiler correction that preserves owner/live/lifecycle scoping, exact count, no duplicate rows, all integrity and manifest limits, and same-MVCC ordering. Test exact old/new SQL/result equivalence and actual plan/cost on this fixture. Schema/indexes, broader query abstractions or caps/budget changes require a separate evidence-backed ruling.
- If transfer/parser cost is dominant, preserve the approved producer and manifest contract; present measured cost and a concrete narrow alternative to root before implementation. Do not silently reduce the8MiB/4,096 positive boundary or replace the existing URL parser.
- Any accepted source fix needs genuine retained RED/measurement-to-GREEN, focused relevant tests, then one frozen exact full46-file native gate (because subset-vs-full is the open issue), types/lint/build/regular checks appropriate to changed files, source-specific independent review and root-owned exact CI. Existing local171/oldc016/old888 success is background, not closure of this regression.

## Observed full native file order for run39110884618

This order is read from completed-file records in the full log; file execution is serialized. Run39110881850 swaps some early groups but the critical tail item-search → search-read → retained-integrity → smart-collection → valuation-query is identical. Both native logs are the authoritative runtime order, while `.github/workflows/ci.yml` is the authoritative46-file allowlist.

1. `packages/domain/src/media/media-service.test.ts`
2. `packages/domain/src/custom-fields/custom-field-service.test.ts`
3. `packages/domain/src/locations/location-service.test.ts`
4. `packages/domain/src/items/item-service.test.ts`
5. `packages/domain/src/collections/collection-service.test.ts`
6. `packages/domain/src/items/identifier-service.test.ts`
7. `packages/domain/src/identity/profile-service.test.ts`
8. `packages/storage/src/staging-lock.integration.test.ts`
9. `packages/domain/src/identity/security-service.test.ts`
10. `packages/domain/src/media/cleanup-service.test.ts`
11. `packages/db/src/media-lock.integration.test.ts`
12. `packages/db/src/media-migration.integration.test.ts`
13. `packages/db/src/postgres.integration.test.ts`
14. `packages/queue/src/postgres.integration.test.ts`
15. `apps/web/src/lib/catalog-history-routes.integration.test.ts`
16. `apps/web/src/lib/catalog-link-routes.integration.test.ts`
17. `apps/web/src/lib/catalog-proposal-routes.integration.test.ts`
18. `apps/web/src/lib/condition-routes.integration.test.ts`
19. `apps/web/src/lib/grading-routes.integration.test.ts`
20. `apps/web/src/lib/item-search-routes.integration.test.ts`
21. `apps/web/src/lib/security-service.integration.test.ts`
22. `apps/web/src/lib/smart-collection-routes.integration.test.ts`
23. `apps/web/src/lib/valuation-routes.integration.test.ts`
24. `apps/worker/src/jobs/image-repository.integration.test.ts`
25. `apps/worker/src/jobs/market-request-permit.integration.test.ts`
26. `apps/worker/src/jobs/market-sync.integration.test.ts`
27. `apps/worker/src/jobs/production-market.integration.test.ts`
28. `packages/domain/src/catalog/catalog-history-service.test.ts`
29. `packages/domain/src/catalog/catalog-read-service.test.ts`
30. `packages/domain/src/catalog/catalog-service.integration.test.ts`
31. `packages/domain/src/catalog/category-template-service.integration.test.ts`
32. `packages/domain/src/catalog/initialize-catalog.test.ts`
33. `packages/domain/src/catalog/item-catalog-link.test.ts`
34. `packages/domain/src/catalog/proposal-service.test.ts`
35. `packages/domain/src/condition/condition-service.test.ts`
36. `packages/domain/src/grading/grading-service.test.ts`
37. `packages/domain/src/market-data/market-data-service.test.ts`
38. `packages/domain/src/media/media-management.integration.test.ts`
39. `packages/domain/src/media/media-read.integration.test.ts`
40. `packages/domain/src/search/item-search-service.test.ts`
41. `packages/domain/src/search/search-read.integration.test.ts`
42. `packages/domain/src/search/search-retained-integrity.integration.test.ts`
43. `packages/domain/src/search/smart-collection-service.test.ts`
44. `packages/domain/src/valuations/valuation-query.test.ts`
45. `packages/domain/src/valuations/valuation-service.test.ts`
46. `apps/web/src/app/api/v1/items/resource-route.integration.test.ts`

## Preparation result

The exact transaction failure is established; the expensive phase and causal plan/statistics mechanism are not yet established. No fix, timeout relaxation, skip or retry is recommended at this stage. Root's ownership-release/sourceGO and controlled native evidence are the next dependency.
