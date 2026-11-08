### Spec Compliance

- ❌ Issues found: the requested upload UI rejects valid file names containing Unicode outside Latin-1 before uploading; see I1 at `apps/web/src/components/media/media-upload.tsx:86`. All six explicitly listed Task 6 files have their required implementation hunks, and the additional route/service/harness changes support the binding handoff.
- ⚠️ This is the Task 6 gate for base `53265060f9a59fff4e31e9a1af5caaa7290dd15e` to head `cfdea251bf82609f49d30e7a957eeb0cada87156`. Exact-head remote CI remains controller-owned and was running at review time. Any subsequent filename fix needs its targeted review/verification before this gate becomes approved.

### Strengths

- `apps/web/src/components/items/item-form.tsx:683` integrates media management outside the item form and supplies save-first guidance. `apps/web/src/components/media/item-gallery-editor.tsx:64` preserves other links' relative order when moving a selected title to the front; accessible move buttons accompany drag ordering at line 128.
- `packages/domain/src/media/media-service.ts:213` locks the owned item before management operations. The reorder implementation compares the complete gallery membership before changing positions within the transaction; the added integration test at `packages/domain/src/media/media-management.integration.test.ts:66` checks persistence and rejection without partial reorder. The new owner list selects safe fields and takes at most 200 links per target, and link insertion enforces that limit under the item lock.
- `apps/web/src/components/media/document-manager.tsx:24` starts documents PRIVATE and keeps their category and visibility explicit. `apps/web/src/app/[locale]/(app)/items/[itemId]/page.tsx:42` uses the authoritative public item query, followed by an explicit gallery-only projection; the page exposes neither document listings nor private owner metadata and declares noindex at line 11.
- `apps/web/src/components/media/media-upload.tsx:113` observes the link outcome before compensating for cancellation; it checks again after the listing refresh. Its unmount cleanup sets the same cancellation flag and aborts a binary request. The new E2E at `apps/web/e2e/media-documents.spec.ts:193` exercises both linked-response and refresh cancellation windows, including removal of the link and retained orphan intent.
- `apps/web/e2e/support/browser-test-server.mjs:177` launches the bundled worker for the new journeys. `apps/web/playwright.config.ts:21` and `.github/workflows/ci.yml:152` register the new spec in desktop/mobile projects and the production CI command before dev journeys. The four media journeys cover DE/EN with actual uploaded PNGs and generated variants, document privacy after logout, unauthorized mutations, and terminal processing failure.

### Issues

#### Critical (Must Fix)

- None found within this task scope.

#### Important (Should Fix)

- **I1 — Valid Unicode filenames cannot be uploaded.** `apps/web/src/components/media/media-upload.tsx:86` passes raw `file.name` into `XMLHttpRequest.setRequestHeader`. The browser requires a ByteString there: names such as `Zertifikat–2026.pdf`, `kolekcja-Łódź.png`, and `image-📷.png` synchronously throw `TypeError: String contains non ISO-8859-1 code point`, before `xhr.send`. The catch then displays the generic action error, so retrying the same valid image/document can never work. The receiver at `apps/web/src/lib/media-routes.ts:92` currently consumes the header verbatim. Introduce an explicit ASCII-safe filename transport with matching bounded server decoding, preserving ordinary names and rejecting malformed encoding cleanly; add a real browser regression verifying upload, displayed filename, and stored filename for non-Latin-1 input. A focused Chromium probe confirmed all three failures and the ASCII control succeeded; no network request or database mutation was made by the probe.

#### Minor (Nice to Have)

- **M1 — Validation output is not pristine.** `.superpowers/sdd/2026-09-19-04-media-documents/task-6-production-browser.log:1` contains repeated conflicting `NO_COLOR`/`FORCE_COLOR` warnings, and line 18 contains Next's `destination stream closed early` diagnostic. All seven production assertions still passed (line 26); the report attributes the stream diagnostic to existing mobile QR navigation. Normalize the harness color environment and track or explain the stream-close diagnostic with sufficient evidence to distinguish expected navigation cancellation from a server failure. This is not evidence that a media assertion failed.

### Checks and Evidence

- Read the review package once in sections; the initial tool result truncated the middle, so only omitted sections were recovered. No changed source was reread wholesale, no git state commands or source mutations were performed, and no passed suite was rerun.
- Named risk — public ancestry/privacy: checked the existing authoritative query at `packages/domain/src/items/item-query.ts:46`, including collection/node ancestry validation and public authorization at lines 127–145. Checked `packages/domain/src/media/media-read.ts:91` through its reference authorization and original/derivative selection: document visibility remains independent at line 141, and image originals remain owner-only at line 173.
- Named risk — lock order/shared retention: checked `packages/domain/src/media/cleanup-service.ts:43` and `:80`. Unlink locks the item and deletes only the selected reference; cleanup separately locks and rechecks the asset and all live references. Task 6's item-then-asset link locking and cleanup-claim check preserve this contract. The analogous avatar minor stays deferred as instructed.
- Named risk — current sessions/same-origin management: checked `apps/web/src/lib/media-route-dependencies.ts:20`, which disables session cookie caching, against the new route wrapper's mutation origin guard at `apps/web/src/lib/media-routes.ts:164`.
- Named risk — real worker harness: checked the existing lifecycle in `apps/worker/src/main.ts:77`; startup starts the queue, image dispatcher and cleanup lifecycle, consistent with the bundled runtime launched by this task. New E2E fixtures are `_test`-gated at `apps/web/e2e/media-documents.spec.ts:9` and remove only their fixture ownership scope at line 76.
- Named risk — filename transport contract: checked the existing upload receiver at `apps/web/src/lib/media-routes.ts:90` and ran only the focused headless Chromium header probe described in I1.
- Existing evidence: `.superpowers/sdd/2026-09-19-04-media-documents/task-6-full-suite.log:60` records 55 files and 375 tests passed; `task-6-production-browser.log:26` records seven production journeys passed. Build/lint/typecheck/migration results are recorded in the implementer report and their named logs; these were not rerun.
- Dev evidence remains qualified: `task-6-dev-browser.log:516` records two auth failures and line 519 records 18 passes. `task-6-auth-retry.log:92` records an isolated four-test auth retry passing. The controller reports clearing one gated test rate-limit row first; the original cause is an inference, not established by this review. No auth source change is included in this candidate.

### Assessment

**Task quality:** Needs fixes.

**Reasoning:** The privacy projection, atomic ordering and cancellation compensation satisfy the task's core architecture and have substantial real database/browser evidence. The reproducible filename transport defect blocks valid uploads and must be fixed before approving Task 6; no broader phase review was performed.
