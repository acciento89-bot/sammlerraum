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

Task2 completion74e81ef saved and exacttreeverified; mainledger6d51681/blob3265ef9a synchronized. Task3 in progress from74e81ef via fresh implementer p04_t03. Task4 brief/context prepared for later review against finalTask3 contracts.

Task3 implementation96cd21f/report785b701; exacttree remote be08b81ada3f6f16c9560c645849aede829fd31a.301localpass28DBskips/typecheck/build/deploy-native-smokePASS. Independent reviewer p04_t03_review active; fullCI36321548760 pending. No checkoff yet.

Task3 review I1 expected-rejection matcher fixed df4654a; scoped rereview SPEC/QUALITYPASS0Important. Exacttree remoteff929ab9377f4add743c58e55d02650ac4903efc; fullCI36321650793 pending. Task5 must solve late-write reconciliation; quarantine/lease alone not proof.

Task3 COMPLETE ff929ab, CI36321650793SUCCESS301unit132integration22browser, nativeDockerdecodePASS. Task4 pending completion publication/main ledger sync.

Task3 completion52c47fd exacttreeverified; mainledger4f5f201/blob54eeb406 synchronized. Task4 inprogress from52c47fd via freshimplementer p04_t04.

Task5 ruling: durable minimal cleanup tombstones/reconciliation may outlive asset/variant rows to keep late writes discoverable after DB-lock partition; equivalent proven provider recovery acceptable. Reason: lease/quarantine not hardIObound. Cost: retained small metadata/background scans. No expiry solely by arbitrarytimer.

Task4 candidate450e74b/report8499da4; exacttree remote491fc652c5e0865feafa20769b6ed02207072b3f.38focusedPASS1DBskip/typecheckPASS. Freshreview p04_t04_review and fullCIpending. Ownerread requiresliveitem/document/avatarreference perexistingpreflight.

Task4 CI36322989684 failedsharedtestgeneric typing; originalimplementer reproducedTSRED/fixed668a027/report5bf4d2, focused8PASS/fullworkspaceTSPASS. ScopedrereviewPASS0Important. Exacttree remote92f0db8204da377fbd07087a65511cfa0b0d392d; fullCI36323311980 pending.

Task4 COMPLETE92f0db8, CI36323311980SUCCESS315unit133integration23browser/allbuildgates. Task5pending completionsync.

## Resume 2026-10-17

Resume 2026-10-17 at base 42324f7. Existing isolated clone, feature branch work/sammlerraum-v1. Tasks 1–4 already complete with remote CI evidence; do not repeat.

## Preflight
| Tasks | Shared interface | Finding |
|---|---|---|
| 1,2 | StorageProvider and upload persistence | Existing 4-method storage provider retained. |
| 1,3 | Source/variant storage keys | Existing image worker uses reserved tracked keys. |
| 1,4 | Authorized storage reads | Existing service denies unlinked retained bytes. |
| 1,5 | Filesystem deletion and crash staging | Task5 must clean old staging safely; inherited ruling applies. |
| 1,6 | Uploaded bytes behind provider | UI only consumes APIs, no storage key exposure. |
| 2,3 | Asset status/variant models | Existing claims/token/lease and advisory locks preserved. |
| 2,4 | Live ownership and links | Existing read authorization remains authoritative. |
| 2,5 | References, avatar, split links | Count all references and lock unlink/relink/delete consistently. |
| 2,6 | Upload/link APIs | Task6 extends ordering/title/document controls; foundation exists. |
| 3,4 | READY sanitized variants | Reads must not return originals publicly. |
| 3,5 | Concurrent/late writes | Durable tombstones or proven reconciliation required by recovery ruling. |
| 3,6 | Processing status | UI handles pending/failed states. |
| 4,5 | Read denial after unlink | Test that retention and tombstones never grant access. |
| 4,6 | Public image/private document views | Existing production media browser test provides fixture pattern. |
| 5,6 | Authorized unlink and lifecycle | Task6 uses verified Task5 API. |

| Task | Internal consistency |
|---|---|
| 1 | Complete; storage durability minor retained for phase review. |
| 2 | Complete; orphan/temp cleanup assigned to Task5. |
| 3 | Complete; partition late-write reconciliation assigned to Task5. |
| 4 | Complete; authoritative read interface is available. |
| 5 | Test command names cleanup-media.test.ts omitted from file list; inherited ruling includes it. Schema/API/worker/CI supporting integration required for an actual runtime job. |
| 6 | Consumes API controls not all present yet; inherited ruling assigns those bounded controls to Task6. Public presentation required by specified logout browser journey. |

Task 5: in progress. BASE 42324f7011b1d608269ed2be4f842f60dce101a2.

