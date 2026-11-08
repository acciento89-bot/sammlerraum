### Task 2: Strict scoped query contracts and field-aware compiler

**Files:** Create contracts/scoped-search.ts, domain/search/scoped-search-service.ts and scoped compiler/transport tests; reuse original AST/typed money/cursor utilities with explicit scoped adapters.

- [ ] TDD common text/basic predicates and permitted price/media fields; whole-tree denied fields, empty targets, exact subtree/item boundaries, hidden reference probes and missing/zero/NOT/OR parity.
- [ ] Implement strict scope target/query parsing, ID-based bound cursor, allowed row projection and same-snapshot rows/counts. Resolve money only in the exact current authorized target and actual field grants. No N+1 or fallback.
- [ ] Run real native queries and original owned/money/duplicate regression; record bounded query calls and commit.

