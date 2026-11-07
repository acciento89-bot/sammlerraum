# Phase03 final integration review

Reviewed 2026-09-27. Base: `6ebbc1a` (Phase02 complete). Candidate: `dd972b61792f79710173041e470f427566546995`. Scope: Phase03 integration and readiness to proceed to Phase04, not V1 release, merge, provider, or deployment approval.

**Verdict: one Important finding remains. No Critical finding identified. Fix R1 and complete the fresh Task8/candidate CI gate before marking Phase03 complete.**

## Evidence and review scope

Reviewed the Phase03 plan, canonical design sections covering items/quantity, hierarchy, typed fields, privacy and sharing, the canonical V1 ledger and phase rulings, progress, Task7 review/resume evidence, and Task8 implementation/correction report. Inspected the changed-file inventory and bounded production-source/diff passes through contracts, migrations and schema relationships, hierarchy/item/identifier/tag/custom-field/location services, public and owner query projections, policy changes, REST handlers/dependencies, management forms/scanner, QR service/pages/headers/print CSS, and CI/browser wiring. Read relevant existing tests, including quantity concurrency/rollback, public/private route integration, metadata round trips, management regressions, and label privacy journeys.

Existing successful Task1–7 suites and CI are accepted as supplied evidence; they were not rerun. Task8's fresh remote CI was pending in the review brief and is not claimed green here. A focused in-memory execution of the actual bundled item service confirmed R1's write behavior; it did not use PostgreSQL or a browser. No production code was edited, no live provider was used, and no additional reviewer was spawned.

## Important finding

### R1 — Important / P2: splitting loses the new item's existing organization and descriptive metadata

**Location:** `packages/domain/src/items/item-service.ts:355-384`, especially the new row payload at **366-382**. The locked item projection at **179-202** also omits `storageLocationId`.

**Concrete trigger:** create a quantity-10 item, assign it to a drawer, give it an EAN and tags, and set collection custom fields (for example edition and an ordered multi-select). Call the existing `POST /api/v1/items/{id}/split` with `{ "quantity": 3 }`.

The source becomes quantity 7 and the created item becomes quantity 3, but the new item has no location, identifiers, tags, or custom-field values. The service reads only scalar item data, performs one scalar update and one scalar create, and returns. It never reads/copies the later Task3/4 relations or carries the Task5 location into the new row. `storageLocationId` therefore defaults to NULL and no related rows exist for the new ID. Scanning the original drawer now accounts for only 7 of the 10 physically unchanged units. The new three units also lose their edition/identification/classification information. This is a cross-task gap: the Task2 implementation was not integrated with data introduced by Tasks3–5. The original source's related records remain intact; this finding concerns loss of context on the split portion, not deletion of the source's records.

**Focused verification:** executed the actual item service bundled in memory against a transaction spy containing a quantity-10 located source. Result: total quantity remained 10; `insertedHasLocation` was false; the entire call sequence was `read item`, `update item`, `create item`. The inserted keys were exclusively the Task2 scalar fields. Source/schema inspection establishes the absence of relation inserts and the nullable location default. This was a focused service-write reproduction, not a claim of a real-database integration run.

**Required correction:** preserve the interchangeable item's shared metadata in the same split transaction: current location, item-scoped identifiers, tag links, typed values, and ordered multi-select links. Preserve the current owner/collection scopes and exact typed values. If current location is inherited, record the new item's initial assignment consistently with the existing location-history contract; do not manufacture copies of past physical movements. Handle any identifier-specific exception explicitly rather than silently discarding all metadata. There is no ledger ruling that excludes split metadata preservation.

**Regression needed:** split a populated item, read both items through the owner API, and check the copied metadata and unchanged total count both globally and at the original location. Include an ordered multi-select and an exact Decimal/MONEY value. Demonstrate rollback of the decrement/new row if metadata persistence fails; retain the already-tested concurrent quantity-conservation behavior.

## Minor observations, separate from the phase gate

