# Exact Market Batch Eligibility and Rights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, only after root adjudication and a fresh source brief. This preparation authorizes no source or database work and no additional agents.

**Goal:** Supply the minimum bounded, rights-aware market relation needed by Phase07 source-specific filters and dashboard details/explicitly permitted external reference totals, while preserving Phase06 behavior.

**Architecture:** Validate distinct current and historical catalog snapshots in bounded batches using the existing canonical schema, then join validated manifests to exact current mappings and stored observations in parameterized PostgreSQL. A transaction-local handle supplies zero-or-one latest eligible row per item/selector only after whole-outer-scope coverage and ambiguity checks. Independent trusted query and aggregation grants intersect existing display rights; every production policy remains empty by default.

**Tech Stack:** Existing TypeScript, Zod, Prisma.sql, PostgreSQL17, Vitest; no dependency, schema, migration, worker, provider, account or license changes.

**Spec:** `root-design-rulings.md` L1.4/P7.1–3, `task-2-context.md` P7.5–7, `task-2-execution-context.md` P7.8, market sections of `task-2-query-preparation.md`, and original Phase07 Task4. Paths without a prefix in this paragraph are beside this plan. Root's preparation instruction additionally requires a finite safe aggregate implementation/proof, without live rights activation.

## Global constraints and evidence boundary

- Source inspection is pinned to `4b4dce2d0eefc5d4ec85139efbbf2de71d50dd6d`; the concurrent Task2A implementer owns current source. This plan is the only file this architect writes. No tests, DB access, network, staging, commit or HEAD mutation were performed.
- OWNED means live item and live parent both owned by the trusted actor. Apply the request lifecycle before coverage; apply no AST, text, cursor, page, ranking or amount predicate before coverage. No shared inference authorization exists yet.
- Preserve Phase06 `valuation-query.ts`, display policy, browsing group/token contracts, provider registration, ingestion and default-OFF production composition. A browsing group's first record is never a semantic selector.
- Full semantic identity is current exact item target `(entryId, nullable variantId)` plus provider, namespace, identifier type, external value, kind, sourceMetric, complete qualifiers, currency and stored exponent. Never substitute the current ISO exponent, unitKey, another variant, entry fallback, historical mapping, current price, provider priority or converted currency.
- Keep existing 12s total/three specific serialization attempts, 5s transaction, 2s acquisition/statement and 500ms lock budgets from the consumer's bounded RepeatableRead wrapper. Preparation runs inside that transaction/budget; it never opens a nested transaction or retries independently.
- Missing eligible data is a two-valued predicate result only after rights and complete preparation succeed. Disabled rights, ambiguity, incomplete bounded coverage and dependency failure abort the requested operation, including under NOT/OR or on empty candidates. No partial search page or numeric result is returned on failure.
- Implement deterministic capability code with synthetic trusted grants. Real grants remain empty/OFF. This is not a requirement to purchase a license before testing code.

## Review focus

1. A newer wrong-metric/qualifier/exponent/product row must not displace the correct identity's latest row; tests belong to Tasks2/3.
2. Current identifier replacement with the same value can preserve old observations, while inactive/wrong-target mappings cannot; Task2 tests both sides.
3. An ambiguous item outside text/page/other-filter matches must still reject the operation; Task3 tests count, exhausted page, NOT, OR and empty inventories.
4. A malformed historical snapshot is ineligible as in Phase06, whereas a malformed current snapshot is invariant failure; Task2 tests complete canonical validation, not just identifier JSON paths.
5. Dashboard sums must neither infer additive rights from display/filter nor present missing values as zero or range endpoints as point values; Task4 tests granted, denied, partial and empty results.

## 1. Committed facts that constrain the implementation

`packages/domain/src/valuations/valuation-query.ts` validates a current CatalogRevision with `CatalogSnapshotSchema`, matching entry/category, unique variant IDs, unique identifier IDs and unique `(variantId,namespace,type,value)`, and valid identifier-to-variant references. It requires the selected variant's live row to be active and present in the current snapshot. Active identifiers are selected on the **exact nullable item target**, limited to201 to detect >200, then intersected with exact current snapshot ID/target/namespace/type/value. Historical observations additionally require their own revision to pass the same canonical checks and contain their observed identifier ID/target/value. Current identifier ID may differ from observed ID. Invalid historical snapshots yield ineligible observations; invalid current snapshots fail invariant. There is no CatalogEntry.active column.

