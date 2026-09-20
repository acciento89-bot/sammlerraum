# Phase 03 Task 6 report — collection/item REST APIs and policy enforcement

## Status

Independent review found two P2 defects; both now have observed RED→GREEN regressions and fixes in
the local candidate. The required local tests, lint, typecheck, Prisma generation/schema formatting
and web production build pass. The extended real PostgreSQL route/service integration test is
registered in CI and intentionally skipped locally because this workspace has no PostgreSQL service.
Task completion still requires scoped rereview and the migrated PostgreSQL CI gate to pass.

No ledger, task checkbox, commit, push, provider, or live-environment action was performed by this
implementer.

## Canonical HTTP interface

All handlers use the shared `apiRoute` error/request-ID wrapper and successful responses set
`Cache-Control: no-store`. Every mutation requires an exact `Origin` match. Authentication comes
only from a fresh Better Auth session lookup with cookie caching and refresh disabled; request bodies
cannot supply actor IDs, owner IDs, roles, or policy facts.

### Collections and hierarchy

- `GET /api/v1/collections` — anonymous callers receive public, non-deleted root collection DTOs;
  authenticated callers receive only their non-deleted collections.
- `POST /api/v1/collections` — authenticated collection creation.
- `GET /api/v1/collections/{collectionId}` — public root DTO or the owner's DTO; no nodes, item
  counts, notes, locations, or other private aggregates.
- `PATCH /api/v1/collections/{collectionId}` — owner update of `name` and/or `visibility`.
- `DELETE /api/v1/collections/{collectionId}` — owner-only reversible soft delete; returns 204 and
  retains every child node/item row.
- `GET|POST /api/v1/collections/{collectionId}/nodes` — owner-scoped node listing/creation.
- `PATCH /api/v1/collections/{collectionId}/nodes/{nodeId}` — owner-scoped atomic name,
  visibility, and/or parent update with root locking, descendant-cycle validation, and nested path
  identity verification.
- `GET|POST /api/v1/collections/{collectionId}/custom-fields` — owner-scoped definition/option
  listing and definition creation.

### Items and attached data

- `GET /api/v1/items?collectionId={collectionId}` — owner-scoped list of non-deleted items in one
  owned, non-deleted collection.
- `POST /api/v1/items` — owner-scoped creation through the existing item service.
- `GET /api/v1/items/{itemId}` — anonymous and authenticated non-owner reads return only the
  authoritative `createItemQuery().getPublicItem()` whitelist (`id`, `title`,
  `publicDescription`, `quantity`, `tradeStatus`). Owner reads return the private item DTO plus
  identifiers, tag labels, canonical custom-field values, and current private location metadata.
- `PATCH /api/v1/items/{itemId}` — owner-scoped item update.
- `DELETE /api/v1/items/{itemId}` — owner-only reversible soft delete; returns 204.
- `POST /api/v1/items/{itemId}/archive` — existing independent archive lifecycle.
- `POST /api/v1/items/{itemId}/split` — existing transactional quantity split.
- `PUT /api/v1/items/{itemId}/identifiers` — atomic identifier replacement.
- `PUT /api/v1/items/{itemId}/tags` — atomic tag replacement.
- `PUT /api/v1/items/{itemId}/custom-fields/{fieldId}` — typed field set; `null` clears the value.
- `PUT /api/v1/items/{itemId}/location` — private owner-only location assignment/history write.

### Locations

- `GET|POST /api/v1/locations` — owner-only location-tree listing/creation.
- `GET /api/v1/locations/{locationId}` — owner-only direct contents.
- `PATCH /api/v1/locations/{locationId}` — owner-only cycle-safe move.

There is no public location or QR-token API in this task. A location's `PUBLIC` visibility value and
stable QR token do not grant access; Task 8 owns label/scan rendering.

## Authorization and privacy

- Trusted actor facts are constructed only from Better Auth session results.
- Collection, node, and item facts are loaded from the database. Node/item loaders traverse the
  complete ancestry, reject missing/corrupt chains, exclude soft-deleted items/collections, and use
  the existing trusted fact constructors.
- Routes call `assertAuthorized` with a resource-kind-matching action. The policy now has explicit
  owner-only `collection.delete` and `item.delete` actions. Existing edit actions remain owner-only
  in this phase because loaders intentionally provide no membership role; Phase 09 can add
  authoritative membership facts.
- Anonymous item reads use the existing public projection, which independently builds trusted facts
  and checks the full collection/node visibility chain. Authenticated non-owners must pass the same
  policy and still receive that exact public projection.
