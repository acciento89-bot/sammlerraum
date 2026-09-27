# SDD ledger — plan: docs/superpowers/plans/2026-09-19-04-media-documents.md

Started 2026-09-27 from verified Phase03 completion7171142; source baseline d6a1a5e full CI36316664397 SUCCESS. Dedicated feature checkout work/sammlerraum-v1 is clean and matches remote; dependencies already installed. Main holds ledger only. No repeated baseline suite needed for unchanged tested source.

Ruling: continue in the established dedicated feature checkout — existing approved workflow isolates implementation from main and preserves GitHub history — cost if wrong: reversible checkout relocation.

## Preflight: task internal consistency
| Task | Requirement/implementation consistency | Finding |
|---|---|---|
| 1 | Path rejection test, provider interface and persistent local implementation agree | Package registration/lockfile must match existing workspace conventions. |
| 2 | Spoof/size tests, schema and validation agree | Limits need explicit config defaults; upload/link route surface not assigned explicitly. |
| 3 | EXIF test, three exact variant names and sizes agree | Media model and durable queue/outbox behavior need Task2 interface. |
| 4 | Authorization tests and private document default agree | Original images contain private metadata; public delivery must use sanitized derivatives. |
| 5 | Shared-reference test and retention agree | File list omits worker cleanup test named in run command; create it. |
| 6 | Private receipt test and gallery/document UI agree | Required upload/link/order APIs must exist; UI includes cancellation/progress and processing failure. |

## Preflight: shared interfaces/files
| Tasks | Producer / consumer | Finding |
|---|---|---|
| 1/2 | StorageProvider / validated durable upload | Typed stable errors, safe keys, atomic put; orphan recovery required. |
| 1/3 | Byte storage / derivative generation | Same provider for originals and variants; never overwrite originals. |
| 1/4 | Byte read / authorized streaming | Authorization must precede read; no public filesystem mount. |
| 1/5 | Delete/exists / retryable cleanup | Missing delete should be idempotent; shared links control deletion. |
| 2/3 | Asset/status/checksum models and queue / worker | Additive schema, idempotent variants and durable enqueue/recovery. |
| 2/4 | Links/purpose / owner/public policies | Full parent visibility ancestry and explicit document visibility. |
| 2/5 | Upload/link records / orphan cleanup | Unlinked uploads and failed DB links must be recoverable, no permanent bytes. |
| 2/6 | Upload/link APIs / UI controls | API assignment resolved below. |
| 3/4 | Variant metadata / authorized byte delivery | Derived MIME/checksum authoritative, original never public by accident. |
| 3/5 | Processing writes / deletion | Coordinate processing/cleanup so no resurrection or concurrent deletion. |
| 3/6 | Processing states / gallery UI | Pending/failure/ready states exposed safely. |
| 4/5 | Media existence/authorization / retained bytes | Unlinked retained bytes remain inaccessible. |
| 4/6 | Protected reads / gallery and documents | Private receipt stays private on public item, UUID never sufficient. |
| 5/6 | Unlink semantics / remove UI | Removing link doesn't delete other references. |

Ruling: implement upload/link mutation API surfaces with Task2 domain contracts and finalize gallery ordering/title/document controls in Task6 — Task6 explicitly consumes these APIs but the plan omits a separate API task — cost if wrong: bounded endpoint restructuring, no reduced V1 scope.
Ruling: public image delivery permits sanitized derivatives only; originals remain owner-authorized unless a later explicit product decision changes this — original EXIF can include GPS and spec forbids private metadata leakage — cost if wrong: an explicit future authorized original-download feature.
Ruling: Task5 includes its named cleanup-media.test.ts despite omission from Files list — test command requires it — cost if wrong: small extra regression maintenance.

Task 1: in progress. Base7171142. Fresh implementer forthcoming. Phase03 minor M1/M2 concern item UI, not storage; retain canonical ledger follow-ups.

Task1 implementation0374221 / remote165fddb2, exacttree285b4f13. 19 focusedtestsPASS, workspaceTS/format/frozenlockPASS. Independent SPEC PASS / QUALITY PASS. CI36317746924 pending.
Task 1: minor (deferred) — directory entry rename/delete not fsynced; sudden-power-loss durability stronger than current atomic visibility not guaranteed. Final phase reviewer must triage.