`market-display-policy.ts` snapshots at most8 provider grants, validates exact registration namespace/type and rejects duplicate providers. `ProviderRegistry` captures immutable identities but registration grants neither display nor query permission. `allowHistorical` does not affect CURRENT_MAPPING permission. Calling registry.get never fetches. The new path must use `displayGrants`, not reproduce a more permissive check.

`MarketObservation` already stores all selector fields, immutable timestamps and exact amounts. Native constraints validate amounts, denominations, qualifiers and timestamp shape; catalog insertion requires a current active exact binding. History indexes cover target/provider/kind/currency, with the source-history index also covering namespace/type/externalId, then `(observedAt DESC,createdAt DESC,id DESC)`. Neither index prefixes metric/qualifiers/exponent; native plans, not assumptions, decide whether a later narrow index proposal is justified.

Task1 `marketMoney` has CURRENT_ITEM_MAPPING, required metric/full qualifiers/denomination, point range, interval overlaps/containedBy and present/missing. The generic current-availability validator rejects it today. It must remain rejecting for callers without the new seam. L1 legacy money and duplicate gates are unrelated and stay intact.

## 2. Exact typed seam

Create `packages/domain/src/market-data/market-query-policy.ts`, `market-batch.ts`, `market-batch-sql.ts`, and `market-aggregate.ts`. Types are domain-internal, not new browser input envelopes. Derive selector/test types from the existing parsed AST:

```ts
type MarketLeaf = Extract<ItemFilterLeaf, { kind: 'marketMoney' }>;
type MarketSelector = MarketLeaf['selector'];
type MarketPurpose = 'FILTER' | 'DASHBOARD_DETAIL';
type MarketAggregateBasis = 'ONE_PER_ITEM' | 'CURRENT_QUANTITY';
type MarketQueryGrant = Readonly<{
  selector: MarketSelector;
  purposes: readonly MarketPurpose[];
}>;
type MarketAggregateGrant = Readonly<{
  selector: MarketSelector;
  semantics: 'ADDITIVE_PER_UNIT_REFERENCE_VALUE';
  bases: readonly MarketAggregateBasis[];
}>;
type MarketQueryPolicy = {
  snapshotForOwner(actorUserId: string): Readonly<{
    queryGrants: readonly MarketQueryGrant[];
    aggregateGrants: readonly MarketAggregateGrant[];
  }>;
};
type MarketBatchScope = Readonly<{
  actorUserId: string;
  lifecycle: 'ACTIVE' | 'ARCHIVED' | 'DISPOSED' | 'ALL';
}>;
type MarketBatchUse =
  | { purpose: MarketPurpose }
  | { purpose: 'DASHBOARD_AGGREGATE'; basis: MarketAggregateBasis };
type MarketBatchContext = {
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>;
  scope: MarketBatchScope;
  // From the consumer's trusted compiler; never public input or filtered matches.
  // Exactly id,quantity,catalogEntryId,catalogVariantId for ALL authorized outer rows.
  ownedCandidates: Prisma.Sql;
  checkBudget(): void;
};
type PreparedMarketBatch = {
  // CTE fragment defines fixed relation market_latest; private construction only.
  readonly ctes: Prisma.Sql;
  // Developer-owned fixed item alias i; leaf must refer to a prepared selector.
  predicate(leaf: MarketLeaf): Prisma.Sql;
};
type MarketBatchDependencies = {
  displayPolicy: MarketDisplayPolicy;
  queryPolicy: MarketQueryPolicy;
  registry: ProviderRegistry;
};
function withMarketBatch<T>(
  context: MarketBatchContext,
  selectors: readonly MarketSelector[],
  use: MarketBatchUse,
  dependencies: MarketBatchDependencies,
  consume: (batch: PreparedMarketBatch) => Promise<T>,
): Promise<T>;
function aggregateMarketBatch(
  context: MarketBatchContext,
  batch: PreparedMarketBatch,
  selectors: readonly MarketSelector[],
  basis: MarketAggregateBasis,
): Promise<readonly MarketReferenceTotal[]>;
```

Only `withMarketBatch` constructs the handle, scoped to its callback and exact transaction/scope/use. The implementation records private transaction/context/use identity and rejects mismatched aggregate use or selector use; it does not trust a structurally forged object. No process cache, persisted capability token or reusable cross-request proof. `aggregateMarketBatch` checks that the handle was prepared for DASHBOARD_AGGREGATE with that basis. Calling FILTER preparation does not authorize aggregate consumption.

