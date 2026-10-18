# P04 Task 2 independent review

Reviewed `9763e02..e8cc3f2` (HEAD `e8cc3f2a42fbe804a2b53600a8588cf3cb66e80b`), task brief/context/report, and current phase rulings. Scope: Task 2 changed production paths, schema/migration, tests, and directly consumed interfaces. No implementation edits or suite reruns.

**SPEC PASS. QUALITY PASS.** No Critical or Important Task 2 findings. One Minor cross-task recovery handoff below. Passing review does not replace the controller's pending real PostgreSQL/full-CI gate.

## Findings

### Minor M1 — include provider temporary files in Task 5 crash recovery

Evidence: `packages/storage/src/local-storage.ts` `LocalPersistentStorage.put` creates `.storage-${randomUUID()}.tmp`, writes/syncs it, then renames to the final key; `finally` unlinks the temporary file on normal completion/errors. A process death before rename skips that cleanup. Task 2 correctly persists `originals/<asset UUID>` before calling put, but that row cannot identify the independently randomized temporary filename. `packages/storage/src/types.ts` exposes only put/read/delete/exists, and the Task 2 handoff currently tells Task 5 to inspect the final storageKey.

Impact: recovery of final original bytes is sound; crash leftovers inside the app-owned provider root require a separate recovery rule. This is an existing provider lifecycle interface, not an upload-validation defect or reason to rerun Task 1 review.

Fix/owner: add an explicit Task 5 requirement for provider-owned temporary-file recovery with conservative age/active-write exclusion, or provide deterministic/tracked temporary identities and a recovery API. Do not represent final-key intent rows alone as covering provider temporary bytes. Controller confirmed this ownership during review: Task 5 will add safe age-gated sweeping of reserved provider temporary files (or equivalent recoverable identity), crash simulation, and active-write safety, preserving the four-method generic StorageProvider contract. No Task 2 source change is necessary.

## Specification and production checks

- `media-service.ts` checks byte caps before detection, validates magic with file-type, requires allowed MIME/extension agreement, and fully decodes images with Sharp before persistence. Metadata pixel checks and Sharp `limitInputPixels` bound decoding. JPEG/PNG/WebP are allowed; PDF is document-only. PDF validation is signature/EOF validation, not a full PDF parser, accurately stated in the report. Config supplies 20 MiB/25 MiB/40-million-pixel defaults and bounded overrides.
- `media-routes.ts` authenticates and checks exact Origin before consuming upload bodies. `readBoundedBody` counts actual streamed bytes and cancels at the first over-limit chunk, independently of Content-Length. Both upload and JSON link routes use bounds. `media-route-dependencies.ts` obtains uncached, nonrefreshing server sessions. Shared route errors and successful responses are no-store; asset serialization strips storage keys.
- `media-service.ts` commits UPLOADING with the final key/checksum/size/metadata before storage.put. Storage failure and post-put status-update failure retain this durable row; link failure retains the independently committed asset. Every accepted image MIME becomes PENDING, including DOCUMENT images. PDF becomes READY. There is no pretend best-effort queue guarantee: PENDING is explicitly the Task 3 dispatch intent.
- `linkAsset` rejects unknown targets and foreign/missing assets; it locks an owned, nondeleted item in a live collection before changing links. This matches the item split locking discipline. Document visibility defaults to PRIVATE independently of parent visibility. Gallery links require IMAGE and document links require DOCUMENT; upload/failed statuses cannot link.
- Schema and migration add all four media/document models and necessary metadata/enums. Composite item/asset owner foreign keys backstop service ownership. Profile avatars have an owned asset FK and both write paths require a READY owned IMAGE. Asset/user and variant/asset RESTRICT relations preserve key tracking; avatar references remain visible and restrict deletion. The legacy-avatar repair is the explicitly approved pointer reset, with no other profile fields changed.
- Quantity split reads and copies both link sets in its existing locked transaction, preserving asset ID, owner, position, title, purpose/category/visibility. No new asset or bytes are created.
- Contract categories match the specification. Catalog targets remain denied until their models/permissions exist. The storage root remains an app-owned OS boundary.

## Regression evidence assessed

Inspected the actual tests, not only the report: spoofed PDF-as-JPEG, byte/pixel rejection, truncated-image decode, claimed MIME mismatch, durable intent ordering, put/update/link failure retention, foreign/deleted targets, foreign assets, private document default, image-document PENDING, kind/status mismatch, and unsupported target rejection. Route tests meaningfully verify no body pull before auth and stopping after the first oversized chunk. The populated split PostgreSQL test checks both portions and unchanged asset count. The real migration replay test builds the prior schema, inserts an unsupported avatar pointer, applies the migration, checks preserved fields, and exercises the new FK. The media DB test checks real ownership FKs and avatar assignment. Both new DB suites are registered in CI.

Supplied execution evidence: 66 focused passes, 8 explicitly DB-only skips, Prisma validation/generated migration comparison, typecheck, formatting, frozen lockfile. I did not rerun those suites. A narrow check of the installed file-type detector on truncated image headers and every prefix of a generated PNG did not reproduce the suspected detector-exception issue, so it is not reported as a defect.

## Handoff and limits

Task 3 must actually dispatch/recover PENDING for image MIME regardless of kind, atomically claim processing, recover stale claims, persist variant keys before writing, create all sanitized variants, and package Sharp native dependencies. Task 4 must authorize reads before storage access and serve public image bytes only from sanitized variants; private document links do not inherit public permission from their item. Task 5 must honor all media/document/avatar references and retention windows, coordinate cleanup with uploads/workers/new references, and address M1. Task 6 adds editing/UI and the already ruled public read-only gallery surface.

These later behaviors are not implemented or claimed by Task 2. No missing unchanged interface prevented inspection (CannotVerify: none). Real PostgreSQL execution and full CI remain controller validation gates; their completion is not asserted here.
