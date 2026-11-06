# Phase08 Task1 — root local acceptance

Base `08fa12ea726fea4218d9e48c31533d3b1e6e0929`. Source `cc754f4b2a48d62ddde63f990f358cd1db27edf1`, reviewed closure `c4938aaaec6ad773501f0972861bd9b5fa67ee14`. Root implemented and ran all checks. No main application merge, production deployment, provider activation, real-data processing, mail, purchases or emulator was involved.

## Implemented scope

Actual PostgreSQL models persist import jobs, immutable source identities/row keys, progress, row errors and private reusable mapping profiles. A pending source declaration is not treated as verified bytes. The service creates owned pending jobs, saves profiles with revisions, builds resumable previews and reads completed previews in bounded pages. Every operation rechecks the owner and live target collection; source keys are omitted from DTOs.

The preview freezes its own mapping/profile revision. Later profile edits do not reinterpret it. At most100 rows are processed per transaction; duplicates in later batches also mark earlier rows before REVIEW_READY. Exact normalized identifier matching is limited to live owned items in the selected collection. Source-only and existing-item conflicts offer explicit actions, without selecting one or mutating inventory. Invalid fields become skippable row errors. Item/identifier constraints and the M7 canonical/UNKNOWN money validator are reused; blank optional amounts remain no value and explicit zero stays a value. Dates use a selected grammar. Page and completed-preview retry paths validate whole-generation membership before claiming completion.

Profile-name changes serialize on the owner's physical database row version, preserving visible fields while forcing stale RepeatableRead contenders to retry. Native tests use separate clients. Source rows/profile bodies, candidate lists, batches and responses are bounded; failures do not truncate output. A real final-update statement timeout rolls back both row previews and progress.

## Review and evidence

One whole independent review found a P2 completed-preview retry bypass. Root reproduced it, moved the early return after coverage validation, and extended the native corruption test. The scoped closure passed; final combined verdict is **SPEC PASS / QUALITY PASS**, with no outstanding findings. Initial failure and closure are retained in `task-1-review.md` and named logs.

Final checks on `c4938aa`:

- Complete current CI native allowlist: **827 passed in72files, zero skips, 139.05s**. This includes the existing M1–M7 gates and15new activated native service/model cases.
- Complete regular suite: **1,475 passed / 698 explicitly disabled native cases**, 11.18s. Disabled cases are not counted as executed native checks.
- Full workspace typecheck, lint and production build passed.
- Owned retained browser database migrated successfully; **22 actual-built collection/item browser cases passed**, DE/EN desktop/mobile, 25.6s. This task adds no web UI/routes. The predecessor's400+8browser gate remains separately attributed to its own source; it is not relabelled as a fresh full browser run here. Full CI will repeat its configured cohorts after publication.
- Focused coverage: **25 passed without skips** (10pure,11service native,4model native). Tests include actual no-overwrite,101-row batches/source duplicates, frozen profiles, foreign profile/name collision, UUID aliases, separate-client name race, real timeout rollback, corrupted completion/page membership, foreign/deleted/other-collection identifiers, invalid rows, empty/unverified sources, exact64KiB Unicode row boundaries, UNKNOWN RAW and zero.

Both new migrations were applied on the existing owned public test database and retained browser test database. Earlier applied migrations remain unchanged. The first new migration was already exercised when Prisma's different63-byte index naming convention was identified; a second additive migration aligns the name. Actual replay succeeds. No real inventory/source file was processed; native parser states are explicitly prepared synthetic fixtures, not an upload/parser claim.

All commands and genuine REDs remain in `logs/task-1-20261106-*.log`: missing service, missing preview method, then explicit page/foreign-resource/UUID failures, and the reviewed completed-retry failure. The foreign collection fixture was corrected to use an otherwise valid source key so it actually tests the compound owner FK. No runtime budget, source limit, guard or assertion was relaxed.

## Remaining integration and publication

Task2 must implement bounded CSV/XLSX reading and source verification; Task3 must commit explicit decisions with actual writer authorization/CAS and durable row receipts. APIs, source-file cleanup and localized UI are later steps. Prospective defaults and absent mapped fields do not authorize MERGE overwrites. Monetary replacements require a target-bound preview/precondition. The current service performs no inventory commit.

Root locally accepts Task1 and advances the task ledger to **42/91** (Phase08 now1/7), with exact new-head CI still required after feature-branch publication. Both predecessor M7 workflows on08fa12e passed. Local Task2 implementation may continue under the existing pipeline rule; hold dependent publication and stop affected work on an actual Task1 remote failure. The PR remains a draft and production remains unchanged.

## Remote browser-harness closure, 6 November 2026

The original Task1 PR workflow42286107177 failed in an existing catalog browser case after the real POST returned201: CDP could no longer retrieve its body after automatic navigation. This failure is retained in logs/task-1-20261106-ci-response-nav-failure.log. Task2 source was held separately before correction.

Test-only commit c8603bd5ef9c3928264c3b63a4b770d03900ad29 captures the real catalog/item creation response before fulfilling it to the navigating page. Each POST is sent once; no product behavior, timeout, retry or persisted-result assertion is weakened. Independent scoped review passed with no actionable finding. Catalog creation repeated24/24, actual item creation repeated6/6, and all176 affected API/browser cases passed without skips (3.1min). Web TypeScript and formatting checks passed. Logs retain exact commands/results. The earlier827native/1475regular/build gates remain attributed to unchanged application source c4938aa, not falsely rerun. Both new exact-head remote workflows remain required before dependent Task2 publication.