Consumer adaptation after Task2A lands is narrow: pass its existing independent owned candidate SQL and bounded transaction context; register the prepared predicate for market leaves; preserve the existing mixed compiler/count/page/route implementation. The source brief must name those then-actual Task2A files and export a shared owned-candidate builder if necessary; do not create a second ownership/lifecycle implementation. SQL tests assert this relation contains no text/AST/cursor restriction. A trusted SQL fragment is not a public escape hatch: no client identifiers, raw SQL, arbitrary aliases, paths or Prisma.raw are accepted.

`market_latest` columns: itemId, selectorOrdinal, quantity, entryId, variantId, externalId, observedIdentifierId, currentIdentifierId, observationId, catalogRevision, currentRevision, amountMinor, lowMinor, highMinor, observedAt, createdAt. Its primary logical key is `(itemId,selectorOrdinal)`, with zero or one row. Ordinals are assigned by canonical deduplication of complete selectors, in first AST preorder; qualifier object key order is immaterial, string values and boolean types remain exact. No item list is materialized in JavaScript.

### Rights and errors

Add `emptyMarketQueryPolicy` returning frozen empty arrays. Limit each query/aggregate grant array to50; validate all strict shapes, at most2 unique purposes/bases per grant, duplicate complete selectors, and canonical qualifier identities. Deep-copy and freeze captured values. Intersect every requested selector with `displayGrants` and an **exact complete-selector** purpose/basis grant. An aggregate grant explicitly asserts that the named metric is a per-unit additive reference value; it is not inferred from kind alone. No wildcard policy or fallback from display, worker activation, `allowHistorical`, filter, detail, or another aggregation basis.

Capture trusted display/query snapshots once per preparation attempt. Their data is not in PostgreSQL and must not be described as an MVCC rights table. Re-snapshot/canonical-compare them immediately after `consume` and before returning: any requested capability lost/changed aborts the result; a new request reevaluates. This detects in-process revocation during awaits without claiming linearizability against external license systems. No new remote policy provider is introduced. Retry of a DB serialization failure captures fresh rights under the outer total budget.

`MarketBatchError` has a constant message equal to its closed code and no payload/cause: codes `MARKET_BATCH_INVALID`, `MARKET_BATCH_INVARIANT`, `MARKET_BATCH_DEPENDENCY`, `MARKET_BATCH_UNAVAILABLE`; the last has reason `DISPLAY_DISABLED | QUERY_RIGHTS_DISABLED | AGGREGATE_UNSUPPORTED | MAPPING_AMBIGUOUS | COVERAGE_LIMIT`. Invalid trusted configuration or forged handle is INVARIANT; malformed public AST stays the existing parser's INVALID. Unknown/unregistered selector provider or namespace/type mismatch has no matching usable grant and is QUERY_RIGHTS_DISABLED; a configured grant naming an invalid registration is INVARIANT. Dependency/time budget uses the consumer's existing closed503 mapping. Snapshot-count/byte overflow is COVERAGE_LIMIT, not missing. Avoid logging thrown policy/DB payloads.

Search maps unavailable to existing `FilterValidationError('FILTER_UNAVAILABLE', reason)`: DISPLAY_DISABLED→MARKET_DISPLAY_DISABLED; QUERY_RIGHTS_DISABLED→new closed `MARKET_QUERY_RIGHTS_DISABLED`; MAPPING_AMBIGUOUS→MARKET_MAPPING_AMBIGUOUS; COVERAGE_LIMIT→CAPABILITY_SNAPSHOT_LIMIT. The new reason is an additive internal allowlist member in `search-parser.ts`; HTTP still exposes generic FILTER_UNAVAILABLE/422. Dashboard uses its own closed unavailable state for this operation, never a numeric zero. AGGREGATE_UNSUPPORTED is a deliberate unavailable capability when no exact additive grant exists. Do not catch unrelated bugs as missing/unavailable or serialize policy/input errors.

## 3. Batched resolution and SQL contract

All reads below share the consumer's one RepeatableRead transaction and budget wrapper. There are **three fixed preparation data queries**, independent of item count, followed by consumer count/page or aggregate queries. Timeout-setting statements do not count as data queries but must be included in measured round trips/budget. No per-item/per-selector/per-revision read, valuation API loop, SQL per-item network round trip, temporary table or write is needed.

