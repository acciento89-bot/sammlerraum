# Task 3 fix review

Reviewed `f5fea02ba4afceb6acb5940fb3069f663443918d..897ebe64940d574e0cc10c36fc0076655f790df6`, limited to the five round-one findings and regressions introduced by their fixes.

## Finding disposition

1. **Tag lock ordering — ADDRESSED.** `tag-service.ts:114-145` sorts normalized tag names before upsert, then reconstructs results and join rows in caller order. The new gated PostgreSQL test covers reverse-order overlapping tag sets. Its actual-PostgreSQL result remains a controller gate.
2. **NUL validation and sentinel keys — ADDRESSED.** `identifier-service.ts:65-105,152-171` and `tag-service.ts:55-66` reject U+0000 before opening a transaction. Identifier deduplication and lookup no longer use a NUL-delimited composite key.
3. **Misnamed exported `ItemTag` type — ADDRESSED.** The tag entity is now exported as `StoredTag`; repository search finds no stale service-type consumers.
4. **Duplicate permanent CI commands — ADDRESSED.** `.github/workflows/ci.yml:62-64` retains migration plus the full suite, while the redundant focused and item-directory steps are removed. The explicit real-database invocation remains.
5. **Fixture cleanup registration — ADDRESSED.** `identifier-service.test.ts:238-254,257-347,423-477` records each owner immediately after creation and performs all setup inside `try/finally` cleanup.

## New fix-diff finding

**MINOR — identifier result order regressed.** `packages/domain/src/items/identifier-service.ts:97-105` now groups identifiers in a map by type and then flattens type groups. Interleaved input such as `EAN A`, `ISBN B`, `EAN C` is returned and inserted as `EAN A`, `EAN C`, `ISBN B`; the prior collision-prone flat map still preserved caller order. The later `identifiers.map(...)` reconstruction shows that stable caller order is intended, and the tag fix explicitly preserves it. Keep a collision-proof key while retaining one global insertion-ordered collection (for example, `JSON.stringify([type, normalizedValue])`), or track ordered tuple references alongside the nested map. Add an interleaved-type regression test.

## Verdicts

- **SPEC: PASS.** The Task 3 contract and global ownership/privacy/transaction constraints remain satisfied.
- **QUALITY: FAIL.** All five original findings are addressed, but the identifier-order regression requires a fix.

Reported verification is accepted without rerun: three intended RED failures, then 7 focused unit passes with 3 database skips, 16 item unit passes with 6 database skips, lint, typecheck, and diff check. Actual PostgreSQL concurrency and final full CI remain controller gates.