- PRIVATE or UNLISTED resources/ancestors, inactive public items, deleted resources/collections,
  malformed ancestry, and foreign private IDs are returned as non-disclosing 404 responses.
- No request-supplied moderation or membership facts are accepted. Current schema has no persisted
  moderation record for these resource kinds, so loaders supply the existing `VISIBLE` default.

## Soft-delete lifecycle

Additive migration `20260920234500_collection_item_soft_delete` adds nullable `deletedAt` fields and
owner/collection lifecycle indexes. The migration matches the generated schema diff exactly; all
published migrations through `20260920233000_storage_locations` remain unchanged.

Collection/item reads, the authoritative public item query, collection/item writes, hierarchy
writes, custom-field writes, identifier/tag replacement, item-location assignment, contents lists,
and owner metadata reads all exclude deleted resources or a deleted collection. Collection deletion
does not cascade or hard-delete contents. Restore/audit/conflict UI remains in Phase 09 and will reuse
this state.

## TDD and verification evidence

Actual Task 6 RED before implementation:

- `corepack pnpm@10.17.1 vitest run apps/web/src/app/api/v1/items/item-api.test.ts`
- Failed because the requested real Request/Response handler factory did not exist.

Initial GREEN:

- The same focused command passed 1/1 after the authoritative public-query route was implemented.

Additional policy RED→GREEN:

- `corepack pnpm@10.17.1 vitest run packages/domain/src/authz/policy.test.ts`
- RED: `collection.delete` returned `NO_POLICY`.
- GREEN: 24/24 passed after explicit owner-only collection/item deletion actions were added.

Independent-review fixes RED→GREEN:

- F1 RED: owner metadata serialized a valid Prisma Decimal `0.0000001` as rejected exponent form
  `1e-7`; the numeric(38,18) precision-limit case remained ordinary notation. GREEN: stored Decimal
  values use exact `toFixed()` output and then the existing canonical DECIMAL validator, without a
  JavaScript Number conversion. Focused tiny and precision-limit round trips pass 2/2.
- F2 RED: NUL-containing collection/node names passed route validation and returned 201 with the
  mocked writer; NUL-containing item title/public description/private notes passed validation and
  proceeded to a 500 in the focused boundary setup. GREEN: the five requests return the standard
  400 validation envelope with request ID and no-store, no writer is called, item-create requests
  also stop before the collection loader, and legitimate description/note newlines still persist
  unchanged.
- Combined focused GREEN command: 17/17 passed across resource-query and collection/item HTTP tests.

Final local evidence:

- Required expanded domain/API scope after review fixes: 93 passed, 15 database-gated skips.
- Pre-review full unit/static suite: 213 passed, 20 database-gated skips; review fixes were then
  covered by the required expanded task scope above.
- `corepack pnpm@10.17.1 lint` — pass.
- `corepack pnpm@10.17.1 typecheck` — pass.
- Prisma generate/format and pre-task-schema-to-current-schema diff — pass; diff contains exactly two
  nullable columns and two indexes.
- `corepack pnpm@10.17.1 --filter @sammlerraum/web build` with documented fake build-only
  environment — pass; Next discovered all collection/item/custom-field/location routes.
- `git diff --check` — pass.

The CI-gated PostgreSQL test uses real route handlers, resource loaders, policy facts, and domain
services to verify PRIVATE and UNLISTED ancestor 404 behavior, owner-only private fields, item soft
deletion, retained collection contents, collection soft deletion, and prevention of direct service
bypass after deletion. It now also writes, reads, and resubmits tiny and numeric(38,18)-limit DECIMAL
values through the real custom-field service and owner GET handler. `.github/workflows/ci.yml` runs
it with `RUN_DATABASE_INTEGRATION=1` after migrations are deployed.

## Implementer self-review findings resolved

- Node PATCH originally moved and updated metadata in separate transactions. It now performs both in
  one root-locked transaction and validates descendant cycles before the write.
- Nested node routes originally trusted only `nodeId`. They now require the loaded node's
  `collectionId` to match the URL.
- Deletion initially reused edit policy actions. Explicit deletion actions now ensure later
  membership work cannot accidentally broaden trash operations.
- Domain validation/duplicate/state errors initially fell through to 500 in some auxiliary routes.
  They now map to stable 400 or 409 envelopes while not-found errors remain non-disclosing 404s.

The two independent-review findings are fixed locally. The remaining completion gates are scoped
rereview and the full CI run with the actual PostgreSQL integration test.