1. **Current snapshot batch and integrity envelope.** From the unfiltered owned candidate CTE, collect distinct linked `(entryId,currentRevision,categoryTemplateId)`. Return at most1025 distinct revision records plus a scalar guard for linked missing entries and any exact target with >200 active identifiers before intersection. Guards must still be returned with zero snapshot records. Before fetching JSON, compute `octet_length(snapshot::text)` and the bounded selected set's cumulative size in SQL; return no JSON when count>1024 or bytes>8MiB. Missing/malformed current revision is INVARIANT. Parse every returned current snapshot with `CatalogSnapshotSchema` and the exact Phase06 uniqueness/referential/category checks. Check budget before/after parse and between records. Build a validated current manifest of entry/revision/category, variant IDs and exact identifier tuples.
2. **Relevant historical revision batch.** Join candidates to active exact-target current identifier rows and the validated current manifest. Entry-only items use only NULL variant identifiers; variant-linked items require a live active variant present in the manifest and use only that variant's identifiers. Intersect the parameterized grant/selector relation; join MarketObservation on exact target, provider/namespace/type/value/kind/metric/full JSONB qualifier equality/currency/stored exponent. Collect distinct `(entryId,catalogRevision,categoryTemplateId)` before any time/range/cursor filtering. Fetch/validate their snapshots in one query, reusing current revisions already validated. Combined distinct current+historical revision cap is1024, combined snapshot JSON cap8MiB. Invalid/missing historical snapshots produce **no historical eligibility manifest**, preserving Phase06's ineligible-row behavior; they do not count as a covered valid row. A valid older eligible observation can therefore win over a newer ineligible one. Any cap prevents a coverage proof and fails the whole operation.
3. **Whole-scope ambiguity guard.** Join observations to the historical manifest on entry/revision/category and observed identifier ID/exact nullable target/namespace/type/value, requiring variant membership. `eligible` is the resulting relation, retaining selectorOrdinal and item identity. Group by item/selector and count distinct semantic mappings `(entryId,variantId,externalId)`; any count>1 is MAPPING_AMBIGUOUS. Guards are independent of later match/count/page/aggregate and include all requested selectors at once. Return scalar diagnostics only, never foreign identifiers. With no ambiguity, define `market_latest` by row_number partitioned by item/selector and semantic mapping, ordered observedAt DESC, createdAt DESC, id DESC, retaining rn=1. Reuse the exact same generated CTEs for every consumer query in the snapshot.

Bound the serialized combined normalized manifests at8MiB as well; overflow is COVERAGE_LIMIT. Validate all key counts before building parameters. At most50 deduplicated selectors and8 display providers follow the existing AST/display limits. These are explicit fail-closed operational limits, not claims that arbitrarily large inventories complete. Snapshot and manifest caps cover JavaScript memory; PostgreSQL statement/transaction deadlines cover scans, distinct, sorting, count and joins. LIMIT alone is never the work bound. Empty selector requests skip preparation entirely; empty candidate requests still validate requested rights first.

The SQL grant/selector seam is a bound JSONB value consumed by a fixed `jsonb_to_recordset` declaration (selectorOrdinal int, providerId text, identifierNamespace text, identifierType text, kind text, sourceMetric text, qualifiers jsonb, currency text, minorUnitExponent int). Its values are validated trusted copies; no generated identifiers or embedded values. Current/historical manifests use separate fixed recordsets. Use `IS NOT DISTINCT FROM` for nullable variant equality, JSONB `=` for **complete** qualifier equality (not containment), deterministic `COLLATE "C"` equality for exact text identities, and fixed enum casts for validated kinds. Preserve stored exponent equality; no currency table lookup on reads. Parameter values containing quotes/percent/backslash never affect SQL grammar.

**Ambiguity choice:** count mappings that have at least one fully eligible observation for the requested full semantic tuple. Two current identifiers where only one has that tuple are not ambiguous for this selector; two qualifying product identities are ambiguous even if amounts are equal or one observation is newer. This follows P7.2's semantic mapping resolution under kind/metric/qualifiers/denomination, and avoids inventing metric support from an identifier alone. Duplicate live identifier records with one semantic tuple cannot multiply results: current snapshot uniqueness and exact-ID intersection prevent them.