- **M1 — blank enabled INTEGER becomes zero:** `apps/web/src/components/items/item-form-values.ts:45-48` uses `Number(input)`, so an enabled empty numeric custom field submits 0. Its control has no conditional required constraint (`item-form.tsx:827-837`). Reject an empty enabled value or explicitly document that conversion; disabling the field already represents “unset.” This is a narrow validation/UX issue, not a defect in server typed storage.
- **M2 — hierarchy selectors lose ancestry context:** item node/location options show only the leaf name (`item-form.tsx:428-431`, `559-562`), as does the reusable parent selector in `collection-detail.tsx`. Ordinary duplicate names such as “Shelf 1” in different rooms produce indistinguishable choices. Display a parent path or another disambiguator. The underlying IDs, same-owner checks, and hierarchy-cycle enforcement remain correct.

These are nonblocking observations for prioritization, not additional Important findings. No unproven same-route React refresh concern is elevated to a finding.

## Strengths and cross-task behaviors considered

- **Private ancestry and projection:** public item reads load item/collection/full node ancestry together, reject PRIVATE/UNLISTED, incomplete or cyclic ancestry and inactive/deleted resources, then construct an explicit public whitelist. Private notes, purchase values, locations, tokens, and history are absent. Authenticated nonowners also use this projection; private owner metadata is gated separately.
- **Owner boundaries:** management writes and private lists use a fresh server session, server-derived policy facts and repeated owner checks in services. Mutations enforce exact origin and error responses remain generic/no-store. Phase03 does intentionally expose the ledger-approved safe public item and public collection reads; “owner-only” is applied to management/private data, not construed to revoke those accepted public DTOs.
- **Data integrity:** composite foreign keys enforce same collection/owner relationships; hierarchy mutation locks serialize inverse moves. Item row locks and a single transaction protect count conservation. Money is canonical per-unit minor units plus currency, dates are normalized, and all ten custom-field types use dedicated columns with typed shape constraints. Decimal projection retains exact strings. Identifier uniqueness is item/type/value scoped, preserves leading zeroes and permits legitimate repetition across items.
- **Locations and QR:** assignment atomically writes current location plus history. Stable random tokens are reused, not regenerated when printing. The scan route checks a fresh session before token lookup and then scopes lookup by owner. Foreign/invalid authenticated tokens converge on 404; anonymous tokens converge on login before lookup. Label output contains name, QR and internal code, with no item/private-value rendering. No external QR provider is called. Dynamic rendering, no-store, noindex and referrer restrictions are wired for the relevant paths.
- **Soft deletion:** collection/item deletion sets `deletedAt`; contents and related records remain. Normal/private/public reads exclude deleted items or their deleted collections, and direct service writes check deletion. No irreversible contents deletion was introduced by these management routes.
- **DE/EN management:** both dictionaries contain the new management/label copy, including the corrected print-label key. The UI separates public descriptions/private notes, uses explicit visibility controls, labels purchase price per unit, supports typed controls, and retains manual code entry plus explicit scanner confirmation. Prior round-trip, option-loading, retry and camera-resource fixes are present; mobile/desktop verification evidence is recorded in the Task7 report.

## Phase boundaries and readiness

Task1–7 are recorded complete; Task8 code is present and its missing translation has been corrected, but its final checkoff must follow the pending fresh CI evidence. The phase plan's required surfaces are present, including the split domain/API endpoint. Task7 does not explicitly require a split UI, so absence of that control is not raised as a new blocker.

Collaboration roles/invitations/sharing, audited restoration and conflict resolution remain Phase09 work under the ledger. Public-facing discovery/SEO, richer media/documents/catalog/value workflows, Smart Collections and subsequent phases are not prerequisites for this Phase03 gate. Anonymous label scans currently require login and a rescan; the Task8 report states this behavior, and login return-target enhancement is not treated as a privacy failure or a phase blocker. Provider authentication checks and deployment remain outside this review.

The architecture is suitable to carry forward after R1 is corrected and verified. Do not mark this candidate Phase03-complete solely from the earlier individual task approvals: their quantity tests cover scalar conservation, not the later metadata integration demonstrated here. After the focused fix/rereview and fresh normal CI pass, proceeding to Phase04 is appropriate; this assessment makes no V1 release/merge approval claim.
