# Task 5 review

Reviewed `f25543632641cded8b86587124127e527bdf21a7..e3e463e5df5a5f8efa48938326ed29198c026ba7` against the Task 5 brief and design sections 6 and 20, limited to storage-location hierarchy, ownership, QR identity, item assignment/history, public projection, migration, and focused tests.

## Findings

1. **IMPORTANT — the required PostgreSQL gate is red because assignment history prevents fixture cleanup.** `packages/db/prisma/migrations/20260920233000_storage_locations/migration.sql:85-86` (mirrored at `packages/db/prisma/schema.prisma:193`) makes `ItemLocationHistory.assignedById` `ON DELETE RESTRICT`, while `packages/domain/src/locations/location-service.test.ts:421-423` deletes the owner after creating history without first deleting that history. Controller CI run `35535617557`, job `106143995526`, therefore failed at line 422 with Prisma `P2003` on `ItemLocationHistory_assignedById_fkey` (102 passed, 1 failed). If assignee retention is intentional, keep the product FK and make teardown delete history before users; if user deletion is intended product behavior, define that lifecycle with a new additive migration rather than rewriting the published migration.
2. **IMPORTANT — assigning an item to its existing non-null location appends a false movement record.** `packages/domain/src/locations/location-service.ts:258-277` rejects only `null -> null`. For `X -> X` it updates the unchanged FK and inserts history with identical `fromLocationId` and `toLocationId`, even though design section 20 describes history of location changes and the service already exposes `ITEM_LOCATION_UNCHANGED`. Compare the locked current value with the requested value for every location, reject equality, and cover the non-null case so retries cannot corrupt the audit trail.
3. **MINOR — the advertised movement and unassignment history paths lack focused coverage.** The unit and PostgreSQL cases at `packages/domain/src/locations/location-service.test.ts:87-159` and `344-424` exercise only initial `null -> location` assignment. Add at least one real transition `A -> B` and one unassignment `A -> null`, asserting both the current FK and both history endpoints. This also protects the composite `fromLocationId` FK and the endpoint check, which the current positive tests do not exercise.

## Assessment

The remaining scoped implementation is sound. Locations form an owner-scoped adjacency tree, default to private, and use a stable random 256-bit base64url token whose possession grants no access. Composite foreign keys bind item-to-collection ownership, location parents, current item locations, and history endpoints. Owner-row serialization makes concurrent hierarchy mutations cycle-safe, and assignment updates the current FK plus history in one transaction. The migration is additive and backfills existing item owners without modifying earlier migrations.

`getPublicItem` fails closed for private or unlisted items/collections/nodes, incomplete ancestry, cycles, archived items, and disposed items. Its explicit DTO whitelist contains only `id`, `title`, `publicDescription`, `quantity`, and `tradeStatus`; it cannot expose private notes, location identity or hierarchy, QR tokens, movement history, purchase/insurance data, or protected documents. No public route or token bearer authorization was introduced.

## Verdicts

- **SPEC: FAIL.** The hierarchy, ownership, privacy, projection, and transaction requirements are met, but `X -> X` is recorded as a location movement and makes history inaccurate.
- **QUALITY: FAIL.** The live PostgreSQL gate fails during the new test's teardown, and the move/unassign branches of the atomic history contract are not covered.

Reported local evidence is accepted without rerun: the missing-item-query RED, 201 unit passes with 19 database skips, the focused 21 passes with 6 skips, lint, typecheck, Prisma validation/generation, and migration checks. Controller PostgreSQL migration/build checks passed, but the database test job remains red at the cleanup failure above.