**Predicate semantics:** presence is EXISTS market_latest for this item/selector; missing is NOT EXISTS. Point range is inclusive minimum/maximum on that one row. PRICE_RANGE overlaps is `low<=max AND high>=min`; containedBy is `min<=low AND high<=max`. Missing gives false for positive comparisons; surrounding NOT complements only after global preparation. Amount predicates are evaluated **after** latest selection. No quantity multiplier in search. No fallback across denominations or metrics when a latest row misses the range.

**Retirement:** generic catalog attribute retained-fact search remains separate. A retained inactive variant/identifier is not current-market eligible. No entry-level active flag is invented. A current active identifier with replacement ID but the same value can match an older observation whose own revision/observed ID validates; an inactive replaced value cannot.

## 4. Finite safe dashboard aggregate capability

This plan implements aggregate machinery, not a permanent unavailable stub. Synthetic exact aggregate grants exercise permitted point and interval metrics. Production remains default-empty until separately authorized rights exist. A kind alone never proves additivity: e.g. SOLD_AVERAGE or SOLD_MEDIAN can contribute only when an explicit trusted exact metric grant affirms a comparable per-unit reference-value interpretation. The result is a **reference-value sum**, never realized sale proceeds, a portfolio fair value claim, average-of-averages, median-of-medians or inferred provider estimate.

An aggregate request supplies 1..50 deduplicated existing selectors and one basis. Run the same entire scope eligibility/ambiguity preparation. For each selector, group only by the full selector tuple plus basis; intentional cross-product addition occurs only within the explicit aggregate grant. Do not combine provider, namespace/type, kind, metric, qualifier object, currency or exponent groups. The external product ID stays on detail rows; it is not a selector-wide equivalence claim outside this explicitly licensed reference sum.

For ONE_PER_ITEM weight=1. For CURRENT_QUANTITY weight=current owned item.quantity from this same MVCC scope; unit prices remain per-unit and quantity is multiplied exactly once. Cast amount and quantity to PostgreSQL numeric **before** multiplication and SUM so aggregate int64 overflow cannot occur. Point metrics sum amountMinor; PRICE_RANGE sums lowMinor and highMinor separately (Minkowski sum), never midpoint. SQL groups by exact selector, with only its one latest row per item. Different source observation dates remain visible as minimum/maximum observedAt among contributors; no synthetic latest timestamp or currency conversion.

`MarketReferenceTotal` is a strict internal/wire-ready discriminated shape:

```ts
type MarketReferenceTotal = {
  selector: MarketSelector;
  semantics: 'ADDITIVE_PER_UNIT_REFERENCE_VALUE';
  basis: MarketAggregateBasis;
  coverage: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
  candidateItemCount: string;
  contributingItemCount: string;
  missingItemCount: string;
  contributedQuantity: string;
  observedAtFrom: string | null;
  observedAtTo: string | null;
  total: null
    | { type: 'POINT'; amountMinor: string }
    | { type: 'RANGE'; lowMinor: string; highMinor: string };
};
```

Item counts are canonical nonnegative decimal integer strings (at most19 digits); quantity and monetary sums are canonical nonnegative decimal integer strings (at most78 digits), with explicit invariant rejection on overflow/malformed driver representation. Sum quantity as numeric too. No Number conversion. Zero is a valid contributed total; no contributors means total=null and EMPTY, including zero candidates. Some missing observations means PARTIAL with an explicitly labelled contributed subtotal; all candidates contributing means COMPLETE. Missing includes unlinked/inactive/no mapping/no eligible observations after successful rights/coverage preparation. It is not a zero-valued contribution. contributedQuantity is the actual sum of contributing item quantities for either basis; basis identifies whether it was used as a weight. All requested selector groups appear, including empty ones. No partial group array on rights/ambiguity/coverage failure.

The Phase07 dashboard adapter may display COMPLETE totals and explicitly labelled PARTIAL subtotals, or withhold partial totals; it must preserve coverage/counts and never rename a partial sum as a complete inventory total. Details and totals require their respective independent grant. This seam excludes export, provider-value caching, cross-owner analytics, historical-mapping totals and other aggregation methods; requests for unsupported operations fail explicitly rather than falling back to SUM.

## 5. Finite implementation tasks and proof

### Task1 — independent rights, closed errors and transaction-local types

**Create:** `packages/domain/src/market-data/market-query-policy.ts`, `market-query-policy.test.ts`; add types/error definitions in `market-batch.ts`. **Modify:** `packages/domain/package.json` export map only if consumers cross package boundaries; `packages/contracts/src/search-parser.ts` for the one new closed unavailable reason, with focused closed-error assertions in the actual `packages/domain/src/search/filter-ast.test.ts`.

