# Task 3 implementer report

## Scope

Implemented structured item identifiers and owner-scoped tags through:

- additive `ItemIdentifier`, `Tag`, and `ItemTag` Prisma models and migration;
- `createIdentifierService(database, actorUserId).setItemIdentifiers(itemId, inputs)`;
- `createTagService(database, actorUserId).setItemTags(itemId, names)`;
- domain package exports and focused unit plus gated PostgreSQL coverage.

Identifier normalization applies NFKC, trims and collapses whitespace, uppercases identifier
types and general normalized values, and removes whitespace/hyphens from normalized
EAN/UPC/ISBN values without removing leading zeroes. Tag normalization applies NFKC, trims and
collapses whitespace, retains the first display spelling, and uses a lowercase owner-scoped
normalized name.

Both services validate before persistence, lock the item through its actor-owned collection in a
short `ReadCommitted` transaction, and replace metadata atomically. Missing and foreign items
share the safe `ITEM_NOT_FOUND` result. Identifier uniqueness is scoped to
`(itemId, type, normalizedValue)`; tag uniqueness is scoped to
`(ownerId, normalizedName)`.

## TDD and verification evidence

- Initial RED: GitHub Actions run 35531276807, job 106132190916 failed the exact focused command
  because `identifier-service.ts` did not exist.
- Initial GREEN candidate: GitHub Actions run 35532256179 passed 151 unit tests, 48 integration
  tests including 14 actual-database tests, 4 browser tests, build, and both Docker builds.
- Review-fix RED: local focused run failed three intended cases: identifier NUL validation, tag
  NUL validation, and canonical tag acquisition order.
- Review-fix focused GREEN: local focused run passed 7 unit tests with 3 gated PostgreSQL tests
  skipped because no local database gate was enabled.
- Review-fix item GREEN: local item-directory run passed 16 unit tests with 6 gated PostgreSQL
  tests skipped.
- Local `pnpm lint` and `pnpm typecheck` both exited 0 after the fixes.

The controller owns the final actual-PostgreSQL and full CI gate.

## Review round 1 fixes

1. Tag rows are upserted in deterministic `normalizedName` order to prevent reverse overlapping
   lists on disjoint item locks from deadlocking. Results and join rows still follow caller order.
   A gated PostgreSQL test coordinates both transactions after their first upsert, with a bounded
   fallback when canonical ordering blocks the second transaction on the same first row. The old
   reverse ordering therefore reaches the opposing second locks, while the fixed ordering
   serializes without deadlocking the test barrier itself.
2. Identifier types/values and tag names containing U+0000 now fail with
   `IDENTIFIERS_INVALID` or `TAGS_INVALID` before a database transaction opens.
3. Identifier deduplication and saved-row lookup use nested maps keyed by type then normalized
   value, removing sentinel-string tuple encoding.
4. The exported tag entity type is named `StoredTag`; it no longer conflicts conceptually with
   Prisma's `ItemTag` join model.
5. Permanent duplicate focused/item CI steps were removed. The full unit suite and explicit real
   PostgreSQL identifier/tag integration invocation remain.
6. PostgreSQL fixtures register owner cleanup immediately after user creation, and setup now runs
   inside `try/finally`, so partial setup failures are cleaned up.

## Change controls

- No dependency changes.
- No published migration rewrites.
- No commits, ref updates, or ledger/checkoff edits by the implementer.

## Review round 2 fix

The first collision-proof nested-map implementation flattened identifiers by type, which changed
global caller order for interleaved inputs. A new regression test uses
`EAN 001, ISBN ISBN-2, EAN 003` and asserts the same order in the service result.

- RED: the focused test run failed only the new ordering case, returning
  `EAN 001, EAN 003, ISBN ISBN-2`.
- GREEN: the focused run passed 8 unit tests with 3 PostgreSQL-gated tests skipped.
- Verification: local `pnpm lint` and `pnpm typecheck` both exited 0.

The parser now keeps an ordered identifier array plus nested
`type -> normalizedValue -> first position` maps. This retains collision-proof tuple membership,
preserves global first-seen caller order, and keeps the prior behavior where a duplicate tuple
replaces its display value at its original position.
