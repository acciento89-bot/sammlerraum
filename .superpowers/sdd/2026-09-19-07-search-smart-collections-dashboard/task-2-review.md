# Phase07 Task2A independent task review

## Spec compliance

- ❌ Issues found: the available-family milestone implements the approved owned-search interface and most of the adjudicated query/wire contract, but does not consistently reject malformed relevant retained facts. I1 and I2 below violate P7.5 and the preparation's typed-integrity contract.
- Reviewed exact source range `4b4dce2d0eefc5d4ec85139efbbf2de71d50dd6d..b57c9a371a566030eac31d74c0c7df3de85dc83b`. Read all 3,092 lines of the supplied 24-file diff once in sequential bounded chunks. No changed source was reread outside that diff; a later mechanical pass obtained source line numbers only.
- Scope is the explicitly approved Task2A owned available-family milestone. The original Task2, shared search, legacy monetary ranges, market eligibility, duplicates/wishlist, Smart Collections, and dashboard integration remain open; their deferral is not itself a finding against this milestone. `docs/search/owned-item-search.md:17` accurately states the partial status.
- ⚠️ Cannot verify from this diff: inherited Task1 parser depth/clause limits and producer identity normalization, the complete existing authorization/storage invariants, deployment collation availability outside the reported local run, and exact remote CI. Root should retain the existing Task1 approval and complete the source-specific remote CI gate. Smart Collection row uniqueness and dashboard currency/source separation require their later implementation reviews; no implementation of those consumers appears here.

## Strengths

- `packages/domain/src/search/search-compiler.ts:81` and `packages/domain/src/search/item-search-service.ts:73` establish one independently owned/live-parent/lifecycle relation reused by count and page queries. Relation predicates use EXISTS instead of multiplying item rows. The native ownership/count fixture at `packages/domain/src/search/item-search-service.test.ts:362` covers both inaccessible private and public inventory.
- `packages/domain/src/search/search-compiler.ts:284` validates all selected references before Boolean matching; `packages/domain/src/search/item-search-service.ts:56` checks whole-tree availability before querying. The diff includes native NOT/OR/no-match reference and unavailable-family cases.
- `packages/domain/src/search/search-read.ts:13` has explicit RepeatableRead, remaining processing budgets, post-await checks, and a maximum of three recognized serialization attempts. `packages/domain/src/search/search-read.integration.test.ts:33` tests actual installed-driver timeout mapping; the native fixtures also exercise lock, acquisition, and serialization failures. Snapshot behavior is exercised at `packages/domain/src/search/item-search-service.test.ts:709` and the later concurrent-edit matrix.
- `packages/domain/src/search/item-search-service.ts:90`, `packages/domain/src/search/search-cursor.ts:46`, and `apps/web/src/lib/item-search-routes.ts:24` provide a strict summary whitelist, checked total/cursor handling, and bounded raw-query decoding. The route uses fresh authentication and closed error projection rather than forwarding database or validation details.
- `packages/domain/src/search/search-compiler.ts:189` selects the latest manual value before denomination/range filtering; native tests cover bigint boundaries, ties, zero, and per-unit behavior. Catalog numeric/date casts are protected by CASE in `packages/domain/src/search/search-typed-guards.ts:29`.

## Issues

### Critical

- None.

### Important

**I1 — Broad text bypasses retained custom-text integrity.** `packages/domain/src/search/search-text.ts:8`, `packages/domain/src/search/search-text.ts:25`, `packages/domain/src/search/item-search-service.ts:69`.

`invalidBroadFacts` checks only catalog values, while `compileBroadText` also reads custom SHORT_TEXT/LONG_TEXT. With no typed filter, `invalidFacts(nodes)` is false. A retained custom value such as fullwidth `Ｗａｔｃｈ` passes the native text shape/length constraint but is not a valid producer-normalized stored value. Broad `text=watch` normalizes and matches that value, returning the item instead of `SEARCH_INVARIANT`. The same value is correctly rejected when its custom definition is explicitly filtered, so integrity depends on which query path touches the fact. Add the corresponding scoped custom text integrity checks to the broad-text guard, over the independently owned outer relation, and native regressions with no typed leaf and with an otherwise nonmatching text/Boolean clause.

**I2 — Typed integrity checks accept invalid URL and noncanonical whitespace facts.** `packages/domain/src/search/search-typed-guards.ts:10`, `packages/domain/src/search/search-typed-guards.ts:12`, `packages/domain/src/search/search-typed-guards.ts:39`.

The URL catalog regex accepts credential-bearing strings such as `https://user:pass@example.invalid/`; its first host-like group excludes `@`, but the following unrestricted nonwhitespace group accepts it. Native URL values receive the default `TRUE` guard, and their existing SQL constraint only requires an HTTP(S) prefix. Consequently a relevant invalid native or catalog URL can satisfy `present`/`NOT missing` instead of closing with an invariant error. Separately, text equality against `normalize(btrim(value),NFKC)` accepts leading/trailing tabs and line breaks because default PostgreSQL `btrim` removes ordinary spaces, whereas the producer uses JavaScript `.trim()`. Those retained values are noncanonical but also pass the added integrity checks.

The focused unchanged producer/constraint check confirms these are actual contract mismatches: `packages/domain/src/custom-fields/custom-field-service.ts:139` normalizes with NFKC plus JavaScript trim, and `:174` parses URLs and rejects credentials; `packages/db/prisma/migrations/20260920223000_custom_fields/migration.sql:70` protects native typed shape/ranges but does not enforce these URL/canonical-text rules. Make the SQL guards enforce the approved relevant stored-value validity rather than approximate it, and add native custom/catalog URL and whitespace regressions under presence and NOT with no matching candidates. Preserve CASE-protected conversions and the existing bounded boolean-only integrity query.

### Minor

- None.

## Checks and limits

- Requirements read: task brief, execution context, context rulings, and the referenced query preparation; claims read: task implementation report. The explicit later Task2A approval supersedes the preparation-only/no-source-GO wording in the earlier context.
- One focused unchanged-code check for the concrete risk that the new integrity guards assume stronger producer/native storage guarantees than actually exist: read the custom-field normalization/URL validation functions and the custom-field migration constraints. No broader repository crawl or changed-source reread was performed.
- No tests rerun, database access/mutation, source/index/HEAD mutation, agents, or secondary reviewers. Both findings follow directly from the changed SQL predicates and the focused unchanged producer/constraint evidence; they do not require rerunning the already reported suites to establish the gap.
- Reviewed reported frozen evidence: 769 regular passes / 348 DB skips; 43 native files / 457 passes / zero skips, including 95 new native cases and 37 unchanged valuation regressions; recovered types, lint, and production build pass. Searched the five final successful gate logs for warning/stderr/deprecation markers; none were present. Original generated-cache typecheck failure and recovery are explicitly disclosed in the report and are not hidden as a passing initial run.

## Assessment

**Task quality: Needs fixes.** The implementation is well separated and the native validation is substantial, with strong authorization, snapshot, cursor, and deadline behavior. Two retained-fact integrity gaps remain against an explicit acceptance requirement; repair and focused native evidence are needed before approving this milestone.

**Counts:** Critical 0 / Important 2 / Minor 0.
