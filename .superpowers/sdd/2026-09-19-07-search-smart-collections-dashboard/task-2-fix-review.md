# Task2A fix round 1 scoped re-review

## Finding verdicts

- **I1 — Broad text bypasses retained custom-text integrity. — ADDRESSED.** `packages/domain/src/search/search-text.ts:8` now includes native custom SHORT_TEXT/LONG_TEXT integrity using the same guards as typed predicates, correlated by item and collection. The existing independently owned/live/lifecycle outer relation still surrounds that guard before text/AST matching. Native regressions at `packages/domain/src/search/search-retained-integrity.integration.test.ts:177` exercise non-NFKC native text with no typed leaf, nonmatching text, and an otherwise-false visibility predicate; `:190` exercises boundary whitespace through broad and typed queries. The foreign native corruption fixture is excluded by the owned relation.

- **I2 — Typed integrity checks accept invalid URL and noncanonical whitespace facts. — ADDRESSED.** `packages/domain/src/search/search-typed-guards.ts:7` specifies the complete ECMAScript trim set; `:12` applies NFKC first, then that trim set, and compares using C collation. `:10` adds supplementary-codepoint count to PostgreSQL character count to preserve the producer's UTF-16 limits. Native tests at `packages/domain/src/search/search-retained-integrity.integration.test.ts:190` and `:214` compare against the actual unchanged producer for all trim characters, supplementary boundaries, and legitimate non-trim/internal Unicode whitespace.

  URL final validity now uses `validateFieldValue("URL", value) === value` at `packages/domain/src/search/search-url-integrity.ts:75`, rather than claiming parser equivalence from a SQL regex. The helper runs before matching at `packages/domain/src/search/item-search-service.ts:82`, after the existing boolean shape/size guard. Native tests at `packages/domain/src/search/search-retained-integrity.integration.test.ts:260` reject credentials, malformed hosts/ports, and noncanonical serialization under presence/NOT/nonmatching predicates. Tests at `:291` retain valid IPv6, path/query/fragment @, percent escapes, and punycode; `:538` proves oversized UTF-16 URL facts fail before manifest transfer.

## Fix scope and P7.13 checks

- Reviewed exact fix range `52dfd875270da103c63313d7a93480e93bb4ff4b..3d52a5cefdbc66e5cc7dea68f18bbdbb688b809f`. Read all 1,066 lines of the supplied nine-file fix diff once in three bounded chunks. A later mechanical pass obtained source line numbers only. The scope is the two prior findings, binding fix context/P7.13, and breakage introduced by this fix; this is not a fresh review of untouched code.
- `packages/domain/src/search/search-url-integrity.ts:18` selects only requested URL definitions/targets. `:37` uses the existing authorized candidate and exact catalog builders, bound selectors, and same transaction. Only distinct URL strings and count/byte metadata cross the internal seam; item inventories/IDs and unrelated variants are not materialized.
- `packages/domain/src/search/search-url-integrity.ts:50` uses a materialized C-collation DISTINCT manifest with a 4,097 sentinel. The SQL projection returns NULL values when count exceeds 4,096 or UTF-8 bytes exceed 8 MiB. The code distinguishes overflow (`SEARCH_UNAVAILABLE`) from malformed retained values (`SEARCH_INVARIANT`). Native proof at `packages/domain/src/search/search-retained-integrity.integration.test.ts:348` covers 4,097 distinct values, exact 4,096/8 MiB acceptance, byte-cap-plus-one rejection without values or count/page, and thousands of rows sharing one distinct value.
- `packages/domain/src/search/search-retained-integrity.integration.test.ts:436` proves snapshot continuity across edits after integrity and after manifest reads. `:472` exercises exact custom/catalog selector union, repeated selectors, selected versus unselected variants, and distinct-value deduplication.
- `packages/domain/src/search/search-read.ts:6` adds only the narrow bounded transaction interface. Budget checks before/after the manifest and around each producer call appear at `packages/domain/src/search/search-url-integrity.ts:46`, `:58`, `:72`, and `:79`. `packages/domain/src/search/search-url-integrity.test.ts:36` verifies expiry before read, after read, and during parsing. `:26` proves no URL leaf causes neither a manifest read nor producer parsing; `:77` verifies closed driver-error projection.
- No producer, schema, route/wire, unavailable-family, or valuation-classifier change appears in this fix. The new native suite is in the CI database allowlist, and `docs/search/owned-item-search.md:9` documents the explicitly approved manifest limits and producer-validation behavior.

## New breakage in the fix diff

- Critical: None.
- Important: None.
- Minor: None.

## Out-of-scope observations

- None.

## Evidence checked

- Read the appended fix report and binding `task-2-fix1-context.md`; prior task requirements and original findings remain the baseline. The report explicitly preserves RED failures and does not claim earlier CI or the original 457-test native run validates this corrected source.
- Confirmed stored final output: 774 regular passes / 365 DB skips; six relevant native files / 149 passes / zero skips; focused retained-integrity and budget run 22 passes (17 native + 5 regular). The final gate record reports exit 0 for regular, types, lint, production build, and relevant native commands. Searched all five successful final logs for warning/stderr/deprecation markers; none were present.
- No suites or focused probes rerun, no DB access/mutation, no changed-source reread outside the fix diff, no source/index/HEAD writes, and no agents or additional reviewers. Only this review report was written. Root's frozen-hash verification and upcoming exact corrected-source CI remain separate controller evidence.

## Verdict

**Fix round: All findings addressed, no new Critical/Important breakage.**

**SPEC: ✅ for the scoped Task2A fix. QUALITY: Approved.** I1 and I2 are closed. Original full Task2 remains partial and the count remains unchanged; this approval does not complete later producer/integration gates or replace exact remote CI.

**Counts:** Prior findings addressed 2 / open 0. New Critical 0 / Important 0 / Minor 0.