- [ ] RED tests: display alone/registration alone/query alone cannot grant FILTER; FILTER cannot grant DETAIL or aggregation; wrong selector field/qualifier type/order, forged/duplicate/excess grants, registry mismatch, mutable caller arrays, unknown provider, empty candidates and policy revocation during consume.
- [ ] Run `pnpm vitest run packages/domain/src/market-data/market-query-policy.test.ts`; preserve the actual failure.
- [ ] Implement exact policy snapshots/intersection/error mapping and private handle identity above. Do not edit Phase06 policy or production activation.
- [ ] Re-run focused unit tests; prove no provider.fetch invocation and no raw input/cause in serialized errors.

### Task2 — fixed-query current/history validation and SQL eligibility

**Create:** `market-batch-sql.ts`, implement `market-batch.ts`; tests `packages/domain/src/market-data/market-batch.integration.test.ts`. **Read/reuse:** CatalogSnapshotSchema, displayGrants, ProviderRegistry and the consumer's bounded query wrapper.

- [ ] RED native fixtures through real catalog/item/market producers: exact nullable target; inactive variant/identifier; replacement same-value/new-ID mapping; old observed ID/revision; invalid current snapshot versus invalid historical snapshot; duplicate IDs/tuples/wrong-category/full-schema failures; one qualifying external ID versus two; wrong provider/metric/qualifiers/currency/exponent; createdAt/id ties; latest eligible before range; >200 live identifiers; >1024 combined revisions; byte caps. Corruption fixtures must stay isolated to guarded synthetic DB and restore any temporarily disabled constraint/trigger before leaving the test.
- [ ] Run `RUN_DATABASE_INTEGRATION=1 pnpm vitest run --no-file-parallelism packages/domain/src/market-data/market-batch.integration.test.ts`; confirm real RED, not an environment/missing-DB failure.
- [ ] Implement the three batch queries, shared generated eligible/latest CTE, bounded parse manifests and fixed recordset casts. Keep historic ineligibility/current invariant distinction exact.
- [ ] Prove item-count-independent preparation query counts for1/50/500 owned items with many shared targets; concurrency between preparation/count/rows and catalog edits/identifier retirement/item deletion sees one snapshot, and the next request sees the new state. Prove actual statement timeout, driver error mapping, and no result after outer budget exhaustion. Preserve Phase06 native valuation-query tests unchanged and passing.

### Task3 — market-filter adapter only, after Task2A lands

**Modify:** actual Task2A service/compiler/availability adapter and its existing native/route test files, named in the fresh source brief after root reconciles that commit. **Create:** `packages/domain/src/search/market-filter.integration.test.ts` for focused consumer parity. Keep default `validateCurrentFilterAvailability` rejecting market when no market capability seam is supplied; add a narrowly internal path used only inside the service that guarantees preparation before evaluation. Do not reimplement Task2A's generic parser, authorization, wire, reference guards, cursors or errors.

- [ ] RED native test: an ambiguous owned item excluded by text/other clause and outside page still rejects a positive/NOT/OR query; denied rights reject on empty inventory and exhausted cursor. Foreign/deleted-parent ambiguous rows do not affect owned results.
- [ ] RED point zero/int64 and interval endpoint tests; full qualifier object equality including extra keys and boolean-vs-string; selector deduplication; no metric/exponent fallback; literal identity values; present/missing and nested NOT/OR parity.
- [ ] Wire exact prepared predicate into mixed SQL and skip only market's old producer-gap rejection when the guaranteed preparation path is installed. Every market leaf is collected independently of Boolean simplification. Existing L1/duplicate gaps remain whole-tree unavailable.
- [ ] Run `RUN_DATABASE_INTEGRATION=1 pnpm vitest run --no-file-parallelism packages/domain/src/search/market-filter.integration.test.ts` plus the exact changed Task2A native/route files. Assert generic422/no-store/fresh auth and no partial count/page. Saved searches call this same live path; do not cache rights or eligible IDs.

### Task4 — explicit aggregate operation and dashboard adaptation

**Create:** `packages/domain/src/market-data/market-aggregate.ts`, `market-aggregate.integration.test.ts`. **Modify:** then-actual `packages/domain/src/dashboard/dashboard-service.ts`, `packages/contracts/src/dashboard.ts` and dashboard tests only after that consumer exists; the fresh brief names the files. Add the strict MarketReferenceTotal schema there, derived selector identity rather than a second wider selector. Until consumer integration lands, the tested domain operation is complete but original dashboard acceptance remains open.

