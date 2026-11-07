# Phase07 prerequisite: exact market batch integration

Execution brief issued by root under the user's renewed authorization to finish Sammlerraum, after Phase10's one review/consolidated correction and local gates. Source BASE d69f78f54fb80b729865a636a0c69acf564e2fca. Existing DraftPR only; corrected Phase10 exact CI must be observed before dependent push/acceptance. No main/deployment, provider fetch/activation, rights purchase/grants, schema/migration changes, customer data or additional implementation agents.

Binding design: `.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/market-batch-implementation-plan.md`, its full P7.10–12 root rulings, and the approved V1 spec. This brief reconciles its stale preparation BASE with current code; it does not weaken its finite caps or expand providers. Work inline with TDD and one final whole-prerequisite review after Task5; root owns serial runtime.

Current consumers: `search/search-read.ts` bounded RepeatableRead wrapper; `search/search-compiler.ts` ownedCandidates/candidateFrom/compileFilter; `search/search-selection.ts` independent outer scope and shared money preparation; dashboard/dashboard-service.ts and contracts/dashboard.ts. Preserve existing monetary provenance, Phase06 display/registry, query transport and privacy fences.

Ruling: use current existing ownedCandidates and candidateFrom to derive id/quantity/catalog links over the independent outer scope; no second lifecycle/ownership implementation. This prerequisite does NOT close the independently required shared-scope and duplicate-filter integrations or change canonical task counts. Trusted capabilities remain default-empty, all actual providers OFF. No data query may run for denied rights, including empty inventories. Return closed errors, never policy input/cause.

### Task 1: Exact rights policy and closed internal contracts

- [x] Write failing pure tests for independent display/query/aggregate grants, complete selector identity and qualifier types/order, strict configuration/duplicates/bounds/registry, snapshots/immutability/revocation and zero fetch calls.
- [x] Implement market-query-policy.ts and market-batch.ts types/errors. Validate selectors through existing parsed market AST; strict per-purpose/per-basis trusted grants, frozen copies and post-consume rights recheck. No SQL eligibility placeholder presented as implemented.
- [x] Add only the closed MARKET_QUERY_RIGHTS_DISABLED filter reason and verify sanitized error mapping; current public market filters remain unavailable until Task3's actual seam.
- [x] Run focused policy/Phase06 display/filter tests and types, commit/report exact results.

### Task 2: Fixed-query validated current/history manifests

- [x] TDD native cases and implement the original three-data-query design,1024distinct current+history revisions,8MiB snapshot and normalized manifest caps, exact canonical parser parity and whole-scope ambiguity. Trusted callback-scoped transaction handle only, no nested transaction/N+1/fetch.
- [x] Prove exact current nullable targets, active variants/identifiers, identifier replacement semantics, current invariant/history ineligibility, latest eligible identity, caps, snapshot/budget/dependency behavior and fixed query counts.

### Task 3: Actual search filter consumer

- [x] TDD whole-outer-scope ambiguity/rights checks before text/AST/page/count, exact point/range/qualifier/exponent/presence semantics, NOT/OR and empty/exhausted-page parity.
- [x] Integrate with current prepareItemSelection/compiler/cursor/saved-query path; preserve other unavailable-family guards and generic422/no-store/auth contracts.

### Task 4: Explicit aggregate and dashboard consumer

- [x] TDD granted point/interval additive per-unit reference totals with ONE_PER_ITEM/CURRENT_QUANTITY, exact SQL numeric sums, explicit full selector groups and coverage/missing≠zero; no inferred rights or FX.
- [x] Integrate the strict original MarketReferenceTotal into the current dashboard; default-empty production policy remains unavailable. Preserve private current dashboard progress and legacy-money semantics.

### Task 5: Final local/CI proof and one prerequisite review

- [x] Capture actual bounded synthetic PostgreSQL plans/counts and allowed FILTER/aggregate execution, Phase06 regression, default-OFF composition and zero fetch calls; no speculative index migration.
- [x] Add actual native CI tests, operational capability/limits documentation; run relevant regular/types/lint/build/browsers after focused gates.
- [x] One fresh whole-prerequisite review followed by one consolidated root correction; preserve all proof workspaces and original migration bytes. Existing DraftPR push/readback and exact CI only; no fullPhase07 acceptance until other prerequisites close.
