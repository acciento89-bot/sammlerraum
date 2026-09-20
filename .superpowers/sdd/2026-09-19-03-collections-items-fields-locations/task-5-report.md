# Task 5 implementer report

## Scope implemented

Task 5 adds owner-scoped hierarchical storage locations and item movement history through:

- additive `StorageLocation` and `ItemLocationHistory` models plus the
  `20260920233000_storage_locations` migration;
- a denormalized, migration-backfilled `CollectibleItem.ownerId` used only to make ownership a
  database-enforced composite-key boundary for current locations and history;
- `createLocationService(database, trustedActorUserId)` with `createLocation`, `moveLocation`,
  `assignItemLocation`, and `getLocationContents`;
- `createItemQuery(database).getPublicItem(itemId)`, the minimal Task 6-ready public projection
  required by the privacy preflight ruling;
- Zod contracts and package exports for locations, histories, contents, and the public item DTO;
- focused unit tests, gated PostgreSQL tests, and the location test file in the CI PostgreSQL gate.

No label rendering, token scan route, location UI, public route, SEO behavior, or collaboration
role handling was added.

## Canonical storage and ownership decisions

Locations are scoped to an owner rather than a collection. This lets one physical room, cabinet,
or box contain items from any collection belonging to the same owner. `StorageLocation.ownerId`
is authoritative. Composite keys enforce this boundary for parent links, current item locations,
and both history endpoints.

The migration adds `CollectibleItem.ownerId`, backfills every existing row from its collection,
makes it required, and changes the collection relation to `(collectionId, ownerId)`. New and split
items persist the trusted actor/owner ID. Existing direct Prisma integration fixtures were updated
with their already-known owner ID. This is supporting work required by the new composite foreign
keys; published migrations through `20260920223000_custom_fields` were not changed.

Location types are the closed V1 set `ROOM`, `CABINET`, `SHELF`, `DRAWER`, `BOX`, and `OTHER`.
Names are trimmed, bounded to 120 characters, and reject control characters at the contract and
database levels. Locations default to `PRIVATE`.

Each location receives two stable identifiers at creation: a database-generated UUID and an
independent 256-bit cryptographically random base64url `qrToken` (43 characters). The token is
unique and constrained in PostgreSQL. Token possession grants no authorization; there is no
public token/content resolver in this task.

## Service contracts

`createLocation(input)` accepts `{ parentId?, name, type?, visibility? }`, defaults to a root,
`OTHER`, and `PRIVATE`, and returns the private `StorageLocation` DTO including its label token.
The trusted actor must own the optional parent.

`moveLocation(locationId, parentId | null)` moves an owned location. It serializes all hierarchy
mutations for one owner by locking that owner's `user` row in a short `ReadCommitted` transaction,
reloads the source and parent after that lock, traverses the complete descendant graph, and rejects
self/descendant cycles. A foreign source or parent is returned as `LOCATION_NOT_FOUND`. Concurrent
inverse moves therefore cannot both commit.

`assignItemLocation(itemId, locationId | null)` supports initial assignment, movement, and
unassignment. It locks the actor-owned item, validates the target against the same authoritative
owner, updates `CollectibleItem.storageLocationId`, and appends `ItemLocationHistory` in one short
transaction. Missing and foreign items are indistinguishable as `ITEM_NOT_FOUND`; missing and
foreign locations are indistinguishable as `LOCATION_NOT_FOUND`. A null-to-null no-op is rejected
as `ITEM_LOCATION_UNCHANGED` because the database history invariant requires at least one endpoint.

`getLocationContents(locationId)` is an owner-only query returning the location, its direct child
locations, and directly assigned items (`id`, `collectionId`, `title`, `quantity`). It is not a
public metadata endpoint. Location names, IDs, tokens, hierarchy, item assignment, and movement
history remain protected.

## Public item privacy and Task 6 handoff

`createItemQuery(database).getPublicItem(itemId)` performs one recursive PostgreSQL query for the
item, collection visibility, and complete collection-node ancestry. It constructs trusted policy
facts and authorizes the anonymous `item.view` action. It fails closed when the item is private or
unlisted, the collection is private or unlisted, any node ancestor is private or unlisted, the
ancestry cycles, an expected node is missing, the chain does not reach a root, or the item is
archived/disposed. All absent and non-public cases return the same `ITEM_NOT_FOUND` code.

The returned DTO is an explicit whitelist: `id`, `title`, `publicDescription`, `quantity`, and
`tradeStatus`. It cannot include private notes, location IDs/names, QR tokens, movement history,
purchase/acquisition amounts, insurance data, protected documents, or later private fields. Task 6
should reuse this query for a public item route rather than selecting a Prisma item model directly.
SEO/indexability remains a separate later decision and must not widen this authorization check.

## Task 7 and Task 8 handoff

Task 7 management UI can consume the four service methods above through authenticated server
adapters. It should treat the actor ID as trusted session context and must not accept an owner ID or
role from request input. Collaboration roles remain Phase 09 work.

Task 8 label creation should use the stored `qrToken` without rotating it and form the scan URL
from that token. A token resolver may return only the location ID. Viewing contents must still go
through an actor-authorized private service boundary; the token alone must never call or bypass
`getLocationContents`. Printable output should use the location name and a suitable short internal
code, without item values, notes, history, or other protected data.

## TDD and verification evidence

The initial test was written before production code. After restoring dependencies with the
approved pinned Corepack command and regenerating the existing Prisma client, the focused RED was:

```text
corepack pnpm@10.17.1 vitest run packages/domain/src/locations/location-service.test.ts
FAIL: Cannot find module '../items/item-query'
```

The earlier accidental bare `pnpm` attempt invoked the Work runtime wrapper, purged `node_modules`,
and stopped at its minimum-release-age policy. No policy was bypassed and the lockfile was not
changed. Dependencies were restored with
`CI=true corepack pnpm@10.17.1 install --frozen-lockfile`.

Fresh local evidence after implementation:

- focused location test: 12 unit tests passed, 3 PostgreSQL tests skipped without the integration
  gate;
- focused location/item/custom-field/identifier regression set: 64 passed, 10 database-gated
  tests skipped;
- full `corepack pnpm@10.17.1 test`: 201 passed, 19 expected integration skips;
- full `corepack pnpm@10.17.1 lint`: passed;
- full `corepack pnpm@10.17.1 typecheck`: passed;
- Prisma schema validation and client generation: passed;
- offline Prisma empty-to-schema SQL generation: passed and contains all new composite keys,
  indexes, models, and relations;
- `git diff --check`: passed.

One required `prisma migrate dev --name storage_locations` attempt was made against the documented
local test URL and stopped with a schema-engine connection error because no local PostgreSQL server
is available. The migration is additive and includes an existing-row backfill. The three gated
PostgreSQL tests cover real recursive cycle detection and concurrent inverse moves; service and raw
foreign-key ownership boundaries; transaction rollback when history insertion fails; current FK
plus history persistence; and positive/negative full-ancestry public projections. Applying the
migration and running those actual-PostgreSQL tests remains the controller CI gate.