- [ ] RED native tests: separate exact grants for additive point/range metrics, both bases and quantities1/>1; no rights inferred from display/filter/detail; unsupported exact metric/basis rejected; same currency but different exponent/metric/qualifiers/kind/provider remain separate; same product in two owned item rows counts their actual owned units; manual values never enter external totals.
- [ ] RED aggregation fixtures: amounts above JS safe integer, product/sum above int64, zero contributor value, zero candidates, all missing, partial and complete coverage, interval sums, unequal observation dates, ambiguity under another filter, hidden foreign rows, revocation, snapshot and timeout failure. All grant/provider data synthetic, fetch count zero.
- [ ] Implement one aggregate data query over the validated relation with exact numeric arithmetic and strict bounded output; no cross-selector total or implicit point conversion. Add dashboard adapter preserving generic unavailable state, source labels, per-unit/basis and coverage, and default-empty injected policy.
- [ ] Run `RUN_DATABASE_INTEGRATION=1 pnpm vitest run --no-file-parallelism packages/domain/src/market-data/market-aggregate.integration.test.ts` plus dashboard integration tests. The test matrix must actually execute an allowed aggregate, not only assert rejection.

### Task5 — local/CI proof, finite operational documentation and acceptance handoff

**Modify:** `.github/workflows/ci.yml` native allowlist for the three new integration test files (and actual dashboard tests where applicable); `docs/market-provider-operations.md` with query/aggregate rights default-OFF semantics and caps, without new activation credentials/instructions. Produce implementation evidence/report beside this plan; root owns review/ledger/push.

- [ ] On root-provided native PG17.11 `sammlerraum_test` only, use `createTestDatabaseClient`/existing RUN_DATABASE_INTEGRATION guard and root's synthetic env helper. Coordinate DB tests with the sole runtime owner. Node24.19.0/pnpm10.17.1 commands use the existing pinned runner. No runtime install, new DB server, production fixture or live provider request is needed.
- [ ] Record RED→GREEN commands, actual executed/passed/skipped totals and source SHA. Native focused tests are mandatory; regular test skips are not proof. Run all new native files together serially plus Phase06 valuation-query and valuation routes regressions.
- [ ] Capture synthetic `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for shared/distinct targets, many histories/irrelevant metrics/qualifiers, ambiguity guard, latest relation, search count/page and aggregate. Record row cardinalities, timings, buffers, sort behavior and round trips. Existing indexes are the baseline. If a representative valid query exhausts bounds, report it and propose one measured narrow index to root; no automatic schema/index expansion.
- [ ] Run the existing regular suite/typecheck/lint/build once on the frozen candidate after focused tests pass, and actual PostgreSQL17-bookworm CI native jobs with the added files. Exact candidate CI must execute allowed FILTER and aggregate cases and prove default-OFF composition; a successful generic build is insufficient.
- [ ] Root reviews parity, rights/error projection, actual plans and all consumer gates. Full Task2/Phase07 acceptance requires market consumer integration plus independently named L1/shared/duplicate/wishlist gates; completing this prerequisite does not change the canonical task count by itself. No merge/deployment/checkoff is implied.

## Remaining choices for root adjudication

1. Approve the three-data-query validated-manifest design and explicit total caps1024 revisions/8MiB snapshots/8MiB manifests. It preserves the actual canonical parser, bounds memory and avoids N+1; the cost is whole-operation unavailable on unusually broad inventories rather than silent truncation.
2. Approve ambiguity among **fully eligible semantic** mappings, not all namespace/type identifier rows irrespective of the requested metric. Both cases are pinned by tests, so a stricter interpretation can be changed before code.
3. Approve the separate exact aggregate grant's additive per-unit reference semantics, both explicit quantity bases, interval endpoint sum, exact source groups and partial coverage label. This completes deterministic aggregate code without pretending every provider/kind is additive or enabling any real license.
4. Fresh source brief must reconcile actual Task2A transaction/owned-candidate/compiler/error exports and then-actual dashboard files; the immutable BASE contains neither consumer yet. This is the only integration naming dependency, not permission to redesign those consumers.

**Preparation status:** complete for adjudication; source, native execution, performance evidence, CI and all implementation checkboxes remain unperformed.