Ruling: Task5 configurable defaults are retention168hours, cleanup60seconds, batch100, staging age24hours. Existing proposed7day policy retained; validation must bound values. Cost if wrong: reversible policy tuning.
Ruling: Active staging writes and sweeping coordinate using the existing dedicated-session PostgreSQL advisory locker keyed staging UUID, plus in-process protection. Constructor-specific maintenance preserves generic StorageProvider contract. Production construction sites must all be wired; legacy cleanup requires old pre-lock writers stopped/upgraded. Lost-lock publication remains recoverable through durable final-key tombstones. Cost if wrong: extra DB sessions/maintenance coupling and migration precondition.

Task5 candidate8b199e6 secured on origin, exact SHA verified. Local327pass41DBskip/lint/typecheck/build; independent reviewer SPEC/QUALITY CHANGES REQUIRED: ImportantR1 staging traversal resets on persistent entry failure and starves healthy siblings. Original implementer assigned scoped RED/GREEN fix round1/5. CI39060930384 and39060928115 still pending for candidate.
Task5 minor (deferred): M1 cleanup guard's expected link/avatar conflict can surface as generic persistence error; safety preserved. Carry to Phase04 final review.

Task5 fix0cad624 secured on origin, exact SHA verified. Scoped independent rereview R1 ADDRESSED, no new Critical/Important. Full329pass41DBskip; current CI39061502277/39061498912 pending. Candidate8b199e6 fullCI39060930384 and39060928115 SUCCESS (all realDB/browser/Docker/native gates).
Local verification environment added2026-10-17: Homebrew PostgreSQL17.11, task-owned data directory outside repo, loopback5432 (Vitest setup hardcodes this port), isolated sammlerraum_test. Initial attempt on55437 failed connections because testsetup overrides DATABASE_URL; no source defect, corrected local port. Fresh exact-source0cad624 cleanup/staging integration14/14PASS, logs task-5-local-database*.log. Task6 may now run real local browser/DB tests. No production service/data touched.

Task5 fix round1/5: R1 ADDRESSED,0openImportant;0cad624 scoped rereviewPASS and fullCI39061502277SUCCESS. Task5 COMPLETE42324f7..0cad624; local329unitpass/41DBskips plus fresh local14integrationPASS. Canonical ledger26/91; Task6 next. Main ledger synchronization follows.

Task5 completion9dbc54c/evidence5326506 pushed and exactremote verified. Main ledger sync via native GitHub file update031664ec/blob b47b85a9 succeeded after ordinary main Git push was rejected; source remains unmerged. Task6 inprogress from53265060f9a59fff4e31e9a1af5caaa7290dd15e with fresh implementer sammlerraum_media_ui.
Ruling: Task6 uses first gallery IMAGE link by position as explicit title image; selecting another moves it to front atomically and preserves relative order of others — avoids inconsistent duplicate cover pointers — cost if wrong: future independent cover selection would need an additive field/DTO change.

Task6 source cfdea251 and evidence30ff3e0 secured on origin. Local375/375 including realDB, lint/typecheck/build, production7/7 and management16/16 passed. Initial dev auth2 failures retained; isolated auth retry4/4 passed. Independent task review found ImportantI1: raw Unicode filename XHR header rejects valid names before request. Exact-source CI39063403979/job117485918974 also exposed test-fixture rate-limit coupling (mobile sign-ins expected200, got429); this supports test isolation fix, not a product-security-limit change.
Task6 fix round1: source5319a745 secured and exactremote verified. Explicit bounded percent-UTF8 filename transport decodes only with marker, preserves legacy raw/literal-percent clients. Real browser RED and focused RED/GREEN preserved. Scoped35 tests, Unicode desktop/mobile2/2, lint/typecheck/build passed. Gated media fixture isolates synthetic rate-limit records between journeys and later auth commands. Independent scoped rereview, complete media matrix and exactsource CI pending; task remains unchecked.

Task6 fix5319a74 scoped rereview PASS: I1 resolved, zero new Critical/Important; local corrected media matrix6/6PASS. WholePhase04 integrationreview PASS0Critical/0Important, no consolidated fix wave required. Retained minors: directory-entry sudden-power-loss durability; safe avatar conflict generic error; harness logging diagnostics. Phase03 minors remain separate.
Exact-source CI39063951664/job117487544612 SUCCESS:151DBintegration, QR2/media7/auth4/management16, unit/lint/typecheck/build/migrations/Compose/web+workerDocker/nativeSharp all green. Saved CI log truncated explicitly. Source unchanged since5319a74; evidenceb75a6fd. Task6 COMPLETE, Phase04 COMPLETE6/6, canonical27/91; nextPhase05Task1. Completion docs/reviews saved before main ledger-only sync. No source merge/deploy.
