### Task 1: Native current-owned duplicate predicate

**Files:** Create packages/domain/src/search/duplicate-filter.ts and duplicate-filter.integration.test.ts. Modify search-compiler.ts and filter-ast.ts; adjust existing filter-ast.test.ts and item-search-service.test.ts only where obsolete unsupported-duplicate assertions become actual supported behavior.

- [ ] Write and run failing real producer/native tests for true/false and NOT/OR, symmetric endpoints, no similarity/quantity heuristic, foreign/dead-parent exclusion, archived/disposed partner and candidate lifecycle, unmark and actual ownership transfer/retirement.
- [ ] Implement one fixed-alias parameterized EXISTS using current owned/live endpoints and parents, reuse existing outer predicates; remove only duplicate's old unsupported gate. Preserve money/market gates and strict parsing.
- [ ] Run affected native/pure cohorts and types; record actual results and commit.

