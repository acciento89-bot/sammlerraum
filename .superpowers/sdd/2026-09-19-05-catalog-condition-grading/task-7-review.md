### Spec Compliance

- ❌ Issues found: the required separation of editor state is incomplete. A sibling save silently resets an unfinished category/condition draft (`apps/web/src/components/items/condition-editor.tsx:32`; I1 below). All seven brief-listed files are present, and the additional history/capability/moderation/initializer work matches the approved context.
- ⚠️ Task-scoped assessment only: whole-phase integration and exact-source remote CI remain root-owned. Existing mutation services' complete authorization/concurrency invariants were not broadly re-audited; the new UI calls their protected endpoints, and the supplied browser tests exercise actual grants and rollback revocation (`apps/web/e2e/catalog-grading.spec.ts:731`). Root's visual inspection is supporting evidence, not a substitute for this code review.

### Strengths

- Canonical proposals are built from explicit authored fields and parsed with the existing strict schema; no personal DTO is spread into them (`apps/web/src/components/catalog/proposal-composer.tsx:94`, `:128`). Human forms cover all seven operations, translations, typed attributes and sources; real browser assertions verify pending-only ordinary submissions and private-fact exclusion (`apps/web/e2e/catalog-grading.spec.ts:546`).
- The saved-ID-gated editors sit after the main item form, support retained read-only facts and keep exact personal condition separate from grading (`apps/web/src/components/items/item-form.tsx:684`, `apps/web/src/components/items/condition-grading-editor.tsx:61`). An acknowledged grading ID is retained before refreshing siblings, so the covered retry uses PUT instead of duplicating a POST (`apps/web/src/components/items/grading-editor.tsx:48`).
- History is bounded and canonical-only, with strict revision/cursor validation; capability is advisory and resolves the actual grant through the shared authority helper (`packages/domain/src/catalog/catalog-read-service.ts:168`, `packages/contracts/src/catalog-reads.ts:115`, `apps/web/src/lib/catalog-link-routes.ts:38`).
- Explicit initialization uses the approved labels and null bands, performs complete semantic preflight under one transaction/lock, preserves existing IDs and retirements, and reuses the maintenance transaction seam (`packages/domain/src/catalog/initialize-catalog.ts:32`, `:91`, `:170`). Atomic rollback, conflict-before-write and preservation assertions are real PostgreSQL tests (`packages/domain/src/catalog/initialize-catalog.test.ts:35`, `:102`, `:124`).
- Actual desktop/mobile registrations and the production CI command include the new journey (`apps/web/playwright.config.ts:19`, `.github/workflows/ci.yml:165`). The zero-byte DELETE correction preserves bounded rejection of nonempty bodies (`apps/web/src/lib/catalog-link-routes.ts:154`, `apps/web/src/lib/grading-routes.ts:109`).

### Issues

#### Critical (Must Fix)

- None found.

#### Important (Should Fix)

- **I1 — Preserve condition/category drafts across unrelated sibling refreshes.** `apps/web/src/components/items/condition-editor.tsx:32` resets `category`, `option` and `clear` whenever the `condition` object changes. `apps/web/src/components/items/condition-grading-editor.tsx:30` fetches all three resources for every sibling save and `:36` installs a newly parsed condition object, even when its saved values are unchanged. Reproduction from the state flow: select Near Mint without saving it, save a new grading, and the selection silently returns to persisted Mint; an unfinished category change and explicit clear checkbox are likewise discarded by grading or link saves. This violates the approved independent-editor-state behavior and can make a user lose an intended change while completing another section. Synchronize on meaningful saved values/item identity and preserve dirty local fields across unrelated reloads; add a focused browser regression that saves grading/link while a condition/category draft exists. Existing tests save these sections sequentially and do not cover this interleaving.

#### Minor (Nice to Have)

- **M1 — Cancel does not invalidate a pending reference selection.** `apps/web/src/components/catalog/catalog-linker.tsx:143` only clears `selected`. With A already selected, start choosing B while its detail GET is delayed, then press the still-enabled Cancel button. The response at `:43` passes the unchanged generation check and reopens B's selection form after cancellation. Invalidate the pending read and release its busy state when cancelling, and prevent selection/cancel transitions from unlocking an in-flight mutation. Add a focused delayed-read cancellation case.
- **M2 — Validation output contains real, nonblocking warning noise.** The final browser evidence has conflicting `NO_COLOR`/`FORCE_COLOR` warnings (`.superpowers/sdd/2026-09-19-05-catalog-condition-grading/logs/task-7-production-browser-final.log:1`, `:6`, `:22`). An earlier run warns that npm does not recognize `verify-deps-before-run` (`logs/task-7-browser-desktop-first.log:1`, same evidence directory). The final build flags the 6.9 MB worker and new 5.7 MB initializer bundles with esbuild size indicators (`logs/task-7-build-final.log:36`, `:40`). These do not invalidate passing checks, but output is not pristine. Clean up conflicting environment/config forwarding and assess or explicitly accept the operator bundle size; retain the historical logs unchanged.

### Checks and scope

- Reviewed the supplied diff's source/tests and recorded evidence in functional passes; no git state changes, source edits, suites rerun, or provider/production actions. Only this report was written. One combined tool result truncated part of the backend diff; that omitted section was reread from the package, not from changed files.
- Named risk: optional-field clearing might disagree with native producer semantics. Focused unchanged producer check: `packages/domain/src/catalog/catalog-service.ts:324` and `:377` replace the full variant/identifier values, so the proposal forms' omitted blank optional values correctly clear those facts. The native language contract at `packages/contracts/src/catalog.ts:104` also matches the form pattern.
- Named risk: manually created moderator browser contexts might omit mobile project options. Focused installed-runner check: `node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/index.js:122` applies `_combinedContextOptions` before every browser context creation. The `browser.newContext()` moderator journeys therefore inherit the configured mobile viewport/device settings; no mobile-evidence defect found.
- Recorded checks substantiate 528/528 serial workspace tests before later UI/extraction edits; final serializer tests, build/types/lint, 28/28 production journeys and 4/4 existing core-form regressions are present. The original RED is correctly a missing displayed PSA 9 feature on a valid item page, not an alleged historical overwrite regression (`logs/task-7-original-red.log:28`, same evidence directory). No new execution was needed to establish I1's direct React dependency/state flow.

### Assessment

**Task quality: Needs fixes.** Counts: Critical 0, Important 1, Minor 2.

**Reasoning:** The task is substantially implemented with strong canonical/private separation, authoritative producer reuse and meaningful production/database evidence. The unfinished-condition draft reset must be corrected before approval; cancellation and warning cleanup are smaller follow-ups.