## Additional cross-phase preflight
| Tasks | Producer / consumer | Finding |
|---|---|---|
| P03T02/P04T02 | Existing item split / new media links | Preserve shared media/document links on the split portion; reuse asset bytes, don't clone them. Retain title/order/visibility/category. |
| P02 profile/P04T02+T05 | Existing avatarAssetId / ownership and reference cleanup | Avatar assignment must validate owned image asset and remain counted as a live reference, or be canonically migrated to a MediaLink. |
| P04T02/P04T03 | Sharp native decoder / worker packaging | Task3 must include native runtime dependencies in Docker worker build; bundled JS alone won't suffice. |

Ruling: add configurable defaults of20MiB per image,25MiB per document and40million decoded pixels; accept JPEG/PNG/WebP images and PDF plus those image types as documents initially — spec requires explicit limits and common safe formats without exact values — cost if wrong: configuration/allowlist refinement, not data migration.
Ruling: integrate new item media/document links with existing quantity splitting in Task2; copies reference the same assets — interchangeable split portions must retain description/proof and cleanup must count all references — cost if wrong: explicit link removal on the split portion.

Task 1: complete (7171142..165fddb2, SPEC/QUALITY PASS; one deferred minor; fullCI36317746924SUCCESS259unit109integration22browserallbuildgates). NextTask2.

Task 2: in progress; base9763e02e3913f5f940d950b11ffc364ccb9c0965; fresh implementer p04_t02 dispatched with task-2-brief/context. Main ledger synced7d5536c, blob9d94a464236bc3b386747ff65f3afa89f34fedca.

Additional preflight P03 management page/P04T06: current /[locale]/items/[id] page unconditionally sends anonymous viewers to login, while Task6 browser requirement expects public gallery visibility after logout.
Ruling: Task6 adds a minimal read-only public item/gallery presentation through the existing authoritative public-item projection and Task4 sanitized media authorization; owner editing stays authenticated, private receipts stay denied — required by the explicit Task6 public-image/private-receipt browser test — cost if wrong: bounded route/presentation relocation when Phase14 supplies final public SEO surfaces. Keep noindex until that phase's explicit SEO policy.

Task2 design milestone: durable UPLOADING row/storage key before put; successful images become PENDING durable dispatch intent, documents READY. Task3 must dispatch/recover PENDING, Task5 handles stale UPLOADING/unlinked assets. Initial10 focusedtestsGREEN after module-missingRED.
Ruling: Task2 migration clears pre-media non-null avatarAssetId values before adding the owned MediaAsset FK — no legacy media table/storage source exists, so arbitrary unsupported UUIDs cannot be backfilled and would block migration — cost if wrong: users must reselect an avatar; no stored media bytes or other profile fields are deleted. Migration is authored/tested only, no production execution.

Task2/3/4 interface clarification: image MIME uploads are PENDING for sanitized derivatives regardless of IMAGE or DOCUMENT kind; PDFs may be READY immediately. Task3 selects image MIME/status, not IMAGE kind alone. Task4 public image documents expose derivatives, never EXIF-bearing originals; explicitly public PDFs follow document policy and safe download headers. This is the existing public-image derivative ruling applied consistently.

Task2 lifecycle interface: MediaAsset.owner and MediaVariant.asset use RESTRICT rather than cascade so parent/user deletion cannot erase storage-key tracking before byte cleanup. Task5 must remove variant bytes/rows and original bytes before asset row; any account deletion workflow must respect this order. Item links may cascade while asset tracking survives.

Task2 review cross-task handoff: LocalPersistentStorage uses reserved random .storage-UUID.tmp names; a process kill before rename leaves staging bytes not named by UPLOADING.storageKey.
Ruling: Task5 owns a safe age-gated sweep of reserved local-provider temp files (or equivalent recoverable temp identity) with crash simulation and active-write safety — domain intent tracks final keys but cannot discover staging names through the four-method StorageProvider interface — cost if wrong: overly aggressive cleanup could fail a very long active write; conservative age/ownership checks are required. Keep the generic four-method contract unchanged.

Task2 implementation e8cc3f2 / remote5b1d13a; independent SPEC PASS / QUALITY PASS, one Task5 temp-file handoff. CI36319552257 failed new realDB owner-FK fixture: duplicate media link violates unique key P2002 before intended P2003. Fix round1 assigned to original implementer; production reviewed without Important findings.

Task 2: fix round1/5 (CI fixture addressed,0 openImportant; e8cc3f2..4818fb7 / remote38dbc4aa; narrow rereviewPASS). Fresh fullCI36319866566 pending. Task3 brief/context prepared; do not start until Task2 verified checkoff/main sync.

Task2 COMPLETE: source38dbc4aa, CI36319866566 SUCCESS,290unit129integration22browser/allbuilds. Review and fixture rereview PASS. Task3 pending publication/main-ledger sync.
