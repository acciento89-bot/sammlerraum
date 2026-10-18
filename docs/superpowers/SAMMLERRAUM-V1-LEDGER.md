# Sammlerraum V1 Completion Ledger

**Stand:** 18.10.2026
**Master plan:** `docs/superpowers/plans/2026-09-19-sammlerraum-v1-master-plan.md`  
**Canonical product/system spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`  
**SEO/Search Console spec:** `docs/superpowers/specs/2026-09-19-seo-search-console-design.md`

**Implementation branch:** [`work/sammlerraum-v1`](https://github.com/acciento89-bot/sammlerraum/tree/work/sammlerraum-v1) · [Draft PR #1](https://github.com/acciento89-bot/sammlerraum/pull/1). This ledger tracks verified implementation on that branch; code has not been merged into main or deployed. The ledger on main is synchronized after each verified task completion.

This is the handoff/status file for long-running implementation. Update it after every completed and reviewed task.

| Phase | Plan | Tasks | Status | Next |
|---|---|---:|---|---|
| 01 | Platform Foundation | 6 | complete (6/6) | — |
| 02 | Identity, Auth & Policies | 7 | complete (7/7) | — |
| 03 | Collections, Items, Fields & Locations | 8 | complete (8/8) | — |
| 04 | Media & Documents | 6 | complete (6/6) | — |
| 05 | Catalog, Condition & Grading | 7 | complete (7/7) | — |
| 06 | Valuations & Market Data | 6 | in progress (5/6) | Task 6 |
| 07 | Search, Smart Collections & Dashboard | 5 | not started | Task 1 |
| 08 | Import, Export, Insurance & Reports | 7 | not started | Task 1 |
| 09 | Collaboration, Sharing & Audit | 7 | not started | Task 1 |
| 10 | Community, Moderation & Notifications | 8 | not started | Task 1 |
| 11 | AI-Assisted Capture | 5 | not started | Task 1 |
| 12 | Premium & Billing | 5 | not started | Task 1 |
| 13 | Integration, Hardening & Release | 7 | not started | Task 1 |
| 14 | SEO & Google Search Console | 7 | not started | Task 1 |

**Total:** 91 implementation tasks.

## Verified task checklist

- [x] P01 T01 — Workspace and test harness
- [x] P01 T02 — Validated environment configuration
- [x] P01 T03 — Prisma/PostgreSQL and database health
- [x] P01 T04 — Queue abstraction and worker runtime
- [x] P01 T05 — Next.js shell, DE/EN, request IDs and health
- [x] P01 T06 — Docker Compose and CI
- [x] P02 T01 — Identity/profile schema and privacy-safe service
- [x] P02 T02 — Password, Google, Apple and passkey adapters (live provider blockers below)
- [x] P02 T03 — Session/recovery management constraints
- [x] P02 T04 — Shared API errors and request validation
- [x] P02 T05 — Deny-by-default policy engine
- [x] P02 T06 — OpenAPI and auth E2E smoke
- [x] P02 T07 — Localized authentication, profile and security UI
- [x] P03 T01 — Collection and hierarchy models
- [x] P03 T02 — Collectible items, acquisition lifecycle and quantity splitting
- [x] P03 T03 — Structured identifiers and tags
- [x] P03 T04 — Typed custom field definitions and values
- [x] P03 T05 — Hierarchical storage locations and movement history
- [x] P03 T06 — Collection/item REST APIs and policy enforcement
- [x] P03 T07 — Responsive collection and item management UI
- [x] P03 T08 — Printable storage labels and protected scan-to-location flow
- [x] P04 T01 — Storage provider and persistent local implementation
- [x] P04 T02 — Media/document models and upload validation
- [x] P04 T03 — Image variant worker
- [x] P04 T04 — Protected media and document reads
- [x] P04 T05 — Safe unlink, retention and orphan cleanup
- [x] P04 T06 — Media gallery and private document UI
- [x] P05 T01 — Category templates and typed catalog attributes
- [x] P05 T02 — Revisioned catalog entries, variants, identifiers and attributes
- [x] P05 T03 — Moderated catalog proposals, authoritative application grants and rollback audit
- [x] P05 T04 — Category-specific exact condition schemes and independent personal condition
- [x] P05 T05 — Private external grading records and single-specimen certificate integrity
- [x] P05 T06 — Safe optional personal catalog links and bounded canonical discovery
- [x] P05 T07 — Localized catalog, proposals, moderation, condition and grading UI
- [x] P06 T01 — Canonical money and private append-only manual valuations
- [x] P06 T02 — External market provider interface and immutable observations
- [x] P06 T03 — Idempotent bounded market synchronization and safe worker lifecycle
- [x] P06 T04 — Add source comparison API and item valuation summary
- [x] P06 T05 — Add valuation history UI contracts and localization

**Verified completion: 39/91 tasks.** Later tasks remain open as listed in the phase table and detail plans.

## Update rule

After each task is implemented, tested, reviewed and committed:

1. tick that task's boxes in its plan;
2. update this ledger's Status/Next cell;
3. append the implementation commit and review outcome below;
   synchronize this ledger to main after each verified completion, as explicitly requested by the user; implementation continues on the feature branch;
4. do not mark a phase complete until all tasks in that phase are green;
5. when an external credential/provider action blocks only one task, record it as an external blocker and continue with the next independent task instead of stopping the entire project;
6. production deployment, Search Console DNS verification, live Stripe/provider actions and any irreversible external change require explicit user approval.

## External blocker log

- Phase02 Task2: live Google OAuth requires real client/consent configuration and callback registration.
- Phase02 Task2: live Apple sign-in requires Services ID, domain/return URL configuration, signing key and current client-secret JWT.
- Phase02 Task2: live verification/reset email delivery requires SMTP credentials and permitted sender.
- Code/adapters and fake-backed tests are implemented; exact variables/callbacks/manual steps: `docs/authentication-setup.md`. These live checks do not block independent implementation. No real provider account/action performed.

## Implementation log

Phase 01 is complete and secured on GitHub. Subsequent task evidence and historical recovery records follow.

## Runtime recovery — 2026-09-20

The Work runtime disconnected during Phase 01 Task 5 and restarted without the local checkout. A fresh clone confirms origin still contains only the approved plans. No surviving local checkout was found.

Prior local-only task commits reported in the conversation were 2a229b4 (Task 1), 6897056 (Task 2), b2e3c90 (Task 3), and 2fb77dd (Task 4). They are not present in this clone or its remote branches and must not be represented as recovered code. Task 5 had no commit. The earlier push was rejected by automatic approval review; the user subsequently requested continuation after the explicit push-permission question.

Recovery must preserve the approved scope and task-by-task TDD/review discipline. Reconstruct only missing implementation, carry forward the recorded review fixes, and verify fresh results. Persist reviewed task commits to the feature branch when authorized; never overwrite main. Do not mark the previous implementation as present without evidence.

Recorded review fixes to preserve:
- Task 1: Vitest root test.projects imports the required workspace definition; ignore dependencies/build output/secrets. Real app dev targets arrive in Tasks 4/5.
- Task 2: redacted server env errors, PostgreSQL URL, HTTP(S) origin and absolute uploads path validation; public client config whitelist; test env before eager server import.
- Task 3: Prisma 7 config/adapter, environment-free client factory used by test DB helper, production singleton separated; test helper refuses production/non-test DBs.
- Task 4: validate persisted pg-boss exclusive queue policy, recover active singleton ID after nullable send, listen for queue errors, preserve startup error health, expose lifecycle-managed loopback health endpoint.
- Task 5: DE/EN shell, cookie-over-Accept-Language preference, bounded request IDs, database-aware 200/503; unsupported locale must return 404. Last smoke logged Next NoFallbackError despite 404, requiring investigation.

Local runtime previously lacked Docker/psql. Live database/container validation was not performed and remains a real gate, not a pass.

### Recovered Phase 01 Task 1

- Fresh implementer and fresh independent reviewer; spec/quality PASS without findings.
- Actual RED: Vitest 3.2.7 smoke assertion failed before manifests. GREEN: 1/1 passed after implementation; controller rerun passed.
- Frozen pnpm10.17.1 install, eight-package typecheck/lint/scaffold build, formatting and manifest assertions passed.
- Root project config removes workspace deprecation; generated outputs/secrets ignored. Real dev targets remain Tasks4/5 dependencies.
- Commit: chore: scaffold Sammlerraum workspace (recovered).

### Recovered Phase 01 Task 2

- Previous recovered Task 1 remote commit: `413c293`.
- Fresh implementer and fresh reviewer: spec/quality PASS, no findings.
- RED missing server/client modules recorded; GREEN focused 20/20, controller rerun 20/20; eight-package typecheck/lint and staged diff check passed.
- Redacted server validation, strict postgres URL/http(s) origin/absolute uploads path, client-only origin whitelist, eager startup guard and test-only pre-import environment.
- Commit: feat: add validated environment configuration (recovered).

### Mandatory persistence rule (user confirmed 2026-09-20)

Every completed and independently reviewed task must be checked off in its detail plan, recorded in this ledger, committed and saved to GitHub. Verify the remote tree before starting the next task. Do not leave completed work only in a transient runtime. An unverified or review-pending task stays unchecked. Production deployment remains prohibited without separate approval.

### Recovered Phase 01 Task 3

- Task 2 remote commit: `951d950`.
- Prisma7.10.0 config/client/adapter and initial SystemMetadata migration generated/validated. Environment-free factory separated from production singleton.
- RED/GREEN baseline plus regression for actual production bypass via test option; fixed to reject either production source. Fresh review and scoped rereview approved.
- Controller db tests5/5; prior full suite25/25 before new regression; typecheck/lint, frozen pnpm10.17.1 install, staged diff check passed.
- No live PostgreSQL migration/query: Docker/psql unavailable. Integration verification remains open.
- Commit: feat: establish PostgreSQL foundation (recovered).

### Recovered Phase 01 Task 4

- Task 3 remote commit: `761b44d`.
- Fresh implementer/reviewer, spec+quality Approved with no findings; prior pg-boss and worker regression fixes preserved.
- RED missing modules/port validation/CLI export; GREEN 45 full tests, controller15 queue/worker tests; recursive typecheck/lint/build and diff check passed.
- pg-boss12.33.2 exclusive persisted-policy verification, active singleton recovery without resend, generic error listeners, sticky unhealthy startup state.
- Real worker dev/build/start, CJS production runner, probeable loopback health endpoint; built-bundle fake-dependency smoke200 and clean lifecycle stop.
- No live PostgreSQL/container verification claimed; remaining infrastructure gate recorded.
- Commit: feat: add PostgreSQL queue and worker runtime (recovered).

### Phase 01 Task 5 — localized web shell and health

- Task 4 remote commit: `15c9754`; intermediate Task5 WIP separately backed up as `98ca825` on work/sammlerraum-v1-checkpoint.
- Next16.3.5/React19.3.0/next-intl4.14.5 localized DE/EN shell, cookie/Accept-Language/de locale negotiation, invalid locale404, safe request IDs, DB-aware health200/503 with no-store.
- TDD RED/GREEN; controller focused10/10, full suite55/55; typecheck/lint/production build and real next start smoke passed.
- Smoke verifies DE and EN content/cookies, cookie precedence, unsupported locale404 without fallback warnings, unreachable DB503 and request-ID preservation/generation.
- Fresh independent reviewer: spec+quality Approved without findings; TSX coverage and strict TS options verified.
- Task1 web dev dependency resolved with actual Next dev/build/start.
- Commit: feat: add localized web shell and health endpoint.

### Phase 01 Task 6 — reviewed candidate, CI validation pending

- Task 5 remote commit: `1e213ff`; tasks1–5 checked off and secured. Draft PR: https://github.com/acciento89-bot/sammlerraum/pull/1.
- Docker/Compose/CI implemented. Static RED/GREEN and local test/typecheck/lint/build checks passed; controller final production-config tests5/5.
- Fresh review found upload persistence mismatch, worker probe-port mismatch and baked public origin. All reproduced/fixed; scoped rereview approved CODE CANDIDATE only.
- Uploads always /data/uploads in Compose matching shared volume; worker listener/probe3001; required public origin build argument wired consistently. Runtime secrets remain external.
- CI candidate is backed up now to run real PostgreSQL17 migrations/health/queue and both Docker builds. Task6 remains unchecked until those gates pass.
- Intermediate checkpoints are not completion evidence. Last WIP checkpoint before review:3e05277 on work/sammlerraum-v1-checkpoint.

### Phase 01 Task 6 and phase regression — COMPLETE

- Reviewed code commit `79b0f55f7d34bd48ad40cee9ef72f7db0130f78f`.
- CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35515621740 (job106090953281).
- Exact evidence:60 unit/static tests passed;2 PostgreSQL integration tests passed separately (health and pg-boss singleton). All migrations applied successfully against PostgreSQL17.
- Frozen install, Prisma generation, lint, typecheck, workspace production build, Compose rendering/verification and BOTH web/worker Docker image builds passed.
- Fresh task reviewer updated verdict to final APPROVED after remote gates. No findings remain in this task.
- Phase01 larger regression gates passed. Earlier live PostgreSQL/Docker blockers are resolved through CI; local Docker remains unavailable but no longer blocks this phase.
- Tasks1–6 checked off. Next:Phase02 Task1, privacy-safe identity/profile schema and service.
- Completion commit changes documentation only; [skip ci] avoids rerunning unchanged code builds. CI provenance above remains the tested code commit.

### Phase 02 Task 1 — reviewed candidate, migration CI pending

- Base remote completion commit: `95f1695`; WIP snapshot saved as `4d253a7` on work/sammlerraum-v1-checkpoint.
- Explicit four-field public profile DTO, normalized unique handles, owner-scoped updates, additive UserProfile migration. No login/auth material in profile output.
- TDD RED missing service; GREEN focused2/2. Full local suite62 passed,3 DB-gated skipped; lint/typecheck/build, Prisma validate/generate and diff check passed. Controller focused7 passed,1 DB-gated skipped.
- Fresh independent reviewer: spec PASS, quality PASS, no findings. Code approved; completion stays unchecked until remote migration/persistence gate succeeds.
- Ruling: UserProfile stores unique scalar userId until Task2 creates auth User and adds FK — preserves task sequence; cost if wrong: additive relation adjustment.
- Ruling: local migrate dev cannot connect because PostgreSQL is unavailable; Prisma generated additive SQL offline, real PostgreSQL17 migrate deploy and persistence test run in CI — cost if wrong: generator parity rework. Published initial migration unchanged.
- Ruling: package exports/dependencies and explicit CI test invocation updated as supporting files — necessary for real adapter coverage; cost if wrong: reversible supporting-file rework.

### Phase 02 Task 1 — COMPLETE

- Reviewed implementation secured at `970649762a9394f1857fde858c36bb76044f5319`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35516444676 (job106093088492).
- PostgreSQL17 applied identity_profile migration;62 unit/static tests passed; dedicated integration run5 passed (3 real DB tests plus2 profile unit tests). Lint/typecheck/build, Compose and both Docker builds passed.
- Fresh review spec/quality approved without findings; required database gate resolved. Task1 boxes checked, next Task2.
- Completion is docs-only with [skip ci]; code remains identical to successful CI commit.

### Phase 02 Task 2 — reviewed authentication candidate, CI pending

- Base completion remote `a682438`; latest WIP checkpoint `83940fb` verified exact tree.
- BetterAuth1.7.5 password/verification/reset, Google, Apple, passkeys; explicit-only linking, DB-backed rate limits, uncached sessions; TLS-enforced SMTP adapter with injected test sender.
- CLI-generated explicit auth models and additive migration with UserProfile FK. Published migrations unchanged. Configuration/env/callback setup documented without live secrets.
- TDD RED missing modules and3 reproduced security failures. GREEN initial full67 tests,3 DB-gated skips; final focused5/5 (controller repeated), typecheck/lint/production build passed.
- Fresh reviewer found SMTP downgrade and plaintext ID-token storage. Both fixed and scoped rereview spec/quality APPROVED; no findings remain. TLS certificate validation mandatory; account create/update hooks drop unused ID tokens, actual BetterAuth adapter persistence test proves absence. Access/refresh encryption retained.
- Code candidate saved for PostgreSQL17 migrate deploy, integration and Docker CI. Task2 remains unchecked until CI passes; live provider/SMTP checks remain external blockers.
- Task3 must implement recovery-guarded removal; default account unlink/passkey-delete paths are disabled meanwhile.

### Phase 02 Task 2 — IMPLEMENTATION COMPLETE

- Reviewed implementation saved at `2ff2bf62eb7b4b4edae041dd9f3967bd02b12b5c`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35518105269 (job106097369426).
- All3 migrations applied on PostgreSQL17;69 unit/static tests passed; dedicated integration run5 passed (3 real DB tests plus2 profile units). Lint/typecheck/workspace build/Compose and both Docker builds passed.
- Fresh spec/quality review approved after both security findings fixed and tested. Task2 boxes checked. No live Google/Apple/SMTP success claimed; external configuration blockers above remain.
- Next:Task3 account session/recovery controls. Docs-only completion commit [skip ci], same tested code.

### Phase 02 Task 3 — reviewed account-security candidate, CI pending

- Base remote `6463899`; current WIP checkpoint `ad2a579` includes final route-export and row-lock changes, exact tree verified.
- Prisma-backed owned stable-ID session listing/revocation, strict sanitized metadata, same-origin no-store account APIs, fresh-session guard for factor removal.
- Last verified login/recovery factor protected atomically by per-user PostgreSQL row lock at ReadCommitted; native bypass/removal/token-session endpoints disabled.
- TDD RED missing service plus native-path/sanitization/transaction regressions. Local78 tests passed,5 DB-gated skipped; focused controller12 passed,2 DB-gated skipped. Lint/typecheck/build/frozen install/Prisma validate/diff check passed.
- Fresh reviewer: spec APPROVED, quality APPROVED, zero findings. Candidate saved for real PostgreSQL concurrent-removal and BetterAuth getSession-after-revocation tests in CI; task stays unchecked until these pass.
- Verified factor definition: persisted password with verified owner email; configured Google/Apple account after provider flow; verified registered passkey. Unknown providers do not count.
- Ruling: temporary API error mapping isolated in account-security-routes.ts until Task4 shared wrapper — preserves planned ordering; cost if wrong: small wrapper integration rework.

### Phase 02 Task 3 — COMPLETE

- Reviewed code remote `468c4c8b4e57f0c8404f62fad1d703fab1aa8014`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35519395789 (job106100740769).
- 78 unit/static tests passed; dedicated integration run12 passed, including5 actual DB tests. PostgreSQL confirmed concurrent removals retain one verified factor and BetterAuth getSession returns null after stable-ID revocation.
- Migrations, lint/typecheck/build, Compose and both Docker builds passed. Fresh independent spec/quality review approved with zero findings.
- Task3 checked off; next Task4 shared API validation/errors. Docs-only completion preserves tested code.

### Phase 02 Task 4 — reviewed API-error candidate, CI pending

- Base remote `8648aef`; initial coherent WIP checkpoint `b870f3b`.
- Shared ApiError/contracts/apiRoute; exact code/message/requestId error object, matching header, generic unknown500 and safe validation400, malformed JSON400. Integrated actual account APIs preserving all Task3 security checks and no-store/status/success semantics.
- TDD RED missing contracts plus5 account-integration failures; GREEN initial84 tests/5DB skips, lint/typecheck/frozen install/webbuild.
- Fresh reviewer found immutable Response headers causing valid redirects to become500. Reproduced RED with realResponse.redirect, copied response/headers, GREEN11/11 including controller rerun; typecheck clean. Scoped rereview spec/quality APPROVED, no findings remain.
- Ruling: validation metadata is a bounded sibling object (max16 coarse location/code issues); raw paths may contain submitted record keys and are omitted — preserves privacy and exact error object; cost if wrong: future schema-derived field mapping for richer inline UX.
- Ruling: web uses already-resolved Zod4.6.5 peer, contracts retain4.1.11; error contracts have no Zod runtime dependency — avoids duplicate peergraph; cost if wrong: future version alignment.
- Candidate saved for full CI; task remains unchecked until gate succeeds.

### Phase 02 Task 4 — COMPLETE

- Reviewed code remote `411a0a98de0f43cda432b31228642987a32a2716`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35520453660 (job106103504446).
- 85 unit/static tests passed; dedicated integration run12 passed including5 actual DB tests. All migrations/lint/typecheck/workspace build/Compose and both Docker builds passed.
- Fresh spec/quality review approved after immutable-header regression fixed; no findings remain. Task4 checked off; next Task5 deny-by-default policies.
- Completion docs-only with [skip ci], identical tested code.

### Phase 02 Task 5 — reviewed policy candidate, CI pending

- Base remote `e16db46`; final-fix WIP checkpoint `9aa2767` exact tree verified.
- Exact8-action deny-by-default core; trusted immutable facts, action/resource matching, effective ancestor visibility, actor-bound roles, protected-document/public moderation guards, generic403 assertion.
- TDD RED missing policy; initial97tests/5DBskips and workspace gates green. Review identified private-profile membership overgrant and tests hitting earlier guards; both fixed with RED3 failures then GREEN23/23 including controller rerun. Typecheck/lint/diff checks pass.
- Fresh scoped rereview spec/quality APPROVED; no findings remain. Task stays unchecked until full CI.
- Ruling: facts constructors validate/clone/freeze and privately mark server-derived facts; HTTP/worker loaders must rebuild identity, full ancestry, resource-scoped membership, block/moderation facts from authoritative state — prevents trusting request JSON; cost if wrong: constructor/loader integration rework.
- Ruling: collection editing/member management initially Owner/Admin; item editing Owner/Admin/Editor; member reads Owner/Admin/Editor/Viewer with actor-bound assignment; PROFILE always role:null and only owner/effective-public view — collection roles must not authorize profiles; cost if wrong: explicit role-matrix adjustment in owning phase.
- Ruling: public grant requires PUBLIC resource and every ancestor plus VISIBLE moderation; protected documents have an additional no-public guard. Document-specific visibility and selected grants belong to Phase04/09 loaders/policies — parent visibility is insufficient; cost if wrong: additive document fact refinement.
- Ruling: comments need authenticated visible read access, enabled comments and no interaction block; unknown/malformed/action-kind mismatches return NO_POLICY; assertion always genericFORBIDDEN — no resource-fact disclosure; cost if wrong: explicit new policy branches.
- Ruling: SEO index preference is excluded from authorization, while share/invitation/premium/richer moderation grants remain denied until their owning phases add complete facts — preserves phase scope and privacy; cost if wrong: later additive facts/branches, never implicit public-by-ID UNLISTED.

### Phase 02 Task 5 — COMPLETE

- Reviewed code remote `8c7d09fa495ff07ed17b9b09cba6bf5bdf242b97`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35521737050 (job106106879087).
- 108 unit/static tests passed; dedicated integration run12 passed including5 real DB tests. Migrations, lint/typecheck/workspace build, Compose and both Docker builds passed.
- Fresh spec/quality review approved after profile-role overgrant and test-path gaps fixed. No findings remain. Task5 checked off; next Task6 OpenAPI/auth smoke.
- Completion docs-only with [skip ci]; tested code unchanged.

### Phase 02 Task 6 — reviewed OpenAPI/auth smoke candidate, CI pending

- Base remote `de05da4`; final-fix checkpoint `e9a324b3904a92d5fafacd81024140fc75c7358d` exact tree verified.
- Zod registry generates OpenAPI3.1 at `/api/openapi.json`; session metadata only, safe error alternatives/500, deployed HTTP/HTTPS cookie name.
- Playwright HTTP smoke exercises real Better Auth/Prisma/session handler: registration, captured verification mail, rejection before verification, verification, login and authenticated sanitized session list. Mail capture exists only in test dependency injection; no production bypass.
- TDD RED missing builder/route/harness, then local111 tests passed/5 DB-skips, lint/typecheck/build green. Review found400-envelope mismatch, HTTPS-cookie mismatch and setup-failure resource leak; all fixed with RED→GREEN regressions. Focused9/9, lint/typecheck green; controller reran5 relevant tests.
- Fresh scoped review spec/quality APPROVED, all3 findings addressed. Playwright discovery restricted to e2e specs after reproducible discovery failure.
- Ruling: Task6 tests real handlers over a loopback HTTP harness; Task7 adds actual Next/browser UI journeys once pages exist — respects task order; cost if wrong: additional dispatch integration coverage.
- Ruling: no local PostgreSQL; GitHub CI must execute `RUN_AUTH_E2E=1` against migrated PostgreSQL17 with a passed, not skipped, test before completion — local skip is not success evidence; cost if wrong: CI/harness correction.
- Task remains unchecked until full CI and real auth smoke succeed.

### Phase 02 Task 6 — COMPLETE

- Reviewed code remote `8df9a828e287e1fc2eb5c0f586851e3e0635c6fb`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35523415832 (job106111327853).
- 113 unit/static tests passed; dedicated integration run12 passed including5 actual DB cases. Required Playwright authentication smoke: **1 passed**, not skipped, on migrated PostgreSQL17.
- Migration/lint/typecheck/workspace build/Compose and both Docker builds all passed. Fresh review approved after all3 findings fixed; no findings remain.
- Task6 checked off. Next Task7 localized authentication/profile/security UI. Completion docs-only with [skip ci]; tested code unchanged.

### Phase 02 Task 7 — tests-only RED checkpoint, implementation pending

- Base `78a9b00`. Browser journeys and test-only TLS SMTP/Next harness prepared; CI installs Chromium. Production code unchanged.
- Local syntax/format/typecheck checks pass. Local browser run cannot establish meaningful RED because Chromium/PostgreSQL are absent; GitHub CI must demonstrate missing UI failure before implementation.
- Runtime-generated one-day localhost certificate/key remain in test temporary files; no committed credentials or production mail bypass.
- Checkpoint is intentionally failing and not reviewed completion. No Task7 checkbox is ticked.

### Phase 02 Task 7 — reviewed UI candidate, CI pending

- Tests-only RED remote `8d358da1096102ae9763de465b3b9674ebb5fb83`; CI35524209712/job106113423059 proved3 browser failures on absent UI while existing API smoke passed. No implementation preceded this meaningful RED.
- Complete DE/EN login/register/profile/security UI, verify/resend/reset, Google/Apple sign-in/link entry points, passkey add/sign-in/remove, own-profile create/update, sanitized methods/sessions and guarded revocation. Safe handle conflicts; no login-email-derived public handle.
- Test-only local TLS SMTP captures real Next verification/reset mail, with runtime-generated temporary cert/key and trust only in Next test child; production TLS/verification unchanged. Live providers remain the documented external blockers.
- Local118 tests passed/5 gated DB skips plus workspace typecheck, web lint/productionbuild. Backend RED missing own-profile/methods interfaces and duplicate-handle conflict then GREEN; final focused20pass/2DBskips.
- Fresh review found reset-to-login transition, expired freshness/error mapping, stale session list after reauth, provider labels and profile error presentation. All5 fixed; scoped rereview caught provider-key namespace regression, reproduced with actual catalogs then fixed. Final8/8 state/catalog tests pass including controller rerun.
- Fresh spec/quality rereview APPROVED after2 fixrounds; no open findings. Final real PostgreSQL/Chromium/browser GREEN remains required before checkoff.
- Ruling: stale-session response makes reauth visible; client expiry timer improves UI while server remains authority. Password reauth reloads sanitized sessions and current marker; OAuth/passkey sign-in retain native supported routes — avoids trusting UI state; cost if wrong: additional provider-specific reauth UX.
- Ruling: actual-browser automation uses virtual WebAuthn and mocked third-party handoff; live consent/callback checks remain external and do not block independent work — no credentials fabricated; cost if wrong: live integration adjustments.
- Final-fix checkpoint `0d4836a` preserved first fixround before catalog-only correction; task completion remains unchecked pending CI.

### Phase 02 Task 7 — CI verification correction 1

- Candidate `b3266a8`; CI35525565857/job106116994979 passed126 unit tests,15 dedicated integration tests including5 real DB cases, lint/typecheck/build. Browser2 passed/2 failed because password button substring selector also matched passkey sign-in.
- Three password-submit selectors now use exact accessible names; no coverage removed. Playwright lists all4 cases, typecheck/lint pass. Scoped review approved selector-only correction. Real browser rerun still required; Task7 unchecked.

### Phase 02 Task 7 — CI verification correction 2

- Candidate `aaa8d11`; CI35525870450/job106117791780 passed126unit/15integration/build and3 of4 browser journeys including password reset. Last journey raced a pending Google-link redirect with immediate navigation back.
- Test now waits for actual successful link-social response and deterministic external Google handoff navigation/DOM before returning. Only external provider destination mocked; no sleeps, production changes or removed assertions. Scoped review approved;4cases discovered,lint/typecheck green. Final CI remains required; unchecked.

### Phase 02 Task 7 — CI verification correction 3

- Candidate `fd1f3e9`; CI35526201946/job106118675673 passed126unit/15integration/build and3 browser cases. Remaining case passed OAuth handoff and created its passkey, then ambiguous device-name text matched both name and remove button.
- Presence/absence and removal selectors use exact names; remaining spec selectors audited against rendered text. No assertions removed/product changes. Scoped review approved; localcollection/typecheck/lint green. Awaiting complete4/4 browser gate; Task7 unchecked.

### Phase 02 Task 7 and phase regression — COMPLETE

- Final tested remote `e1e38f88c370e2d50434c63c3ac979a391f2f449`; implementation `b3266a8`, verified test corrections `aaa8d11`/`fd1f3e9`/`e1e38f8`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35526502084 (job106119479979).
- Broad phase regression:126 unit/static tests passed; dedicated integration run15 passed including5 real DB cases; all4 real PostgreSQL/Chromium auth journeys passed (33.3s), none skipped. Migrations, lint, typecheck, workspace build, Compose, web and worker Docker builds passed.
- Browser coverage includes real verification/reset mail through strict TLS fixture, DE/EN/social entry points, profile creation, virtual-WebAuthn enrollment/sign-in/removal, server-stale reauth and refreshed current session, and another-session revocation.
- Fresh task review plus scoped fix reviews approved, all5 product findings and3 evidenced CI-test defects fixed. No open review findings. Task7 boxes checked; Phase02 complete7/7.
- Live Google/Apple callback/consent and real SMTP remain explicitly documented external blockers; they do not block Phase03. No production deployment/provider action occurred.
- Next: Phase03 Task1 collection hierarchy/membership schema. Completion documentation only uses [skip ci]; tested code unchanged.

### Phase 03 execution rulings from existing detail-plan preflight

- Ruling: Task1 canonical moveCollectionNode also exposes the plan-example moveNode alias to the same implementation — resolves naming mismatch without duplicate logic; cost if wrong: compatibility alias removal.
- Ruling: owner-authorized writes now; Phase09 adds authoritative resource-scoped membership — no caller-provided roles; cost if wrong: later policy adapter refinement.
- Ruling: Tasks3/5 add owned additive migrations despite omitted migration commands — schema changes must deploy; cost if wrong: migration correction before publication only.
- Ruling: Task5 introduces privacy-safe public item projection required by its test, reused in Task6; Task6 includes thin customfield/location/identifier/tag endpoints consumed by Task7 — resolves producer/consumer omissions without reducing scope; cost if wrong: interface organization refactor.
- Ruling: Task7 requires actual mobile/desktop browser gates; scanner result remains an unconfirmed identifier proposal — matches full plan; cost if wrong: testfixture adjustments.
- Ruling: internal label-token resolution may identify a location, but public scan routes authorize before any metadata/redirect disclosure; token alone grants no access — preserves privacy; cost if wrong: resolver interface refinement.
- Ruling: hierarchy mutations lock the owned collection root before descendant validation/write in short ReadCommitted transactions — prevents concurrent inverse cycles; cost if wrong: lock granularity refinement.
- Ruling: absent local PostgreSQL/Docker, schema-diff migration generation/validation runs locally and real migration/integration runs in CI before checkoff — no published migration rewrites; cost if wrong: CI correction latency.

### Phase 03 Task 1 — hierarchy candidate, real database gate pending

- Base `6ebbc1a`; coherent schema/integration WIP `8af748b59117cc21ee242a44e36d495a3aec7636`.
- Added Visibility/Collection/CollectionNode, PRIVATE defaults, indexed owner/collection/composite same-collection parent FKs; additive migration `20260920195000_collections_hierarchy`. Prisma schema valid and generated migration byte-matches final schema diff.
- Trusted-actor owner-scoped services create collection/node, moveNode/moveCollectionNode and internal root-first full ancestry visibility. Root row locks serialize mutations; recursive queries track visited UUID paths and reject corrupted/cyclic ancestry. UNLISTED never becomes PUBLIC.
- Initial missing-module cycle test RED thenGREEN; final10 unit tests pass/4DBskips. Additional mutation regressions proved foreign-parent/missing-root/descendant-cycle guards after their implementation; these mutation checks are not represented as tests preceding those guards.
- Full local136 tests passed/9DBskips; lint/typecheck/configured productionbuild, Prisma format/validate/generate and diff checks pass. Controller focused10/10 pass. Local migrate dev attempted once, unavailable PostgreSQL prevented execution.
- Four real CI cases: recursive descendant rejection, cross-collection service+FK rejection, full UNLISTED ancestry, simultaneous inverse moves. Task stays unchecked until migration and these cases succeed.
- Fresh reviewer spec/quality APPROVED with no findings. Reviewed candidate ready for full CI; no completion claim before real DB gate.

### Phase 03 Task 1 — hierarchy DB gate passed; auth regression diagnostic pending

- Candidate `f1ef9fe`; CI35528009956/job106123468688 applied new migration and passed136unit/29dedicated integration tests, including4 new hierarchy DB cases. Typecheck/lint/build passed.
- Existing auth browser journey intermittently left2 sessions after post-reauth revoke (expected1);3 other cases passed, whereas previous phase gate had4/4 success. Root cause is not established; no hierarchy defect inferred.
- Original auth implementer investigated, added safe exact DELETE-response204 assertion before existing DOM assertion to distinguish server failure from stale UI. Scoped reviewer approved diagnostic; no product/security changes or sensitive logging. Full gate remains open, Task1 unchecked.

### Phase 03 Task 1 — auth regression root cause fixed, CI pending

- Diagnostic `c5fdcf1`, CI35528352241/job106124380928: no matching session DELETE response after reauth;3 browser cases passed. This narrowed the failure to client navigation/request execution.
- Verified installed Better Auth1.7.5: email sign-in callbackURL returns redirect:true and client plugin sets window.location.href. In-place security reauth supplied callbackURL while concurrently reloading session state; pending navigation interrupted the next action.
- Reauth now supplies only email/password, preserving normal login/reset/OAuth redirects. New test observedRED thenGREEN; full137 unit tests pass/9DBskips; focusedcontroller9/9, lint/typecheck/collection pass.
- Browser regression asserts actual reauth redirect:false/noURL/stablelocation, refreshed sessions, DELETE204 and final count1. Scoped reviewer approved causal minimal fix without new findings; fullCI still required before Task1 checkoff.

### Phase 03 Task 1 — COMPLETE

- Hierarchy implementation remote `f1ef9fe2f04a083aa331a6ad4188e01b59fe9c8a`; final regression-fixed tested code `da330457ea18aab0b47d03bc4b1ca4c56be4227b`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35528856401 (job106125740859).
- 137 unit/static tests passed; dedicated integration29 passed including9 actual DB cases (4 new hierarchy cases). All4 browser journeys passed33.6s, including explicit nonredirecting reauth+DELETE204 regression. Migrations/lint/typecheck/workspace build/Compose/both Docker builds passed.
- Hierarchy fresh spec/quality review approved without findings. Auth regression root-cause fix separately reviewed and verified; no open findings. Task1 checked off; next Task2 collectible item lifecycle/acquisition/quantity split.
- Documentation-only completion with [skip ci]; tested code unchanged. No production/provider actions.

### Phase 03 Task 2 — reviewed item lifecycle candidate, CI pending

- Base `509c104`; coherent schema/service/test checkpoint `a0389cd99453db6d10aa20cf02cd28eb0a9664f3` exact remote tree verified.
- Added CollectibleItem, acquisition/trade enums, public description/private notes, positive quantity, canonical DATE, safe minor-unit money, visibility and lifecycle timestamps; new additive `20260920204000_collectible_items` migration with same-collection node FK, indexes and quantity/money checks. Published migrations unchanged.
- Owner-scoped create/update/archive/split use short ReadCommitted transactions and fresh item row locks. Split preserves quantity and acquisition unit price, rejects invalid/inactive counts, and rolls back decrement if creation fails.
- Ruling: purchaseAmountMinor is per-unit acquisition price, JS-safe nonnegative integer at boundary and BIGINT in DB; split copies unit price so quantity*price total stays constant — differing purchase prices remain separate rows; cost if wrong: unit-vs-lot migration/UX relabel. Future UI must label this as unit price.
- Ruling: bounded acquisition enum PURCHASE/GIFT/TRADE/INHERITANCE/FOUND/OTHER; trade metadata NOT_FOR_TRADE/OPEN_TO_TRADE/FOR_SALE/RESERVED, no checkout behavior — satisfies acquisition and sale/trade status; cost if wrong: additive enum refinement.
- Ruling: archivedAt/disposedAt are independent; archiving a disposed item is valid, splitting either inactive state is rejected — plan requires both dates but no exclusivity; cost if wrong: explicit lifecycle refinement.
- Initial split RED missing module thenGREEN; added behavior tests observed7 expected failures before implementation; FOR_SALE/disposed archival corrections separately RED→GREEN. Final9unit/3DBskips; full146unit/12DBskips, lint/typecheck/configured productionbuild/Prisma validate+generate/rootformat green. Controller focused9/9 pass.
- Tiny existing pnpm-workspace quote formatting normalized; no content change. Required migrate dev attempted once, unavailable local PostgreSQL prevented apply. Three real DB cases in CI cover concurrency/conservation, rollback, ownership/FKs/DB constraints and canonical DTOs.
- Fresh reviewer spec/quality APPROVED with no findings. Task remains unchecked until real PostgreSQL17 migration/integration and full CI pass.

### Phase 03 Task 2 — COMPLETE

- Reviewed/tested remote `62139df7e413c63d52719740fc09aac615af2d41`.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35530315747 (job106129631374).
- 146 unit/static tests passed; dedicated integration41 passed including12 actual DB cases (3 new item cases). All4 browser journeys passed26.6s. Migration/lint/typecheck/workspace build/Compose/both Docker builds passed.
- Fresh spec/quality review approved without findings. Task2 checked off; next Task3 structured identifiers/tags. Completion documentation only uses [skip ci]; tested code unchanged.

### Phase 03 Task 3 — COMPLETE

- Initial tests-only RED `87b3e99`, CI35531276807/job106132190916: exact focused command failed on missing identifier-service. Implementation `312b53e1`; canonical formatter correction `f5fea02`; review fixes `897ebe6` and `64768d5`.
- Additive `20260920213000_item_identifiers_tags` migration, item/type/normalized-value identifier uniqueness, owner-scoped reusable tags and join rows. Leading zeroes preserved; owner-filtered item row locks and short ReadCommitted atomic replacements; foreign/missing items share safe errors.
- Fresh review: spec PASS, initial quality findings fixed. Canonical tag acquisition prevents reverse-list deadlocks; NUL rejected before DB; collision-proof identifier tuple keys; StoredTag DTO name; fixture cleanup from setup start; redundant permanent CI runs removed. Second scoped review caught mixed-type ordering regression, reproduced RED then fixed GREEN; final spec/quality PASS with no findings.
- Review-fix RED: three expected failures; focused GREEN7/7, then mixed-order RED and GREEN8/8. Local items16 passed, lint/typecheck/diff check clean. Actual DB tests cover owner isolation, cross-item/cross-owner identifier reuse, rollback and reversed-order concurrent tag writes.
- Full final CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35532984136 (job106136853293), tested commit `64768d5729e53f76198a014af0ae1747abce1564`.
- 154 unit/static tests passed; dedicated integration52 passed including15 actual DB cases (3 identifier/tag cases); all4 browser journeys passed28.4s. Migration/lint/typecheck/workspace build/Compose/both Docker builds passed.
- Ruling: exact focused task commands were executed for RED/GREEN; permanent CI retains full suite plus explicit real DB invocation without duplicate focused/item unit steps — preserves verification while removing triplicate runs; cost if wrong: restore explicit CI steps.
- Runtime disconnected after Task2. Remote GitHub trees/commits and Actions preserved implementation/TDD/review until runtime recovered; fresh checkout matched remote exactly. No completed work was lost. Approved report snapshots preserved on checkpoint branch `1ec2a8968f18fdd44b82695597d0b10cd2beaec2`.
- Task3 checked off; next Task4 typed custom fields. The user-requested main ledger and feature ledger are synchronized; code remains on the feature branch, no production/provider action.

### Phase 03 Task 4 — COMPLETE

- Implementation `8de56cd2ba832d8ad26fc983082e3ad4ca60c2b2`; reviewed test correction/final tested code `8c3aac8eefe58b2ca5e1cf0cb9847be7a6b09f85`.
- All10 required field types, collection-scoped definitions/options, dedicated typed columns, same-collection/type composite FKs, typed-shape/range checks and relational ordered selections. Owner-scoped short transactions; absent/foreign/cross-collection targets share CUSTOM_FIELD_NOT_FOUND. No public projection or routes introduced.
- Additive `20260920223000_custom_fields` migration: all25 generated schema-diff statements present plus4 intentional check constraints; published migrations unchanged. Prisma format/validate/generate passed. Required local migrate-dev attempted once; unavailable PostgreSQL resolved by actual CI deployment/round-trips.
- Actual TDD: missing-service RED;26 validation failures;6 persistence/authorization failures;2 date/normalized-name edge failures, all followed by GREEN. Local35 focused,52 focused-plus-items and189 full unit tests passed; lint/typecheck passed.
- Fresh review spec PASS; two quality findings fixed: Prisma7.10 adapter maps PG check SQLSTATE23514 to P2039 rather than assumedP2004, now test asserts structured driver cause and exact CustomFieldValue_typedShape_check; fixture cleanup starts before setup and registers each owner immediately. Scoped rereview spec/quality PASS, no findings remain.
- Full final CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35534527758 (job106141041269).
- 189 unit/static tests passed; dedicated integration88 passed including16 actual DB cases; all4 browser journeys passed32.5s. Migration/lint/typecheck/workspace build/Compose/both Docker builds passed. Database case exercises all10 types, clearing, selection order, ownership, cross-collection service/FK rejection and typed-shape checks.
- Ruling: DECIMAL API values are canonical strings bounded by numeric(38,18), rejecting excess precision instead of rounding — avoids JavaScript precision loss; cost if wrong: explicit future precision migration/contracts adjustment.
- Ruling: INTEGER is a safe integer number; MONEY uses existing nonnegative safe amountMinor plus supported uppercase ISO currency; DATE is a real YYYY-MM-DD from year0001 — consistent canonical boundaries; cost if wrong: additive validation/contract refinement.
- Ruling: selection API values use canonical option labels, persisted as definition-scoped option IDs; multi-select order retained and duplicates removed — supports current create/set API without premature edit semantics; cost if wrong: later versioned option-edit API.
- Ruling: null explicitly clears/deletes a value row; empty multi-select is a present valid selection — avoids ambiguous all-null scalar values; cost if wrong: clearing contract adjustment.
- Approved report/review snapshot `c20b7fc7317df6d2d2cf59807657eb4356daf753` on checkpoint branch. Task4 checked off; next Task5 hierarchical private locations/history. Main and feature ledgers synchronized; no deployment/provider action.

### Phase 03 Task 5 — COMPLETE

- Implementation `e3e463e5df5a5f8efa48938326ed29198c026ba7`; final reviewed/tested fix `971cec14d7e14c9058599fa52993713eeb3ca9c4`.
- Owner-scoped private-default location trees, stable UUID/256-bit QR token, owner-row-locked cycle-safe moves, owner-only direct contents, atomic current-location FK plus movement history. Additive `20260920233000_storage_locations` migration backfills item ownerId from collection and enforces composite ownership FKs; published migrations unchanged.
- Explicit-whitelist public item query uses one recursive database statement plus trusted policy facts, rejecting PRIVATE/UNLISTED at item/collection/any ancestor, corrupt or incomplete ancestry and inactive items. No locations, tokens, history, notes or purchase/insurance/document data in public DTO.
- Actual RED missing item-query before implementation;201 initial unit tests passed. Review reproduced same-location assignment bug RED, then rejected all unchanged assignments before writes; added X-to-Y and Y-to-null current/history tests with rollback coverage. Final203 unit tests passed; lint/typecheck/Prisma validate/generate/diff clean.
- Fresh review found restricted-history fixture teardown, false X-to-X history and missing movement/unassignment coverage. All3 fixed; scoped rereview SPEC PASS / QUALITY PASS with no findings. No schema constraints weakened or published migration rewritten.
- Full final CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35536014090 (job106145057618).
- 203 unit/static tests passed; dedicated integration105 passed including19 actual DB cases (3 location cases); all4 browser journeys passed35.1s. Migration/lint/typecheck/workspace build/Compose/both Docker builds passed.
- Ruling: locations belong to an owner and may span that owner's collections; item ownerId is backfilled and FK-bound to collection ownership — prevents cross-owner location/history links at DB level; cost if wrong: explicit future ownership-transfer workflow.
- Ruling: location types ROOM/CABINET/SHELF/DRAWER/BOX/OTHER; creation defaults PRIVATE; QR token stays stable and never grants access — matches physical hierarchy and protected scan flow; cost if wrong: additive type refinement.
- Ruling: unchanged assignment returns ITEM_LOCATION_UNCHANGED without any history/write — history records real movement; cost if wrong: explicit idempotent success contract refinement.
- Ruling: history assignedBy FK retains RESTRICT semantics; fixtures explicitly delete their history before users. Future account deletion must explicitly resolve retained history before removing actors — preserves audit references; cost if wrong: additive anonymization/deletion policy in its owning phase.
- Public DTO currently exposes only id/title/publicDescription/quantity/tradeStatus. Task6 must reuse this authoritative projection. Label/scan rendering remains Task8; token alone is never sufficient authorization.
- Approved report snapshot `dd30a011eacf884ed07b248bbe17485f25b58706` on checkpoint branch. Task5 checked off; next Task6 APIs. Main and feature ledgers synchronized; no production/provider action.

### Phase 03 Task 6 interface ruling

- Ruling: the plan requires collection/item CRUD but earlier services cover only creation, hierarchy moves and item updates/archive. Task6 adds the minimal missing domain reads/updates and reversible soft-delete support needed by those routes; deletion uses deletedAt, excludes deleted resources/ancestors from normal/public reads, and does not hard-delete collection contents. Phase09 adds audited deletion/restore/conflict handling around this same state — reconciles CRUD with spec26's trash/restore requirement; cost if wrong: additive lifecycle/API adjustment, never lost collection data.


### Phase 03 Task 6 — COMPLETE

- Implementation `d744045f18eb2a0504dd1c9924a9778095d43b51`; final reviewed/tested fix `3dcc973f593509b888cce98bbd160883559671bc`.
- Thin collection/item CRUD and hierarchy/custom-field/identifier/tag/location endpoints use shared Zod validation, fresh server sessions, DB-derived trusted policy facts, exact-Origin mutation checks, safe errors/request IDs and no-store responses. Owner-only writes; unauthorized private resources return404; public items reuse the explicit safe whitelist and full ancestor rules.
- Additive `20260920234500_collection_item_soft_delete` migration adds reversible deletedAt state and indexes. Collection deletion retains contents; deleted items/collections/ancestors disappear from normal/public reads and direct service writes reject deleted targets. Published migrations unchanged; Phase09 owns audited restore/conflict workflows.
- Actual initial RED private-ancestor API test failed on missing route factory, then GREEN; delete-action policy RED followed by GREEN24/24. Additional implementation coverage is recorded as later coverage, not misrepresented as tests-first.
- Fresh independent review found two P2 defects, both reproduced RED and fixed GREEN: exact non-exponent Decimal read/write roundtrips without Number conversion; NUL rejection for collection/node names and item free text before persistence while preserving legitimate newlines. Focused regressions17/17; required expanded scope93 passed with15 local DB-gated skips. Reviewer original reproductions now2/2 pass. Final SPEC PASS / QUALITY PASS; no open findings.
- Full final CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/35538114677 (job106150706721).
- 221 unit/static tests passed; dedicated integration106 passed including20 actual DB cases; all4 browser journeys passed35.5s. Migrations/lint/typecheck/workspace build/Compose/both Docker builds passed. Real route integration covers private/unlisted ancestry, owner metadata, tiny/precision-limit Decimal resubmission, soft deletion/content retention and direct-service bypass rejection.
- Approved report/review snapshot `c2231d0c0289fd0b73c84875ba62e82bd42428a1` on checkpoint branch. Task6 checked off; next Task7 responsive DE/EN collection/item management UI. Main and feature ledgers synchronized; code remains on feature branch, no production/provider action.


### Phase 03 Task 7 — COMPLETE

- Resumed the existing UI implementation and review fixes; did not repeat Tasks1–6 or redesign the approved V1. Final reviewed/tested remote source: `ec5945259c74d8139d292655889d46bb81a03ce9`.
- Responsive DE/EN collection/hierarchy/item management, all10 typed custom fields, private locations, identifiers/tags, explicit visibility, separate public descriptions/private notes, per-unit acquisition prices, archive/delete, and manual/camera code proposals with explicit confirmation.
- All9 independent review findings addressed: preserved nested placement/currencies/comma tags, safe integer parsing and exact locale display, recoverable network/metadata/collection loading, native keyboard-accessible hierarchy, camera start/disposal control, and validation before writes. Final scoped SPEC PASS / QUALITY PASS, including deterministic browser-failure setup and stable localized select label.
- Reproduced local TypeScript failures then corrected. Browser RED on the pre-fix snapshot confirmed node reset, stuck retry, incomplete list semantics and duplicate camera acquisition. R9 exact pre-fix snapshot RED was observed after production work had overlapped the CI run; not claimed as an observed tests-first sequence. Later retry-test setup was corrected for development effect replay; behavioral assertions retained. Full evidence retained in the task report/reviews.
- Full final CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/36313332028 (job108603303172). 234unit/static tests;106dedicated integration tests including20 actual DB cases;4auth browser journeys (35.0s);16management browser journeys (desktop DE/mobile EN,1.5m). Migrations/lint/typecheck/workspace build/Compose/both Docker builds passed.
- Task7 checked off; next Task8 printable storage labels and authorized scan flow. Completion documentation preserves the tested source. Main ledger synchronized as requested; no merge, deployment or live provider action.


### Phase 03 Task 8 and phase integration — COMPLETE

- Final reviewed/tested source: `d6a1a5e860bbf3bd84c0f0d5a213292362ca73ad`. Printable owner-only QR labels reuse the stable random token and render only location name, QR and short internal code. Scan authenticates before owner-scoped lookup; anonymous scans lead to login, foreign/invalid authenticated tokens return404. DE/EN contents, noindex, private no-store and no-referrer verified in actual production browser journeys. Anonymous users sign in and rescan.
- Task8 review corrected the missing DE/EN print action key. Production browser validation exposed a locale-cookie overwrite from Next link prefetch; reproduced RED, corrected GREEN with prefetch-safe cookie handling and non-prefetching language links. Tests explicitly verify cookie precedence over Accept-Language and anonymous header fallback. Narrow reviews approved every correction; privacy assertions retained.
- Phase-wide final review found split metadata loss across Tasks2–5. The corrected locked transaction preserves current location, identifiers, tag links, all typed values and ordered multi-select links, and creates one initial location-history assignment without copying old movements. Real database owner-API round trips verify exact Decimal/MONEY, unchanged total/location quantities and rollback after metadata-write failure. Scoped review: original Important R1 addressed.
- CI also exposed profile submission before hydration. SSR submit is disabled until hydrated; browser checks cover disabled/implicit-submit behavior and successful hydrated save. Production label journeys now precede dev journeys so cache headers are tested against the deployed server mode. Fixture history cleanup respects existing RESTRICT constraints; label teardown removes test rate-limit state before the auth suite. Production rate limits unchanged. The earlier non-OK reauthentication response was consistent with shared test counters, but its status was not captured and is not misreported as an observed429.
- Full final CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/36316664397 (job108612541982, exact source above). 240 unit/static tests;109 dedicated integration tests including22 actual database cases;2 production label browser journeys (5.3s),4 auth journeys (23.5s),16 management journeys (55.6s). Migrations, lint, typecheck, workspace build, Compose and both Docker builds passed. Unit-run DB skips were executed by the dedicated integration gate.
- Final-review nonblocking follow-ups retained: M1 enabled blank INTEGER converts to0; M2 duplicate hierarchy leaf names need ancestry context in selectors. These are explicit UX follow-ups for future item/hierarchy UI work, not silently discarded findings.
- Execution decisions: resumed the existing dedicated feature checkout (reversible relocation if unsuitable); corrected only fixture-owned history cleanup before owner deletion (risk limited to isolated test records). Full task and phase review/report evidence is preserved under `.superpowers/sdd/2026-09-19-03-collections-items-fields-locations/`.
- Task8 checked off; Phase03 complete8/8, overall21/91. Next: Phase04 Task1 (Media & Documents). Implementation remains on `work/sammlerraum-v1` / Draft PR#1; ledger synchronized to main as requested. No source merge or deployment.


### Phase 04 Task 1 — COMPLETE

- Reviewed/tested source `165fddb28ac925a4ed7e860239d2786687a2c31d` (local implementation0374221). New `@sammlerraum/storage` exports exact put/read/delete/exists interface and local implementation; caller supplies validated UPLOADS_DIR. No environment parsing or public file route in the storage package.
- All operations reject invalid relative keys and traversal/absolute/NUL/backslash paths. Root, parent and leaf symlinks are rejected, including a trailing-slash root. Same-directory temporary file plus rename provides atomic visibility; failure cleans temporary files, missing delete is idempotent, safe error codes omit system paths. Root is trusted app-owned filesystem space; hostile OS-writer directory swaps are outside this boundary.
- Actual RED path-escape assertion and18 failing contract tests preceded implementation; a later root-symlink/trailing-slash regression also went RED before correction. Focused19/19 GREEN, workspace typecheck/format/frozen lock pass. Independent SPEC PASS / QUALITY PASS; no Critical/Important findings.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/36317746924 (job108615555313).259 unit/static tests;109 integration tests including22 database cases;2 production label,4 auth and16 management browser journeys. Migrations/lint/typecheck/build/Compose/both Docker builds passed.
- Minor deferred to Phase04 final review: directory entries are not fsynced after mkdir/rename/unlink; atomic visibility/process-restart persistence does not promise complete sudden-power-loss durability. Final review must triage filesystem durability/reconciliation requirements.
- Task1 checked off, Phase04 now1/6 and overall22/91. NextTask2 upload models/validation. Main ledger synchronized; implementation remains on feature branch.

### Phase 04 execution rulings / interface handoff

- Continue existing dedicated feature checkout; cost if unsuitable: reversible relocation.
- Upload/link API foundation belongs with Task2, gallery ordering/title/document controls with Task6; plan consumes APIs without a separate API task. Cost if wrong: bounded endpoint restructuring.
- Public image delivery uses sanitized derivatives, owner-authorized originals retained; prevents EXIF/GPS leakage. Cost if wrong: explicit future authorized-original feature.
- Task5 creates cleanup-media.test.ts named by its test command despite omission from its file list; cost if wrong: small test-maintenance cost.
- Planned configurable limits:20MiB/image,25MiB/document,40million decoded pixels; initial imagesJPEG/PNG/WebP, documentsPDF or those images. Values/formats were unspecified; cost if wrong: config/allowlist refinement.
- Task2 integrates new media/document links with existing item splitting by sharing asset references, preserving title/order/category/visibility; cost if wrong: explicit unlink on split portion. Avatar references must remain ownership-checked and counted by cleanup; unsupported future catalog targets stay denied until their domain exists.


### Phase 04 Task 2 — COMPLETE

- Reviewed/tested source `38dbc4aa50dfb444c8b92968e0eb1205fd60b603`. Additive media/document models, owned links/avatar references, validated bounded uploads and owner-only same-origin upload/link APIs. Magic, declared MIME, extension and image decode must agree; byte/pixel limits are enforced before persistence. Documents are private by default; split portions share preserved media/document references.
- Durable UPLOADING storage-key intent precedes byte writes; all image MIME assets (including documents) become PENDING for Task3 dispatch, PDFs READY. RESTRICT ownership/variant relations preserve storage tracking. Task3 supplies processing, Task4 reads, Task5 cleanup and Task6 UI.
- Independent SPEC PASS / QUALITY PASS. One CI fixture correction isolates the intended owner FK without weakening the strict P2003 assertion; narrow rereview PASS, no open Important findings. Provider crash-temp cleanup explicitly assigned to Task5.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/36319866566 (job108621505266). 290 unit/static tests;129 dedicated integration tests, including migration replay, owned media/avatar constraints and split-link persistence;2 production label,4 auth and16 management browser journeys. Migrations/lint/typecheck/workspace build/Compose/both Docker builds passed.
- Task2 checked off; Phase04 now2/6, overall23/91. NextTask3 image worker. Main ledger synchronized; source remains on feature branch.

### Additional Phase04 rulings

- Task6 adds a minimal read-only public item/gallery presentation through authoritative public DTO and Task4 authorization, as its browser requirement needs images after logout. Owner editing remains authenticated, receipts private, noindex retained until Phase14. Cost if wrong: bounded route/presentation relocation.
- Migration clears unsupported pre-media avatar UUIDs before the owned MediaAsset FK: no earlier media source exists for backfill. Other profile fields and bytes are untouched. Cost if wrong: avatar reselection; no production migration performed.
- Task5 includes conservative age-gated cleanup of reserved local-provider .storage-UUID.tmp staging files after process crashes, with crash/active-write tests and unchanged four-method provider interface. Cost if wrong: an overly aggressive threshold can disrupt a long write.


### Phase 04 Task 3 — COMPLETE

- Final reviewed/tested source `ff929ab9377f4add743c58e55d02650ac4903efc`. Durable bounded image dispatch for IMAGE and DOCUMENT MIME types, atomic token/lease claims, recovery and at most five attempts. Original retained, safe processing error codes, three tracked WebP variants THUMBNAIL256/MEDIUM640/LARGE1600 with orientation applied, no enlargement and EXIF/GPS stripped. READY follows all completed writes.
- Native Sharp is externalized and included in the final worker runtime; CI actually encodes/decodes inside that container. Queue registration precedes startup, dispatcher stops before queue teardown.
- Independent SPEC PASS / QUALITY PASS after one rejection-matcher fixture correction; scoped rereview confirms0 open Important. Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/36321650793 (job108626527423).301 unit/static tests;132 dedicated integration tests including new realDB claim/recovery and two-session advisory lock checks;2 production label,4 auth and16 management browser journeys. Migrations/lint/typecheck/build/Compose/both Docker images and final-image native decode passed.
- Task5 integration obligation: shared dedicated-session advisory lock prevents normal processing/cleanup overlap, but a server/client partition can release it before worker notices. Observed loss aborts worker; lease expiry is not a hard storage-I/O deadline. Task5 must implement/test late-write reconciliation or fencing; arbitrary quarantine alone is not a proof. Existing key tracking remains intact until cleanup exists.
- Task3 checked off; Phase04 now3/6, overall24/91. NextTask4 protected reads. Main ledger synchronized; no source merge or deployment.


### Phase 04 Task 4 — COMPLETE

- Final reviewed/tested source `92f0db8204da377fbd07087a65511cfa0b0d392d`. Protected GET media routes use authoritative recursive ancestry and live item/document/avatar references, including owner reads. Private receipts never inherit public item access or generic member access; public images use complete READY sanitized variants, originals remain owner-only. Explicit public PDFs use safe attachment/nosniff/sandbox headers. Unlinked retained bytes are inaccessible.
- Current authorization precedes conditional304. Public bytes require revalidation, private responses are no-store, and stored filenames/keys do not enter public headers. Production Next browser evidence verifies content/header delivery and ETag denial after collection visibility revocation.
- Independent SPEC PASS / QUALITY PASS, zero open Critical/Important. CI found a test-double generic typing error missed by web-only typecheck; reproduced RED, fixed without production type changes, full workspace typecheck GREEN, scoped rereview PASS.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/36323311980 (job108631202195).315 unit/static tests;133 dedicated integration tests including real media ancestry/reference policy;2 production label,1 production media,4 auth and16 management browser journeys. Migrations/lint/typecheck/build/Compose/both Docker images/native Sharp probe passed.
- Task4 checked off; Phase04 now4/6, overall25/91. NextTask5 retention/unlink/cleanup. Main ledger synchronized; no source merge/deploy.

### Task5 late-write recovery ruling

- Durable minimal cleanup tombstones may outlive deleted MediaAsset/Variant rows so generated keys remain discoverable and a later write can be reconciled. Equivalent tested provider reconciliation is acceptable. Lease/quarantine alone is not proof that unbounded storage I/O stopped. Cost: small retained cleanup metadata/background scans; do not expire tracking on an arbitrary timer. Task5 must test this boundary and preserve denied media access throughout.


### Phase 04 Task 5 — COMPLETE (17 October 2026)

- Final reviewed/tested source `0cad624c3f1d1ee69f4535c220123e4400db2e1d` (initial candidate `8b199e6`). Owner/same-origin unlink APIs, transactional all-reference retention across images/private documents/avatars/quantity splits/cascades, permanent generated-key tombstones and bounded fair runtime reconciliation. Unlinked retained files remain unreadable; conditional upload/processing completion prevents deleted-row resurrection. Soft-deleted references are retained conservatively.
- Additive reference triggers coordinate unlink/relink/cleanup under deterministic asset locks. Byte failures preserve retryable tracking; late original/Sharp-derived writes after session loss are removed by durable reconciliation. Temporary writes/sweeping use shared staging-UUID advisory locks; all production constructors are wired. Coordinated rollout requires pre-lock writers stopped before the upgraded cleanup worker starts against shared storage.
- Configurable defaults: retention168hours, poll60seconds, batch100, staging age24hours. Ruling: these settings were unspecified; retain seven-day conservative retention and bounded periodic work. Cost if wrong: policy/storage-latency tuning; completed deletion after retention is irreversible. Staging DB-lock reuse preserves the four-method storage contract; cost: extra DB sessions and coordinated old-writer rollout. These are implementation defaults, not production operations.
- Independent review found ImportantR1: persistent early filesystem errors restarted enumeration and starved later healthy staging files. Actual permission-failure RED2failed/21passed, fixed per-entry/subtree error handling with retained bounded progress; focusedGREEN24pass/2DBskip, full329pass/41DBskip. Scoped independent rereview: R1 ADDRESSED,0newCritical/Important. MinorM1 expected cleanup/link conflict can surface as generic error; retained for phase final review.
- Full exact-source CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/39061502277 (job117480246428): migrations, unit/static tests, dedicated PostgreSQL integration including twelve new realDB cases, production label/media/browser journeys, auth/management journeys, lint/typecheck/build, Compose, both Docker images and native Sharp final-image decode passed. Initial candidate fullCI39060930384 also passed before R1 correction.
- Controller then established isolated local PostgreSQL17.11; fresh cleanup/staging integration14/14PASS (twelveDB plus two unit cases), after correcting test-server port to match existing hardcoded Vitest setup. No product source change was needed for that environment correction. Local original runner did not count skipped DB cases as passes.
- Task5 checked off, Phase04 now5/6, overall26/91. NextTask6 gallery/private-document UI. Implementation remains on `work/sammlerraum-v1` / DraftPR#1; no source merge, production deployment or production cleanup.


### Phase 04 Task 6 and final integration review — COMPLETE (17 October 2026)

- Final source `5319a745a852068508ef509314477c2e078ab123`; source implementation `cfdea251`, original evidence `30ff3e0`, review-fix evidence `b75a6fd`. Owner gallery supports upload progress/cancellation, processing/failure states, atomic drag/keyboard ordering and title selection. Documents have explicit category/visibility and default PRIVATE. Minimal public item/gallery presentation uses authoritative ancestry, sanitized derivatives and noindex; private receipts and owner metadata stay protected.
- Ruling: title image is the first gallery image by position; choosing a title moves it to front, preserving other relative order. Cost: a future independent cover choice requires an additive field/DTO. Bounded owner/public lists and mutation membership support at most 200 image/document links per target; legacy larger lists require pagination before complete reordering. Safe DTOs omit storage paths.
- Initial independent task review found ImportantI1: raw Unicode filename headers fail before upload. Genuine browser and route RED/GREEN led to explicit bounded percent-UTF8 encoding, decoded exactly once only with a marker; legacy raw/literal-percent requests remain compatible. Focused35/35, real Unicode PNG desktop/mobile2/2, lint/typecheck/build passed. Scoped rereview: I1 addressed, zero new Critical/Important. No separate Unicode-PDF browser claim.
- Original local DB-enabled suite375/375 passed, as did production7/7 and all16 management journeys. Original dev run18/20 retained two auth failures without captured response statuses; isolated auth retry4/4 passed after clearing one gated test rate-limit record, so the original cause remains an inference. Exact-source initial CI39063403979 captured429 on two synthetic media sign-ins. The gated media fixture now isolates test rate-limit records; production authentication policy is unchanged. Final corrected local media matrix6/6 passed against a real bundled worker, PostgreSQL/pg-boss and Sharp.
- Final exact-source full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/39063951664 (job117487544612, source5319a74). Frozen install, all migrations, unit/static tests, lint/typecheck/workspace build,151 dedicated PostgreSQL integration tests,2 production QR +7 production media/read +4 auth +16 management browser journeys, Compose, both Docker images and native Sharp final-image decode passed. Saved Code Review log is explicitly truncated; job/step conclusions verify all gates. Source was not changed after this tested commit.
- Independent whole-Phase04 boundary review PASS: zero Critical/Important, no final source-fix wave required. Durable permanent tombstones close late-write recovery, staging coordination/fairness closes crash-temp recovery, and all-reference/ancestry/private-document boundaries integrate correctly. Review and test evidence are retained under `.superpowers/sdd/2026-09-19-04-media-documents/`.
- Nonblocking follow-ups retained: parent directory entries are not fsynced after mkdir/rename/unlink, so atomic process-crash publication does not promise acknowledged-name durability through sudden power loss; tombstones can retry resurrected deletions but cannot restore lost originals or READY derivatives. Avatar cleanup-winning conflicts are safely rejected by DB guards but can produce a generic API error (analogous item-link path fixed). Harness color/stream-close diagnostics remain documented despite passing assertions. Existing Phase03 integer parsing/location label follow-ups remain separate.
- Phase04 complete6/6; overall27/91. Next: Phase05 Task1 — Catalog, Condition & Grading. This is verified feature-branch progress, not completed V1 or production deployment. Source remains in DraftPR#1; only this ledger is synchronized to main.


### Phase 05 Task 1 — COMPLETE (17 October 2026)

- Final source `31725b997a5f467d640767ac703c70279ff4e42d` (initial7dce6cc). Maintenance-only category-template service, authored stable keys, relational DE/EN labels, ordered typed attribute definitions/options, scoped DB uniqueness and atomic nested creation. No ordinary-user write endpoint. Reuses all ten custom-field primitive validators without changing legacy behavior, maps catalog errors, preserves precise decimal/date/selection semantics and excludes unknown/private payload properties. Additive migration13 and exports/CI integration registration included.
- Ruling: authored lowercase ASCII keys at most64, required DE/EN labels at most200 normalized characters, at most100 definitions and100 keyed options each; labels never generate identity. Cost if wrong: deliberate locale/capacity/contract extension. Creation is a server maintenance boundary; real operator-granted application moderator/admin authority will guard catalog proposals before user-facing canonical changes.
- Genuine behavioral RED then focused33/33 and full410/410 DB-enabled tests, lint/typecheck/production build passed. Independent review found a minor mismatch-error precedence discrepancy for oversized MULTI_SELECT arrays with wrong-type members. Actual regressionRED3failed/29passed, narrow correctionGREEN36/36 (32unit+4realPG), domainlint/typecheck passed. Scoped rereview SPEC/QUALITYApproved, zero newCritical/Important; existing6.8mb worker bundle diagnostic acknowledged and retained for final-phase triage.
- Exact corrected-source CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/39066522503 (job117495245612, source31725b9). Unit/static checks,155 dedicated PostgreSQL integration tests,29 browser journeys (QR2/media7/auth4/management16), all migrations/lint/typecheck/build, Compose, both Docker images/native Sharp final-image decode passed. Saved backend log is explicitly truncated; job conclusions establish gate completion. Earlier source checks are not substituted for final-source CI.
- Task1 complete, Phase05 now1/7, overall28/91; nextTask2 revisioned global catalog. Source and evidence retained in feature branch/DraftPR#1, ledger-only main synchronization authorized. User authorized continuous work until18October09:00Europe/Berlin; heartbeat continuation established, final deadline tracked in Phase05 progress. No source merge or production deployment.

### Phase05 integration rulings recorded during preparation

- Required supporting migrations/exports/APIs/CI wiring belong with their producer tasks even when omitted from minimal plan file lists; cost if wrong: bounded restructuring.
- Personal item category remains optional and independent of catalog links; condition support must preserve uncataloged items and facts on unlink; cost if wrong: additive category migration/DTO refinement.
- Immutable catalog snapshots retain complete authored reference state; rollback creates a new revision, never rewrites history. Bounded explicit JSON is allowed for authored translations/provenance/typed canonical values, while identity/category/definition relations remain relational; cost if wrong: larger snapshots or future schema extension.
- Rollback retains inactive child UUID identities to preserve later personal references; Task6 must exclude inactive candidates/block new links while handling existing links explicitly. Cost: retained inactive rows and explicit linking policy.
- Entry and its variants may hold typed attributes and namespaced identifiers; UUID identity is independent of displayed title/language/edition. Cost: later deduplication or target-contract refinement.
- Phase05Task3 introduces the minimal persisted application MODERATOR/ADMIN authority foundation named by Phase10Task4, separate from collection roles and operator-granted. Phase10 must reuse/extend this source. Cost if wrong: bounded role migration; no live grants or later-phase completion claimed.


### Phase 05 Task 2 — COMPLETE (17 October 2026)

- Final source `b1ce8eadfab2a7d73f2b80ab3e0c9a5ff118e9cb` (initial2d5f3e5), maintained global catalog entries/UUID variants/namespaced identifiers, entry/variant typed attributes with relational category/target guards, authored multilingual text and source/license metadata. No user HTTP mutation endpoint or personal item facts. Transaction-aware canonical seam composes inside one approval transaction; entry locks and expected revisions serialize writes, including stale no-op rejection.
- Complete deterministic immutable authored snapshots preserve past state. Rollback appends a new revision, retains inactive child identities and can reactivate their original UUIDs. DB UPDATE guard and restricted parent deletion protect application history; operator-level DELETE is deliberately outside the guarantee. Inactive identifier tuple re-add currently creates a new UUID; historical rollback reactivates its stored UUID. Consumers must not assume one tuple maps to one UUID across separate re-additions; this policy remains a nonblocking final-review follow-up.
- Actual behavioral RED/GREEN covered authored translation/serialization, immutable DB UPDATE rejection, empty-patch defaults resetting sources, malformed URL errors and rollback metadata. The brief's exact variant-distinction assertion first ran GREEN; the chronology deviation is retained honestly. Later isolated fault injection proved it catches same-title UUID collapse, after build completion; exact source was restored and focused10/10 passed. Standard fullsuite369passed/54DBgatedskips, lint/typecheck/production build passed; skipped DB cases were not counted as local passes.
- Independent review found ImportantI1: accepted uppercase UUIDs differed from PostgreSQL canonical lowercase, breaking rollback and identity checks. Three real-PG RED failures preceded consistent input/command/legacy-snapshot normalization; GREEN13/13 (11PG+2unit), full workspace lint/typecheck passed. Raw historical JSON stays unchanged and authored values/user IDs are not case-normalized. Scoped rereview PASS, zero newCritical/Important; final exact-source CI covers the corrected implementation.
- Full CI SUCCESS: https://github.com/acciento89-bot/sammlerraum/actions/runs/39068763845 (job117501807515, sourceb1ce8ea):166 dedicated PostgreSQL integration tests,29 browser journeys (QR2/media7/auth4/management16), unit/static tests, all migrations/lint/typecheck/build, Compose, both Docker images and native Sharp final-image decode passed. Saved backend log is explicitly truncated; job conclusions verify all gates.
- Two additive migrations `20261017225000_global_catalog` and `20261017225200_catalog_revision_guard` are applied. Future IDs must sort after latestexistingID, usingmax(latest+1,currentUTC); folder timestamps are not execution-time evidence. A package runner banner caused the first new migration attempt to fail before DDL; only that failed test migration was resolved/redeployed, no reset or old-history edit. Applied SQL's cosmetic EOF blank is retained to preserve checksum. A reproduced Prisma nested-read pg warning was fixed with sequential batched state reads, with clean focused output.
- Task2 complete, Phase05 now2/7, overall29/91. NextTask3 moderated proposals/application role foundation; prepared design only until completion persistence. Correcting/removing external identifiers is included there as a necessary supporting canonical command surface. Implementation stays on feature branch/DraftPR#1; ledger-only main sync, no source merge/deployment.


### Phase05 Task3 — Moderated catalog proposals and authoritative decisions

- Final source `37cb8ddb8d6dfedaf0545ec8ec070e5574276633`; fresh independent SPEC compliant/QUALITY Approved, zero Critical/Important. Seven strict operations cover new entries, entry/variant corrections, identifiers (including necessary supporting update/remove), authored translations and source/license provenance. Ordinary users submit/read only their private proposals; granted MODERATOR/ADMIN users decide through the shared canonical transaction seam. No private item facts enter canonical records.
- ApplicationRoleGrant foundation is separate from collection roles and must be reused by Phase10 Task4 rather than duplicated. Same-transaction grant FOR SHARE locks make ordinary SQL revocation wait for already-authorized work; authority→proposal→entry lock ordering and expected-revision checks ensure atomic one-time decisions. Stale approval persists CONFLICT before public409; other validation errors leave PENDING. Real enclosing rollback reverts canonical and decision together. Operator-only setup/revoke SQL documented; no real grants/provider actions. Audit/proposer/moderator references restrict account deletion; later erasure policy must preserve/anonymize audit identity explicitly. Current grant metadata is not a full role-event stream; cost is operator change-log retention and later erasure design.
- Approved initial limits:20 pending/50 rolling24h/10000 retained per user,64KiB UTF8 payload, bounded summaries/reasons/list/cursors, namespaced actor quota lock. Submission seam rejects unsupported isolation before counting/writing; public wrapper owns ReadCommitted. Actual RepeatableRead RED inserted21 against ceiling20, guard GREEN retains20. Cost:one extra submit isolation query and fixed initial policy tuning, no silent audit expiry. Moderator own-proposal approval allowed with actual grant/reason; cost is future governance policy if two-person review is desired.
- Clarified rollback exception to earlier shorthand: different canonical content creates a new immutable revision; byte-equivalent snapshot retains verified Task2 no-op revision/metadata, but every successful authorized rollback records separate actor/reason/expected/target/result audit. CAS runs before no-op. Cost:rollback audit-event count need not equal canonical revision count. Minimal identifier correction/removal retains inactive history/UUID scope and reuses producer persistence.
- Fresh-session, exact-Origin, bounded-body, no-store HTTP routes cover submit/own detail/list, protected review/decision and rollback; redacted request-ID errors and hidden foreign404. Proposal source is retained review provenance; canonical payload sources explicitly control canonical provenance. Shared media bounded-body extraction preserves behavior. Additive migrations16–17 (`20261017225201_catalog_proposals`, `20261017225202_catalog_rollback_audit_target`), DB current/no drift; applied history untouched.
- Original real-PG stale-base behavioral RED/GREEN and isolation bypass RED/GREEN retained. Final local serial full452/452, workspace lint/typecheck/production build PASS. First parallel full450pass/1 inherited worker dispatcher fixture interference; focused worker2/2 and serial451 then452 pass. Dedicated DB CI now --no-file-parallelism, unchanged worker behavior/assertions; cost modest CI time. Initial typecheck/pg-fixture warnings resolved, exact failed logs retained; unchanged6.8mb worker bundle diagnostic remains nonblocking.
- Exact-source CI [39070683270](https://github.com/acciento89-bot/sammlerraum/actions/runs/39070683270), job117507466853 SUCCESS:185 real-DB integration tests,29 browser journeys,unit/lint/types/build/migrations/Compose,both Docker images and native Sharp. Backend CI log explicitly truncated and retained; complete run is linked. Task3 report/review/raw chronology under phase workspace. Implementation remains on draft PR #1, unmerged/undeployed. Canonical verified30/91; Phase05 3/7, nextTask4.


### Phase05 Task4 — Exact category conditions and independent personal facts

- Final source `40018a4198636daf6b621f4836d8dcfe80049ff8`; fresh independent SPEC compliant/QUALITY Approved, zero Critical/Important/Minor. One maintenance-authored scheme per category, ordered exact stable condition keys and authored DE/EN labels, optional integer1–5 band derived from the selected immutable option. Personal category/condition are independently nullable, work without catalog link, and do not change the public item whitelist or future grading facts.
- Owner/lifecycle-checked services and authenticated strict no-store routes support scheme reads, item condition read/set/clear and category assignment. Actual item DTO/read/resource SQL/split seams expose nullable IDs and preserve an inactive historical choice on split. Category change/removal with a selected condition requires explicit atomic clearCondition:true; no silent loss. New selections require active scheme+option, while old inactive choices remain readable.
- Approved storage/maintenance policy: scalar labelDe/labelEn with bounded labels:{de,en} DTO, one scheme/category, max100 ordered options; semantic corrections append a key and retire the old option. PostgreSQL semantic UPDATE guards cover actual label/key/category/band/identity storage, RESTRICT protects referenced identities, unused scoped fixtures can be deleted normally. Composite scope FKs plus explicit option-implies-category CHECK close nullable FK bypass; band/position bounds are enforced. Item→scheme SHARE→option SHARE selection locks block concurrent deactivation through commit; maintenance never locks an item. Cost:retained retired definitions and future extra locales need additive schema extension; this is not tamperproof operator history.
- Additive migration18 `20261017225203_condition_schemes`, all migrations current/no schema drift; no applied history rewrite or production write. Supporting contracts/exports/API adapters and CI registration included. No automatic bootstrap or fabricated official category scale; usable maintenance starter data remains an explicit Task7 design question.
- Actual existing-path persistence RED probe is documented separately from the unchanged dedicated runnable real-PG exact vinyl.vg_plus/independentband4 RED→GREEN test. Full serial real-DB workspace467/467 across65files, lint/typecheck/production build/schema PASS; later scoped fixture-teardown-only adjustment has15/15 focused evidence. Strict routes, ownership/lifecycle, history/split, DB scope/immutability and real option/scheme lock waits are covered; failed attempts retained honestly.
- Exact-source CI [39072253539](https://github.com/acciento89-bot/sammlerraum/actions/runs/39072253539), job117512104742 SUCCESS: dedicated DB integration,29 browser journeys, unit/lint/types/build/migrations/Compose,both Docker images and native Sharp. Backend log is explicitly truncated, exact run remains linked; no unsupported database test count inferred from the truncated tail. Implementation/report/review/raw chronology saved on feature branch; canonical31/91, Phase05 4/7, nextTask5. Source remains unmerged/undeployed.


### Phase05 Task5 — Private grading facts and physical specimen integrity

- Final source `04e41d4ed922cf3e83c209d0d97d051af93252ff`; fresh independent SPEC/QUALITY Approved, zero Critical/Important/Minor. Owner-only grading list/read/add/full-replacement update/remove, strict contracts and fresh-session/Origin/no-store/8192-byte routes. Records retain authored provider/grade, optional certificate/date/safe verification URL/source and timestamps. No provider fetch, authenticity claim, automatic grade conversion, global catalog/personal coupling or public DTO change.
- Current certificate uniqueness is owner+provider+certificate, never a number-only or cross-account claim. Conservative NFC/trim preserves certificate case, punctuation/internal spaces and leading zeros; provider identity uses ASCII case fold only, no fabricated aliases. NULL certificates permit multiple records; cap100 current rows/item. Cost:provider-specific aliases/equivalence are not inferred, and edits/removal are personal CRUD rather than immutable historical facts. Phase09 Task4 creates shared audit, Task5 integrates grading in the existing mutation transaction; no duplicate audit framework was introduced. Report cross-reference corrected in documentation only.
- Optional comparable numeric input is exact authored decimal text, Decimal(12,4),0..99999999.9999 with required explicit authored comparableScale. No exponent, precision rounding or inferred universal ranking at application input; DTO remains string. Native checks enforce range/scale pairing/finite upper bound. An actual raw SQL NaN RED exposed the nonnegative-only gap and was fixed by a second additive check; a prior typed-client rejection is explicitly not claimed as database proof. Direct operator SQL retains native PostgreSQL precision behavior, not a promise of lexical input validation.
- Every current grading requires item quantity1. Actual shared item update/split services check under the same item lock; native composite item(id,ownerId,quantity) FK ON UPDATE RESTRICT and child quantity=1 CHECK prevent racing/direct-DB quantity violations. No copying or moving grading certificates on split; split quantities into specimens first. Cost:one additional composite item unique index and constant child FK column; removing all grading releases quantity restriction.
- Soft-deleting an item retains grading and its owner-local certificate reservation. Deleted resources remain hidden404, same-owner/provider/cert reuse409, other accounts unaffected, all covered by actual service tests. Cost:restore/trash/permanent-erasure policy in Phase09 must preserve/recover this identity and later release it deliberately; removing grading before deletion releases the claim now. No silent private-fact erasure or extra recovery framework.
- Additive migrations19–20 (`20261017225204_grading_records`, `20261017225205_grading_finite_comparable`), all current/no drift. Correct DB identity schema existed from start; transparent new-service certificate-only scaffold RED then unchanged PSA123/CGC123 persisted assertion GREEN, never represented as an old production bug. Final local serial real-PG490/490 across67files, lint/fresh post-build typecheck/productionbuild/schema PASS. Initial fixture unhandled rejection/type errors and four preexisting ignored generated .next type duplicates were preserved/documented; only duplicates moved outside compiler include and normal output regenerated, no source workaround.
- Exact-source CI [39073823041](https://github.com/acciento89-bot/sammlerraum/actions/runs/39073823041), job117516742621 SUCCESS: dedicated DB integration,29 browser journeys,unit/lint/types/build/migrations/Compose,both Docker images/nativeSharp. Backend tail explicitly truncated; full run linked, no unsupported DB count invented. Source/report/review/raw chronology saved on feature branch; canonical32/91, Phase05 5/7, nextTask6. No source merge, deployment, real provider action or production migration.


### Phase05 Task6 — Safe personal catalog links and canonical discovery

- Final source `639257e7c744dfd2e0b41acc8d66428b8e1e1a5e`; fresh independent SPEC/QUALITY Approved, zero Critical/Important/Minor. Actual item service link/unlink/owner link-state, nullable DTO/read/resourceSQL/list/split integration and strict owner HTTP routes. Generic item inputs remain separate from assignment; public item whitelist unchanged, no private facts copied into canonical state.
- Link infers category only when null, otherwise retains matching category or rejects mismatch; changing/clearing linked category requires explicit unlink even with condition-clear flag. Unlink preserves category/exact condition/grading/acquisition/private metadata/media/docs. Retained inactive variant reads/identical no-op/split references work; selecting another retired variant rejects. Actual grading quantity1 guard remains, no certificate clone or movement.
- Parent-first entry SHARE→variant SHARE→owned item UPDATE agrees with canonical writer order. Split discovers IDs unlocked, locks parents then item, revalidates and rolls back/retries at most3 times; exhaustion has stable409 and leaves quantities/items unchanged. Category/condition/unlink never wait for a new catalog parent while holding item. Real PostgreSQL tests observe actual canonical writer/selector contention and category races.
- Additive migration21 `20261017225206_item_catalog_links`: scope composite FKs ON UPDATE RESTRICT, entry-implies-category/variant-implies-entry CHECKs, tuple indexes and exact identifier value-leading B-tree. Native column-specific SET NULL clears only catalogEntryId or catalogVariantId, preserving personal category. Cost:Prisma7.10 schema cannot express subset deletion columns; actual diff is empty only for represented semantics. Independent confdelsetcols/pg_get_constraintdef tests prove exact actions and protect future generated FK replacements. Schema-only recreation is insufficient; no applied migration edited.
- Canonical hard deletion remains restricted by history/other children and has no new API. Tests distinguish unlink, history rejection and native deletion on otherwise-deletable isolated synthetic targets, without guard bypass/global cleanup. No claim that normal history-bearing entries can be hard-deleted.
- Fresh-session authenticated/no-store canonical search/category summaries/template detail/current entry snapshot, plus2048-byte fatal-UTF8 exact-Origin link mutations/strictDELETE. Missing/foreign/deleted personal resources hidden404. Search explicit text2–200 or exact identifier1–500, strict filters/duplicate/unknown query rejection, default20max50, versioned query-bound cursor and UUID keyset. Compact <=5 variant/identifier previews+counts, disambiguating titles/language/edition/reference, no private joins or full snapshots per hit. Current detail joins immutable snapshot to exact current entry revision in one statement; retained inactive selected summary separate.
- Accepted scaling/visibility costs: literal text searches may scan, individual bounded producer snapshots/templates can be large, keyset pages are live, anonymous catalog browsing requires later explicit policy. No external index/provider/global write. Authored translations/provenance remain exact; no invented translations or missing data.
- Original real-PG unchanged persisted unlink RED→GREEN retained separately from fixture setup failure; additional route/read/race-observer failed attempts honestly preserved. Final local serial realPG515/515 across70files, lint/production build/postbuild types/schema21/native metadata/represented drift PASS. Thirty source-task logs/report and independent review saved; unchanged6.9MB worker bundle diagnostic nonblocking.
- Exact-source CI [39076021125](https://github.com/acciento89-bot/sammlerraum/actions/runs/39076021125), job117523224269 SUCCESS: dedicated DB integration,29 browser journeys,unit/lint/types/build/migrations/Compose,both Docker images/nativeSharp. Backend tail explicitly truncated; full run linked, no unsupported DB count inferred. Canonical33/91, Phase05 6/7, nextTask7 UI; whole-phase review still required after task gates. Source unmerged/undeployed, no production/provider/role action.


### Phase05 Task7 — Usable reference workflows and independent personal editors

- Final source `4d70f3102b1039fda8754969448d7b0689f09435` (initial UI423d095, I1fixa20e7ca, CIintegration4d70f31). Fresh independent task review plus scoped I1/C1 rereviews close all Critical/Important findings. Authenticated DE/EN catalog search/detail, exact variant title/language/edition/reference selection, personal link/unlink, all seven human proposal operations, explicit translations/typed fields/canonical sources, own outcomes, actual-grant approve/reject and reasoned CAS history/rollback. Capability remains advisory; history reads are bounded canonical-only with no account/private joins.
- Personal category/exact condition and external grading are independent sibling editors after the core form, with saved-ID gating, explicit clear/unlink, retained inactive/archive facts and unchanged public whitelist. Unlink preserves private facts. Real integration fixes accept a truly zero-byte DELETE stream while retaining body bounds, preserve acknowledged grading identity through refresh failure, handle stale reads, wrap mobile navigation and preserve unsaved condition/category/clear drafts across unchanged sibling refreshes. No automatic provider verification, universal grade ranking or copied personal proposal payload.
- Explicit worker maintenance initializer is dry-run by default and deliberate --apply, exactly trading_cards/vinyl definitions and authored condition labels, all normalized bands null. Atomic reused-maintenance transaction/advisory lock, complete semantic preflight, rerun identity/retirement/extra-data preservation; no startup hook, canonical sample entries, accounts or real role grants. Actual bundled dry-run made no writes. No new migration;21 applied migrations remain. Cost: future immutable semantic changes append new keys/retire; production-runtime packaging is a named whole-phase integration check.
- Genuine original existing-item PSA9 absence RED and unchanged GREEN are distinct from newly discovered regressions. Real-PG zero-byte DELETE2-failure RED to15-pass GREEN; acknowledged grading retry duplicate-row and stale cancellation regressions; actual412px mobile overflow assertions. Task-review I1 production4-failure RED to12-pass DEEN desktop/mobile GREEN verifies drafts, explicit clear, intentional saves and changed persisted facts. Full local serial PG528/528 across74files before later pure/UI edits; focused serializers3/3 and final Node24 build/types/lint pass. Twelve production visuals retained under outputs/phase-05-task-7; root inspected desktop and both final mobile history views. All failed attempts/report chronology retained.
- C1 ruling: two exact a20 CI runs passed36 catalog cases but missed the first existing nextdev navigation assertion after POST201; remaining15passed. Cold Node24 local timing supports framework compilation cost, exact CI miss not locally reproduced. Consistent production E2E was approved only after unchanged full4auth+16core proof. Initial fresh production18/20 exposed synthetic localhost SMTP DNS resolution; explicit127.0.0.1 listener/host keeps real TLS/cert validation/auth/capture and yields20/20. All CI browser steps now use the same production build. No app/auth/assertion/timeout change in C1. Cost: IPv4 fixture and dev compilation timing no longer a CI gate; raw contrary evidence and diagnostic limitations retained.
- Exact-source CI [39081210503](https://github.com/acciento89-bot/sammlerraum/actions/runs/39081210503), job117538331002 SUCCESS: dedicated PostgreSQL integration,65 production browser journeys (2labels+7media+36catalog+4auth+16core),unit/lint/types/build/migrations/Compose,both Docker images and native Sharp. Exact backend tail explicitly truncated and saved task-7-ci-4d70f31-success.log; full run linked, no hidden DB count inferred. Earlier a20 failure tails saved separately.
- Deferred task minors for whole-phase triage: M1 pending catalog-detail response can reopen a cancelled selection; M2 inherited color/npmconfig/stream-close diagnostics and server bundle size indicators, passing output is not pristine. Canonical verified34/91; Phase05 7/7 awaiting independent phase review. Source remains unmerged/undeployed; no production/provider/role action.


### Phase05 integration complete — catalog, condition and grading

All seven Phase05 tasks are independently verified; completion remains **34/91**, without inventing additional roadmap tasks for integration fixes. Whole-phase review covered baseline `8e4fb144ab47c74ea02d0dbb4895dec34b38d1d5` through `548fdfdbb60997d3b17000f25d45d02c8464660c`; its one consolidated fix wave `9a1f0c5` and scoped re-review closed I1/I2 and M1–M5. The final exact tested source is `75de79d966ad0ee7e9af2a7d8c6c1f714202daa5`, including separately diagnosed CI status-verification repair `fdd1753` and the proven existing ItemForm stale-archive-read correction. Source remains on the draft feature branch; no merge, deployment, live role grant, provider call or production initialization.

Final exact-source CI **39087100135/job117555845960 SUCCESS**, and parallel **39087096899/job117555835922 SUCCESS**. Both completed unit/lint/types/build, dedicated real database tests, migrations/represented drift/Compose, production browsers, both Docker images and native Sharp. The retained primary tail explicitly shows **95 production browser passes: 2 labels + 7 media + 60 catalog + 4 auth + 22 core**. Tail truncation is explicit; no hidden final database count is inferred. Full final job-step metadata is retained. [Final CI](https://github.com/acciento89-bot/sammlerraum/actions/runs/39087100135), [parallel CI](https://github.com/acciento89-bot/sammlerraum/actions/runs/39087096899).

The moderation UI now keeps accepted proposals inspectable/rejectable despite missing/slow optional reference context, shows every primary and explicit translated entry/variant description, and preserves authoritative decision locks. Cancel invalidates catalog reads, empty category clears loading, both INTEGER producers reject blank but accept zero, known attribute validation maps to bounded400 while infrastructure stays500, and only provenance text admits CR/LF/tab. Independent whole-phase and scoped reports are preserved under `.superpowers/sdd/2026-09-19-05-catalog-condition-grading/`.

New CI failures were preserved rather than hidden behind parallel passes. Both9a1 runs exposed two legitimate status paragraphs; deterministic delayed actual-response tests now verify exact saved/loading messages, settled controls and real persisted state. Onfdd, one full CI passed while the other exposed a real old snapshot re-enabling an archived form. Real delayed-GET probes proved DB/archive acknowledgement stayed correct; a read generation now rejects older initialization/refresh results, stale errors and finalization, coherently retains item metadata, and keeps known IDs/acknowledged archive truth when a fresh read fails. Six actual regressions passed; local affected matrix85/1 and one exact auth retry1/1 remain honestly distinct, with auth ECONNRESET causation unproven. New independent archive review: SPEC PASS, QUALITY APPROVE, C0/I0/M1. Final both-clean remote runs, not a local retry, close the gate.

Ruling: acknowledge item writes by invalidating older item-scoped snapshots and use a guarded fresh actor-bound read — old responses cannot reverse current lifecycle — cost read-generation bookkeeping and possibly one additional GET per successful save/archive. Ruling: a failed refresh after an acknowledged write retains the created ID/read-only archive and explicitly reports saved-but-not-refreshed — prevents duplicate creation and false rollback claims — cost localized copy and a small read-result boundary. No automatic write retry, generic cache framework, schema or permission change.

Ruling: M6 final-image initializer packaging and M7 warning/runtime/bundle diagnostics remain Phase13 work — source-checkout initializer is documented and usable, image-command availability is not proven — cost installed/generated/migrated checkout until packaged-command smoke and immutable deployment/runbook verification. Ruling: new archive-review R1 test-route cleanup can skip synthetic-row cleanup when unrouteAll rejects after timeout; defer nested-finally hardening to Phase13 test reliability — no product/authority/false-GREEN defect — cost possible owned fixture remnants after a failed test, requiring exact synthetic-ID cleanup. Four known setup-only test users were cleaned with recorded ID inventory, no reset or broad deletion. Earlier duplicate leaf labels, storage directory fsync/power-loss durability and avatar cleanup presentation remain explicit release follow-ups.

The known ISO/ICU scale issue in legacy purchase/custom/catalog-money UI remains a separate Phase06 money-integration follow-up, not solved by INTEGER parsing. Grading audit/restore/erasure integration remains Phase09. All historical failures, task rulings and source evidence remain preserved. Phase06 full-plan interface preflight and canonical-money/manual-history design are prepared, including case-sensitive text actor IDs and pinned ISO exponent metadata; implementation GO follows this phase's persisted completion and ledger-only main sync.


### Phase06 Task1 verified — canonical money and manual valuation history

Source `d101e5964f967acb8b9979db2d0ce23496db4f76` from `eefd76a1d6d29c1925cc0daccfced22d02885f70` is independently SPEC COMPLIANT / QUALITY APPROVED (C0/I0/M1) and exact-source CI **39088590979/job117560265003 SUCCESS**, parallel **39088588582/job117560257740 SUCCESS**. Full checks include real DB integration, production browser steps, both Docker images/native Sharp, migrations and represented drift. The backend's truncated final tail contains no visible pass-count summary; complete step metadata is retained, with no hidden remote count inferred. [CI](https://github.com/acciento89-bot/sammlerraum/actions/runs/39088590979), [parallel CI](https://github.com/acciento89-bot/sammlerraum/actions/runs/39088588582). Canonical completion is **35/91**, Phase06 **1/6**; later tasks remain open. No merge/deploy/live provider or production write.

Canonical Money uses bigint integer minor units, exact DE/EN grouping/decimal parsing and approved0/2/3/4 ISO exponents. Required `1.234,56` DE and `1,234.56` EN EUR both become123456n. Raw input<=80UTF16 before trim; leading-zero ungrouped integers and zero are valid; malformed grouping, signs/exponents/symbols/internal whitespace/excess precision fail. Range0..9223372036854775807n without Number conversion. The165-code literal map and native accepted pairs match SIX ListOne published2026-09-17, SHA25633139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff; no ICU/default-scale or runtime fetch. Native stored exponent preserves historical interpretation; future updates retain accepted historical pairs. Legacy purchase/custom/catalog-money UI remains unchanged with its separately known ISO/ICU integration follow-up.

The actor-bound private service appends MANUAL/PER_UNIT history, with item+owner FK and case-sensitive text actor/owner identity; only native UUID fields normalize. New inputs cannot set owner/actor/type/basis/exponent. Native guards protect nonnegative exact currency/scale, actor=owner, finite/year0001..9999/order timestamps, note bounds, and all UPDATE attempts including no-op. Trusted DELETE and item/user cascades remain possible, not operator-proof retention. Migration `20261018015303_manual_valuations` is additive after21 prior migrations, all22 current with empty represented diff and separately exercised custom invariants; no reset/applied-history rewrite.

ReadCommitted operations take Collection SHARE then item UPDATE (append) or SHARE (read), revalidate ownership/soft deletion and lifecycle, and capture actual DB clock after waiting. Archived/disposed history stays readable but append rejects; soft-deleted parents/items hide404. Quota10000/item under row lock, no pruning; bounded50-default/100-max keyset history ordered observedAt/createdAt/UUID descending, same-ms cursor precision, deterministic ties, null when absent. Backdated history does not replace a newer observed time. Quantity edits preserve PER_UNIT interpretation; actual split retains only source history/new item latestnull, avoiding invented authorship. Public item projection remains a strict whitelist without valuation facts. Internal bigint/Date records are not a JSON boundary; later DTOs require strings and stored exponent.

Real focused67/67(50pure+17PG), existing item/collection/grading44/44, normal475unit passes/168DB-gated skips, workspace build/types/lint pass. Failed scaffold/timezone/test-fixture/formatter/generated-type attempts remain honestly recorded in task-1-report.md/logs. Four byte-identical ignored generated `* 2.ts` copies were provenance-checked and preserved outside checkout; no source/tsconfig/policy workaround. Raw logs remain outside, committed copies normalize terminal trailing whitespace only.

Actual installed pg historical Date serialization lost seconds of Berlin's ancient offset; Prisma adapter7.10 also rewrites timestamptz offsets without converting. Ruling: transaction-local UTC plus canonical ISO-string::timestamptz bindings within valuation operations — correct absolute instants/year0001/keysets — cost one setup query and read/bind discipline; no shared-client/global-session/legacy timestamp refactor. Independent review confirms implementation is transaction-local. M1 nonblocking proof issue: test compares outside backend PID before/after but not inside the transaction, so single-backend restoration is not fully established by that assertion. Ruling: carry minimal dedicated-connection/three-PID test strengthening into Task2's same UTC boundary and phase-integration triage — no product defect or extra fix loop — cost a limited current proof claim; root confirmed test itself uses only transaction-local configuration and cannot leak a global session setting.

Ruling: notes trim Unicode whitespace, blank becomesnull, NUL rejects, max2000 Unicode code points matching native varchar semantics — coherent authored-text boundary — cost later JSON validation must retain that count policy rather than silently narrow to UTF16 units. Existing per-unit/history, ISO metadata and actor-erasure decisions remain deliberate: user must re-estimate a split item; currency updates need reviewed historical retention; Phase09 must migrate actor=owner and actor-erasure semantics together before collaborative authors diverge. No API/UI, external observations/adapters/scheduler, FX/blended estimates or shared audit framework is claimed by this task. Task2 concrete design is approved only; source GO follows this verified task's persisted source and ledger-only main sync.

### Phase06 Task3 — bounded-sync design rulings, implementation pending


Root read the full completed task-3-preflight.md and independently inspected committed queue composition/main lifecycle and pinned pg-boss12.33.2 transaction capability. These rulings resolve its three questions; actual Task2 exports, capability types and empty-batch behavior must still be rechecked on the future verified BASE.

1. Ruling: approve one mutable global MarketSyncDispatchState cursor/nextDispatchAt row plus atomic cursor+pg-boss send admission, narrow actual queue backend adapter, and a query-justified active mapping index — this is the smallest proposed design that preserves restart fairness and cross-replica bounded scheduling without an outbox/per-target scheduler model — cost one operational model and explicit coupling to the pinned pg-boss transaction/schema capability. Use conservative hard maxima32 candidates/global tick, tick interval minimum60s,256 outstanding created/retry/active jobs and hourly per-mapping slot; config may reduce capacity/increase interval but never evade maxima. Defaults are product safety bounds, not a provider quota/spend guarantee. All normal market enqueue paths must pass this admission seam; do not expose an unbounded alternate helper. Verify actual caller-owned transaction, nonterminal query, null suppression and shared row lock with real PG/pg-boss. An unsupported backend fails closed rather than silently dropping bounds.

2. Ruling: approve opt-in registerCancellable and optional provider fetch context carrying AbortSignal, preserving existing payload-only register/handlers and one-argument provider compatibility — actual transport settlement is necessary for safe shutdown, not a Promise.race illusion — cost additive queue/runtime/type/test surface and a future adapter cancellation obligation. No generic task framework or existing image-handler rewrite. Task3 may make the narrowly required worker stop promise idempotent and attempt independent cleanup after failures, but it must never disconnect DB beneath unsettled market work or claim safe drain after abort failure. Verify actual retry/backoff/expiry/retention metadata and native signal path. Production registry remains empty/default OFF; enabling config alone adds no real adapter. Require bounded connection acquisition as well as lock/statement/transaction timeouts before asserting numeric wall-clock shutdown bounds.

3. Ruling: choose explicit verified drain-before-purge/reactivation prerequisite, without activation-generation schema now — source-only disabled providers do not yet require a license/account/versioning subsystem, and removal can be safe if all replicas, queued/redrive/manual replay sources and in-flight transactions are actually drained — cost no automatic protection from a privileged operator later reimporting an old saved payload. Task6/Phase13 must supply/test the concrete authorized runbook/runner and disabled fetch+read policy before real activation; a receipt or default-off flag alone does not satisfy that gate. No purge/live operation is authorized now. If actual implementation uncovers a normal replay path that cannot be drained, escalate a concrete narrow generation barrier rather than claim this assumption holds.

4. Ruling: approve minimal immutable successful receipt including full strict canonical request, count0 success and same-key exact request conflict, atomic with Task2 ingestion under provider/poll advisory serialization — fixes ACK-after-commit retry and missing-versus-empty semantics without claiming exactly-once HTTP — cost one additive receipt model and duplicate precommit HTTP remaining possible. Prefer timestamp field recordedAt (actual DB-authored receipt insertion time), not committedAt suggesting an exact PostgreSQL commit timestamp. Receipt read/equality precedes current catalog/network work; a previously committed equal receipt remains usable after retirement. Empty input must still validate current exact target in the same transaction. Root notified Task2 implementer to confirm its actual seam; reuse it instead of duplicate matching logic.

Preserve source response time precision and first successful fetchedAt; no provider error cause/stack/URL/body/header in broker output. The report's complete file list is justified only as needed for these concrete handler/producer/lifecycle seams. Keep no-real-adapter, no-private-item-join, no catalog lock over HTTP, no unbounded scan/backlog and additive-migration constraints. No Task3 implementation starts until root supplies fresh verified Task2 BASE and explicit GO after review, exact CI and persistence.

### Phase06 Task4 — private comparison design rulings, implementation pending


Root read the full task-4-preflight.md. It supplies the concrete proposed API/DTO/one-statement read design and resolves the plan's underspecified read contract. Actual verified Task3 shared policy/exports must still be rechecked before future implementation.

1. Ruling: approve CURRENT_MAPPING based on exact semantic identifier equality for the item's currently linked exact entry/optional variant, permitting retained older revisions only with explicit original/current revision and identifier metadata; add explicit HISTORICAL_MAPPING for verified retired historical bindings of that same current exact target — title/translation edits should not erase valid recorded source history, while retired/changed mappings must not silently become current fallback — cost a second explicit scope, stale metadata and UI explanations. An old item link is never recoverable through a client token after relinking; variant-null is entry-only, not all variants. No private condition/grading qualifier inference. Current/historical display grants remain independent and default empty.

2. Ruling: approve strict decimal-string/stored-scale contracts in Task4, real owner GET summary/source-history and manual POST, dedicated auth/dependency/thin route/test/CI support, and a query-proven additive semantic-source history index — the original three-file sketch cannot satisfy bounded complete reads, actual writes, privacy and coherent source provenance — cost a larger but cohesive read/route surface plus index write/storage overhead. Preserve one final MVCC SELECT under existing Collection→item read locks and UTC rather than stitch unrelated owning service transactions or introduce catalog-after-item locks. Do not add a persistent summary/group framework. Use representative PG query plans to justify final index; omit speculative indexes or propose a concrete narrower alternative if needed.

3. Ruling: keep aggregate always null and define currencyConflict across latest manual plus ALL eligible external groups in selected scope independently of page cursors — prevents a first page from falsely implying one currency or a request for old manual history changing headline semantics — cost explicit conflict-scope metadata and indexed/budgeted diversity probe. No count-all/unbounded history, unsafe bigint JSON construction or silent timeout-as-empty. Proposed page/body/cursor/response ceilings and finite SQL/connection budgets are conservative implementation defaults; verify actual worst-case encoding and real plans before asserting numeric work/latency bounds.

Task2 Minor disposition: Task4's semantic source endpoint fixes kind/currency and needs a semantic-source history index. It does not consume the Task2 provider-wide unfiltered chronological list. Therefore a speculative additional provider-wide chronological index is not required merely to erase the old Minor; keep that unconsumed service performance note for final phase triage unless a real consumer is introduced. Existing Task2 migration must never be rewritten.

Production MarketDisplayPolicy remains empty unless an explicit future trusted activation grant is provided, independent of registry/scheduler enablement. No external GET fetch, public comparison endpoint, provider/billing/license framework or live activation. Tests may inject trusted policy and stored fake-provider facts through deliberate dependency seams; do not create a permissive production fallback to facilitate browser fixtures. Future Task5 must accurately distinguish full endpoint integration proof from any UI transport fixture, with facts produced by real ingestion/query rather than invented DTO values.

All why/cost rulings above are binding preparation only. No Task4 implementation until Task3 reviewed/exact-CI/persisted and root gives explicit fresh BASE/GO. Preserve all other agents' work and root prep.


### Phase06 Task2 — immutable external market observations verified

Source `02d33f02cbafd8e7445c01955ebab36a24b926a1` from BASE `d55c86a4cfb60561e98eec996f0d72643a022df4` is pushed and exact-remote verified. Independent task review SPEC compliant / QUALITY approved, 0 Critical / 0 Important; one new nonblocking history-index Minor plus carried operational evidence-noise note. Report/review/full local evidence are preserved in this phase workspace. Exact-source CI `39090524776` / job `117566093884` SUCCESS; complete DB/native migration, production browser and image/container steps passed. Captured exact-head returned tail is truncated and contains no test-count result lines: no remote pass totals are inferred. Sibling run `39090528155` / job `117566103103` also SUCCESS; both complete job/step metadata are captured before any completion-docs push. Both full verification runs passed, with no contrary result.

Delivered dependency-free provider types/strict immutable registry (production empty), all seven point/range source kinds, exact bigint and sealed ISO exponent snapshots, bounded qualifier/confidence/reference/time metadata and source precision. Global catalog facts never inherit personal item/owner/condition/grading. Native current immutable-snapshot/exact active identifier/variant guards take entry SHARE before variant SHARE. EVENT versus persisted POLL identity plus metric/kind/currency/JSONB qualifiers keeps equal retries immutable and rejects divergent same-key batches atomically. First fetched time/original revision and identifier provenance survive equal retries. Native no-op UPDATE rejection, provider-scoped trusted DELETE compatibility and additive migration `20261018022132_market_observations`; no reset/history rewrite or live purge.

The owning ReadCommitted wrapper and independent transaction-scoped ingestion seam validate/copy before DB acquisition; empty batches still lock/validate exact target and time before returning count0. Task3 remains responsible for atomic successful receipt, overall provider/poll request consistency, committed pre-fetch skip, bounded default-off producer and cancellation/lifecycle; Task2 alone proves neither exactly-once HTTP nor live-provider readiness. Task4/5 read/API/UI and Task6 licensed real adapters remain pending.

Local evidence: Task2 focused20/20; final Task2 plus strengthened manual UTC seams37/37; affected real-PG catalog/item-link/valuation55/55; ordinary workspace482 pass/181 explicitly DB-gated skipped. Pinned Node24.19.0/pnpm10.17.1 lint/typecheck/production build passed; post-test hardening compiler/format checks passed. Dedicated non-UTC session tests assert outside-before/in-TX/outside-after backend PIDs identical, UTC only inside and Berlin restored after, including year0001 roundtrip; approved Task1 Minor now strengthened without valuation production changes. Raw failures and command-output warnings remain preserved, no misleading green-only chronology.

Task2 minor (deferred): provider-wide default chronological listObservations query cannot directly use its optional kind/currency-leading history index for ordering. Task4's planned semantic-source consumer uses exact kind/currency and its own query-justified index; do not claim this closes the unrelated provider-wide tuning note or add unused indexes only to erase it. Carry final phase triage. Existing dependency/image/bundle/OpenSSL warnings remain explicit Phase13 operational followups, not rewritten logs or a new broad audit.

All source remains on the unmerged draft feature branch. No provider calls, credentials, production seed/grants, payment, destructive operation, merge or deployment. Canonical count advances only this reviewed/exact-CI task:36/91, Phase06 two of six; Task3 is next after completion persistence.

### Phase06 Task5 — valuation UI and legacy-money boundary rulings, implementation pending


Root read the full task-5-preflight.md, including the legacy interpretation alternatives and exact split browser proof. Actual verified Task4 contract/exports remain a future implementation prerequisite.

1. Ruling L1: deliver the new valuation UI isolated from legacy purchase/custom/catalog MONEY scale interpretation, preserving old stored integers, accepted currency/read shapes and existing safe-number write contract; do not infer absent historical exponent metadata or swap the universal legacy helper to today's ISO table — a canonical display conversion or rescaling could silently change an old author's intended amount, and no trustworthy classification evidence exists — cost the known legacy ICU-scale defect remains unresolved, with an explicit blocker before claiming canonical legacy totals/reporting or release. New valuation histories require stored exponent and never import/seed themselves from a legacy price. Phase07 dashboard/totals and Phase08 export/insurance preflights must address this load-bearing interpretation gate before using legacy prices as canonical monetary facts; Phase13 release must resolve or clearly restrict affected unclassified operations. Do not silently park this as cosmetic polish or claim all money is canonical. A future metadata/interpretation migration requires separate scoped design, historical evidence and operator classification; no automatic backfill/conversion now.

2. Ruling: allow the separately bounded numerical-only catalog display repair during Task5: replace catalog-facts' unsafe Number division with the existing exact legacy safe-integer-to-decimal/display path (e.g. existing displayCustomFieldValue), preserving its existing legacy exponent interpretation — removing floating-point digit loss does not require inventing historical scale — cost minor localized currency-code presentation differences and focused max-safe/zero/DE/EN tests. This repair must not alter stored values, purchase/custom inputs, accepted currencies or grading semantics, and must not be called ISO-scale remediation. If actual final source has already changed this seam, report the new evidence and omit redundant work.

3. Ruling: approve dedicated private page/controller/components, item-only navigation and page-local same-item locale controls, pure .test.ts exact-format/state tests plus registered actual desktop/mobile Playwright journeys rather than an unexecuted .tsx sketch/new DOM stack — the repository's real test harness and input-locale semantics are authoritative — cost supporting component/test files and explicit draft-discard language action. Keep bounded single-page/source state, independent read/mutation generations, no automatic POST retry, truthful ACK/refresh-failure/unknown-outcome handling, inactive read-only and all seven source kinds/scopes/time precisions.

4. Ruling: use the proposed honest split integration proof: actual production browser manual/default-off journeys, independently real DB/auth-route/query entitlement tests, and external UI rendering with transport responses produced by real ingestion and trusted test-only query policy in the Playwright worker — production empty display policy must not gain a test backdoor — cost the granted external browser display proof is transport rendering, not a production HTTP grant activation. Label this distinction explicitly in report/CI evidence. Test every fixture's real persisted facts/DTO, intercept only exact owner GETs, never manual POST/auth/public routes, and use nested attempt-all cleanup so route teardown failure cannot skip owned DB resources. No invented DTO or permitted-provider fallback.

All why/cost rulings are preparation only. Task5 implementation still requires Task4 reviewed/exact-CI/persisted plus explicit fresh root BASE/GO. Do not touch source/DB/test harness now.

### Phase06 Task6 — exact bounded adapter/permit design rulings, implementation pending


1. Ruling: approve narrow explicit canonical versioned identifier bindings for Scrydex Pokémon named print variant and PriceCharting curated product/category/console, as proposed in task-6-preflight.md, with exact response ID/variant/console validation; reject UPC/query ingestion and defer candidate-resolution helper — best-match text/UPC discovery is not authoritative catalog approval and the finalized registry has one explicit namespace/type per provider — cost curated mappings and reduced initial coverage relative to the plan's broad UPC/query sketch. No registry/schema alias expansion or automatic first-variant/genre guess. Require non-null explicit Scrydex catalog variant; entry-only PriceCharting remains precisely the persisted exact target, never widened. Product versus Products primary-document distinction is resolved by indexed official text; document direct403 and recheck exact single-card envelope before implementing its supported schema. If an envelope remains ambiguous, support only an explicitly documented validated shape and fail closed; no paid probe or missing-as-empty guess.

2. Ruling: approve conservative CATALOG_VALUE plus sourceMetric/qualifiers/methodology for these current guide statistics, with no completed-sale mean/median claim; preserve each explicit valid numeric zero as the upstream guide field's exact zero, distinct from absent/null — silently omitting a valid zero would violate the established missing-versus-zero boundary and imply an empty successful response — cost a potential undocumented upstream sentinel can appear as a source guide quote in fake-contract tests, so zero semantics are an explicit unresolved activation gate before real fetch/display. Do not claim zero proves an item's market worth, invent a positive estimate, or mark omitted data present. Production stays disabled until provider sentinel rules are verified. Malformed/negative/precision-overflow values fail the batch; null/absent metrics remain absent. PriceCharting USD-only guide profile is another explicit purchased-guide denomination gate, not a universal currency assumption.

3. Ruling: approve minimal durable non-expiring per-credential PG in-flight claim, conservative counted attempted-call budgets and >=1000ms monotonic cooldown AFTER complete transport settlement before compare-and-clear — this proves cross-replica actual request spacing even if a sender pauses after reservation or a connection dies — cost one operational model, lower throughput and manual verified-drain recovery after crashes/uncertainty. No TTL, automatic restart takeover, detached cooldown, timer-only proof or claim deletion during provider purge while a sender can resume. All consumers sharing a token must use the same deterministic scope/database gate; fail activation otherwise. PriceCharting token scope cannot vary by worker alias. Use zero production budgets/default-off; proposed finite hard caps may be reduced but require exact tested policy/window/clock-anomaly semantics. These are call caps, not a money-spend guarantee; Scrydex credit/overage controls remain activation gates. No live claim recovery/purge is authorized now.

4. Ruling: approve a narrow optional trusted response-receipt timestamp callback/context addition after reconciling actual Task3 types and registry forwarding, and bounded raw HTTP body transport plus capability-checked JSON.parse reviver source lexemes — waiting for decode/cooldown must not relabel a later time as actual response receipt, and Number decoding must not round money — cost additive cross-task type/handler tests and a pinned runtime capability requirement, rather than a generic parser dependency/framework. Single-response adapters report exactly one canonical body-receipt time before parse/cooldown; no successful output/receipt on later failure. Legacy fake-provider fallback remains explicitly fetch-completion time. Inject existing domain Money capabilities from worker to avoid market-data↔domain dependency cycles; no duplicate currency table or unsafe cast that conceals unsupported runtime behavior.

## Future implementation/report contract

Actual run.ts composition must inject real factories, shared request permit, explicit supported registrations and finalized handler/lifecycle only after config validation. Both provider flags/global sync remain false by default; enabled config requires finite positive budget/policy and valid private credentials, invalid enabled configuration fails startup with constant sanitized errors. No URLs/token/header/body/cause/provider error stack in broker output. One HTTP attempt per high-level fetch, no redirects/hidden retry/pagination; each future expansion must take a separate shared permit.

Native gate constraints and real PG separate-client concurrency/crash/non-steal/cooldown/budget tests are required, alongside exact fake raw-HTTP mapping/amount/zero/time/error/cancellation tests and actual worker default-off/injected composition/queue receipt retry proof. Reports must accurately distinguish fake contracts from provider authentication/licensing and precise start-spacing proof from process-local timers. No real adapters may be advertised as live-ready solely from these tests.

Before any future provider activation, Task6/Phase13 must verify subscribed rights for storage/private/public display/history/links, sentinel/currency semantics, exclusive shared-token routing, finite credit/request controls, real cancellation/driver bounds and a tested authorized disable-fetch+read/all-replica drain/queue-redrive/manual-replay barrier/provider purge/verification/reactivation runbook. Gate recovery must never release an old possible sender. Root's drain-only replay limitation remains explicit; no license/payment/account subsystem is authorized. No live activation or destructive operation now.

Future Task6 source GO requires Tasks3–5 independently reviewed, exact CI verified, source/evidence pushed, canonical main-ledger-only sync and explicit fresh root BASE/GO. Preserve all root-owned progress/context/prep and other agents' WIP. Write task-6-report.md and logs/task-6-* only after implementation, commit own source/evidence, no children or source push. This file resolves design questions, not a checkoff.


### Phase06 Task3 — idempotent bounded market synchronization verified

Source `8b15141a053711594f1d1ed28560c92b13da4373` from BASE `3861f5186b1e9e905308824cfff8d5ecb7f5f3f2` pushed/exact-remote verified. Independent SPEC and QUALITY approved, 0 Critical / 0 Important / 1 nonblocking bundle-warning Minor. Exact-source CI `39092715952` / job `117572654662` SUCCESS, all real database, production browser, image/container and native image processing steps passed. Captured exact-head returned log is a truncated120000-character tail without pass-count result lines; no remote test totals are inferred. Sibling `39092712883` / job `117572644973` also SUCCESS. Both complete job/step metadata are captured before any completion-docs push; no contrary result.

Delivered strict persisted market.sync payload with poll UUID before enqueue, immutable native successful receipt (including count0), exact request equality/conflict and pre-fetch committed skip. Provider/poll advisory serialization rechecks receipt, then Task2 ingestion and receipt commit in the same ReadCommitted/LOCAL UTC transaction; failed writes leave neither partial batch nor success receipt. recordedAt is receipt insertion time, never an exact commit timestamp. Existing source history/quantity/private facts are unchanged. Concurrent precommit HTTP remains possible; no exactly-once external I/O claim. Additive migration20261018025000_market_sync follows20261018022132, no reset/applied-history rewrite.

Actual run.ts/main.ts composition registers opt-in cancellable handlers and default-OFF bounded producer: durable global cursor, atomic pg-boss send+cursor transaction, at most32 candidates per global tick of at least60seconds, at most256 created/retry/active jobs, hourly mapping slots, explicit three-attempt backoff/expiry/retention. Exact active catalog mappings only; no private joins, title match or catalog locks across fetch. Runtime aborts first, tracks actual settlement/shared concurrent stop, attempts independent cleanup and withholds Prisma disconnect on unsettled market work. A15second watchdog reports failure, never pretends an uncooperative transport has stopped. Dedicated bounded DB client and queue pool acquisition plus SQL deadlines are tested. Production registry stays empty; enabling config alone creates no real provider.

Local pinned-runtime evidence: final focused76/76 including16 realPG; affected36/36 DB; ordinary workspace502 pass/195 DB-gated skipped, with two later DB-only cases explicitly covered in final focused runs rather than retrospectively counted as unit passes. Lint/shared+web types/full production build passed; final worker bundle rebuilt after query refinement. Generated-web duplicate-type initial failure recovered by normal required Next production regeneration, no source/manual generated-file deletion. All exact exit codes, silent compiler outcomes, initial failed fixture/type/scaffold attempts and corrected behavioral RED/GREEN remain in task-3-report.md and raw task-3 logs. Real broker retry preserves poll identity and skips a second fetch after commit; native receipt guards, atomic rollback/counts, controlled advisory conflicts, dedicated three-PID non-UTC/year0001, admission capacity/cursor rollback/throttle and actual runtime signal/producer lifecycle are covered.

Cannot-verify inherited Task2 internals are resolved by its independent task-2-review.md, both exact02d33 CI passes and completion3861 product-source proof, plus this affected DB evidence; no duplicate broad audit. Task3 Minor (deferred): successful worker7.0MB/maintenance build emits size warnings; retain output and Phase13 operational/bundle baseline followup, never call it pristine. Task2 unconsumed provider-wide history-index tuning note remains final-phase triage.

Task4 private summary/manual API, Task5 UI and Task6 actual adapters/per-token permit remain pending. Task3 fetchedAt is explicitly legacy/fake-provider fetch-completion fallback; actual body-receipt callback and every-attempt shared token limiter are future Task6 responsibilities. Licensing/zero/currency/display/retention, verified fleet/queue/redrive/manual replay drain and authorized purge/reactivation are production gates. Current source does not activate providers, accept licenses, call paid APIs, grant real roles, purge data, merge or deploy. Earlier Task5/6 design rulings and the load-bearing legacy-money interpretation gap are preserved above, not resolved by this task.

Canonical37/91, Phase06threeofsix. Completion docs/push/main-ledger-only persistence precede explicit fresh Task4 source GO; draft remains unmerged and undeployed.

### Phase06 Task4 — coherent read implementation ruling


Ruling: use one bounded RepeatableRead read transaction rather than one composite SELECT — exact historical eligibility and all-eligible currency diversity require canonical CatalogSnapshotSchema validation for encountered revision snapshots; reproducing the schema inside SQL would duplicate its authority, while validating only returned rows could let malformed hidden candidates alter a headline conflict flag — cost additional bounded query roundtrips, finite serialization retries and rare concurrency latency. This explicitly supersedes older one-SELECT/ReadCommitted read-query wording in the proposal and this context, not the existing manual POST transaction.

Keep Collection→item SHARE lock order, no catalog locks and no HTTP; every manual/catalog/source/group/diversity read uses the same RepeatableRead MVCC snapshot. Cache canonical validation per encountered revision within that transaction. No independently owning service calls or validation after discarding the snapshot. Do not silently cap eligibility and return a false currencyConflict; unsupported/incoherent data fails closed and total processing exhaustion returns sanitized503.

At most3 complete attempts, only for specifically recognized serialization/move races; rollback/release before retry. Do not retry invalid input, invariant/schema errors or ordinary timeout/dependency failure. Actual2s acquisition/maxWait,5s per-transaction,2s statement and500ms lock ceilings remain conservative defaults. Track a finite monotonic overall read-work budget across retries and candidate validation loops, clamping new attempts/work to remaining budget. Whole HTTP latency also includes acquisitions/retries/authentication, so do not claim a universal5second HTTP deadline or pretend Promise.race terminates SQL. Avoid a generic deadline framework. Report chosen overall bound and actual driver/SQL settlement evidence.

The new query DB interface may use RepeatableRead; existing addManualValuation POST remains ReadCommitted and unchanged. Capture readAt once from database-authored read/transaction-start time and document its updated semantics; it is neither an exact single-statement/commit/snapshot-LSN time nor a version shared by cursor pages. DTO price observation/fetch/recorded timestamps retain their own meanings. Root approved this concrete change before query implementation; no user approval cycle needed.

### Phase06 Task6 — verified worker seam reconciliation rulings


Root read task-6-reconciliation.md against verified c7a4030. Task3 already supplies optional signal context, a bound fetch method forwarding context, MarketRequestPermit, explicit registrations input, bounded market client, accurate fetchedAt repository parameter and safe stop failure guard. Do not recreate these APIs or rewrite queue/receipt/scheduler code. Task4 is sole implementer; Task6 still NO SOURCE GO.

5. Ruling: approve a small market-data-owned provider failure class with fixed allowlisted codes and internally determined terminal/retry classification, recognized by the existing sync handler — actual adapters need to avoid paid retries for known malformed mappings/permanent denial without importing domain errors backwards — cost a narrow shared error contract and focused handler/adapter tests. No arbitrary provider message/body/cause/stack may enter that class or broker output; validate codes at runtime and construct fresh constant broker errors. Cancellation still takes priority; unknown/transient exceptions retain bounded retry. No generic error framework, raw provider-status passthrough or dependency cycle.

6. Ruling: approve an optional worker-owned requestLifecycle.stop hook in composeMarketSync, supplied by the real permit and included in the existing market stop aggregate — Promise.allSettled(handlerPromises) alone cannot prove cleanup/drain when an earlier settled handler left a durable unresolved claim — cost an extra lifecycle dependency and conservative failed shutdown/manual recovery after latched uncertainty. The permit tracks actual local transport/cooldown/cleanup work and latches unresolved local claims, never clears them automatically on startup/stop or forgets failure when a handler leaves the pending set. Stop is idempotent, closes admission synchronously, aborts requests, waits real settlement/cooldown and independent bounded compare-and-clear bookkeeping even if request signal is already aborted, then rejects on unresolved local uncertainty. Existing main no-DB-disconnect-on-market-failure guard must apply; watchdog timeout is failure, not physical cancellation. A normal successful local stop never claims fleet-wide drain or authority to clear another process's claim. Shared-token/fleet recovery remains the explicit later operator gate.

Implement these only after future Task6 GO with final Task4/5 exports rechecked. Test an earlier completed handler whose permit cleanup failed still makes later stop reject/withhold DB disconnect, normal abort fully settles/releases before stop success, ignored cancellation remains unsafe, and callback forwarding/validation/time provenance. The existing15s watchdog is a failure bound, not a new promise that nominal per-stage timeouts prove every shutdown succeeds. No source changes now.

### Phase06 Task6 — shared token identity clarification


Ruling: credential request gates and attempted-call counters use a constant upstream-service scope plus exact API-token bytes; changing Scrydex team ID, catalog category, provider registration alias or worker instance must not create a fresh gate for the same token. Team ID remains a private request-authentication parameter, not evidence of independent quota. Why: otherwise configuration changes could bypass a still-active sender or reset token-level counters. Cost: conservative shared throughput/budget across teams and categories; a less restrictive split requires explicit provider quota evidence and a separate reviewed policy. PriceCharting always shares one gate per configured token across all product categories/replicas. Do not include raw credentials or fingerprints in broker/log/display output. This clarifies and supersedes the preflight's Scrydex-team-in-fingerprint suggestion before implementation.


### Phase06 Task4 verified — private source comparison API (2026-10-18)

Source fe15a8bcb40e926fffd69e991ae09e73f0fb048b plus fix e75067846afa112a78493d8d10b36682410f4eb2; exact tested HEAD25e36584bc1cea04ef12e672c629b040b4fea910 includes report-only final commit. Strict decimal-string bigint/stored-exponent contracts, real owner summary/source-history GET and manual POST, bounded semantic current/historical mapping groups and keyset histories, independent manual latest, page-independent all-eligible currency conflict and aggregate:null. Fresh owner sessions, explicit private DTO projection, actual streamed body/query/response bounds, no-store, default-empty independently trusted display policy; no GET fetch/queue work or public/private fact mixing. Query-proven additive migration20261018033424_valuation_source_history uses actual8,008-row plans with direct one-row group/six-row source scans. Earlier Task2 unconsumed provider-wide chronological-query performance Minor remains separate.

Approved coherent bounded RepeatableRead adjustment is recorded above and in task-4-context.md: canonical immutable snapshot validation per encountered revision, Collection→item SHARE, no catalog locks/provider HTTP, bounded work/retry/SQL/acquisition budgets and honest readAt semantics. Initial independent SPEC/QUALITY found0Critical/2Important/0Minor: actual Prisma P1001/adapter outage shape incorrectly500, and stale pre-acquisition remaining SQL limits/missing post-query empty-history deadline. Fix round1 corrected supported outage→sanitized503 without masking unknown faults or broadening serialization retries; actual post-acquisition/per-query timeout clamps and post-await/before-return checks enforce processing/DB budget, with native cancellation and awaited settlement. Scoped independent re-review closes both, SPEC compliant/QUALITY Approved,0Critical/0Important/0newMinor. No universal whole-HTTP deadline asserted.

Evidence: initial67/67 affected tests, workspace508pass/228native-gatedskip, full lint/types/build pass; fix affected native37/37 and strengthened6/6 targeted regressions, final scoped types/lint/format and production build pass. Actual ownership/foreign/deleted-parent/lifecycle, concurrency/item-move/deletion retry, append blocking/timeout, malformed retained snapshot exclusion, mapping/grant boundaries, UTC/year0001, exact money and1,419,287-byte worst-page response covered. Both exact corrected-source CI39095599056/job117581267901 and39095597661/job117581264889 SUCCESS, including native DB, production browser journeys, web/worker containers and native image processing. Tool-returned120000-character primary log tail is truncated and contains no test-count lines; no remote totals inferred. Complete metadata for both runs retained in task-4-ci-25e3658-steps.json. Both superseded fe15 CI runs later completed SUCCESS by metadata; this does not replace corrected-source CI, and original in-progress metadata/diagnostic gap is preserved.

All expected REDs, typing/test-fixture and harness failures plus recoveries are retained in task-4-report.md/task-4-fix-report.md and logs. Reports/reviews are under .superpowers/sdd/2026-09-19-06-valuations-market-data/. Task5 actual-interface read-only reconciliation found no blocker; UI, real adapters and whole-phase review remain pending. Task6 additional readonly reconciliation and approved failure/lifecycle/token-only scope rulings are retained. Future Phase07 design preflight exists only as preparation, requires root adjudication and actual final Phase06 reconciliation; no Phase07 source/task completion. No real provider activation, role assignment, purge, merge or Sammlerraum deployment.

### Phase06 Task5 in-progress browser harness ruling (2026-10-18)

Task5 in-progress harness Ruling: isolate each owned synthetic credential-login client with a unique reserved documentation/benchmark IPv4 through the existing forwarded-IP path, confirming installed normalization/key and no pre-existing collision; delete only its exact owned rate-limit row in attempt-all cleanup — real shared-loopback max5/60s throttles the ten-case browser suite, and global deletion would affect unrelated counters — cost this fixture isolation does not establish production reverse-proxy/IP trust. Credentials/sessions, production auth/rate-limit settings and global browser headers stay unchanged; original429 evidence retained. This is no Task5 completion or live configuration change.

### Phase06 Task6 pre-implementation claim acknowledgement clarification (2026-10-18)

Ruling: ambiguous acknowledgement always latches local lifecycle failure, but a durable database claim blocks replicas only while actually present. Ambiguous admission must never send HTTP; if committed, its non-expiring claim/counters remain. Post-settlement compare-clear can commit despite lost acknowledgement: transport and full monotonic cooldown already finished, so idle DB and a safely spaced successor are legitimate, while the old local stop still rejects/withholds DB disconnect. A clear that did not commit leaves the claim held — a successful clear cannot become globally blocked merely because its ACK was lost — cost conservative local failure/manual inspection can coexist with idle gate or another legitimate sender; no false global-blocked/fleet-drained guarantee or automatic recovery/refund. Root read and approved the narrow agent clarification; native tests must distinguish actual admission/clear commit outcomes with separate clients. No Task6 source GO, implementation or live action.

### Phase06 Task5 initial independent review and fix round1 (2026-10-18)

Independent SPEC issues/QUALITY needs fixes:0Critical,1Important,1Minor on source204dfe4. I1 accepted: source-history404 cleared expanded rows but same-scope cached groups/seed observations and off-page currencyConflict stayed visible during/after failed owner-summary recheck. Original implementer resumes fix round1/5 with immediate external invalidation, manual/draft preservation and focused pending/failure/fresh-success tests. No task completion yet.

Ruling: defer Minor M1 conflicting NO_COLOR/FORCE_COLOR runner warnings to Phase13's shared harness color-policy cleanup — all final runs passed and warnings are disclosed; changing shared process environment is unrelated to the narrow source-authority fix — cost retained warning noise, no warning-free claim. Never filter/rewrite existing raw evidence or relax tests to hide it.

### Phase06 Task6 pre-implementation credential serialization clarification (2026-10-18)

Ruling: reject empty/padded/control credentials at factory/config entry, then use the identical accepted token bytes for both gate fingerprint and actual HTTP authentication; never independently trim/hash differing forms — a pinned Node24.19.0 no-network synthetic Headers probe confirms X-Api-Key padding is removed by header serialization, creating a gate-alias risk if raw padding were hashed — cost stricter invalid config rejection with sanitized errors, no speculative vendor-format restrictions. Scrydex team remains outside token gate identity. Future focused config tests required. No source, real credential or network/DB operation and no Task6 GO.


### Phase06 Task5 verified — private localized valuation history (2026-10-18)

Source204dfe46717ecf61e2f465eb3d8bb8bd1e550b00 plus fix96bca4743e4785f9cd0fafbcfd111ebe8343f4bb. Private dynamic/noindex fresh-owner page, actual owner item navigation including inactive items, DE/EN responsive manual form/history and separately bounded source groups/history consume Task4 contracts/API. Exact bigint/stored-exponent presentation and canonical current-currency/input parser preserve zero/max/year0001/0-2-3-4 scales; explicit note2000-codepoint/UTC input. Scoped numerical-only catalog display repair removes floating digit loss while preserving legacy scale/input/storage; L1 remains a load-bearing Phase07/08/13 interpretation gate, not resolved or cosmetically dismissed.

Read/mutation/source generations, synchronous submit guard, dirty locale/scope draft preservation, ACK separate from latest, acknowledged-refresh failure and unknown outcome/no automatic POST replay, inactive authority and contextual401/owner404/source404 behavior tested. Independent initial SPEC/QUALITY0Critical/1Important/1Minor found cached source seeds/off-page currency claim surviving source404 plus failed owner recheck. Fix round1 externalInvalidated atomically suppresses all old external rows/claims/controls/selectors until current validated summary succeeds, retaining manual context/draft. Meaningful populated controller and real browser20-old-rows REDs preceded correction; scoped independent SPEC/QUALITY APPROVED,0Critical/0Important/0newMinor. M1 color-runner noise explicitly deferred Phase13 under prior ruling, not counted fixed.

Local evidence: initial550 workspacepass/234native-gatedskip,54 realPG,42 focused pure,12 production browser(6desktop+6mobile), final amended ENmobile1, full lint/types/build. Fix affected16 pure plus four DE/EN desktop/mobile external transport cases and full lint/types/build pass; original full/native results are not misrepresented as fix reruns. Real production manual/default-off HTTP proof is separate from external browser GET transport generated by actual ingestion/query/trusted worker policy; no production grant backdoor, POST/auth/public interception or live provider call. Scoped credential fixtureIP only with exact owned rate-limit cleanup keeps actual auth/rate config; production reverse-proxy trust remains a separate gate. All RED, fixture/rate429/teardown/typing failures and successful recoveries retained honestly.

Both exact corrected-source CI39098898037/job117590925497 and39098895696/job117590917344 SUCCESS, including actual new valuations production step, nativeDB, full browser/static/build/container/native-image gates. Primary returned120000-character tail truncated/no test-count lines, no remote totals inferred; both complete step metadata retained in task-5-ci-96bca47-steps.json before completion push. Both superseded204 runs alsoSUCCESS with separate primary tail/complete metadata; they do not substitute for corrected-source CI.

Four synthetic screenshots outside repo labelled production/default-off versus query-generated external transport, with exact source limitations in reports; root independently inspected DEdesktopproduction and ENmobileexternal/readable crops, no required layout change. Final external captures match fix96; original production positive-path captures match204, unchanged by rejection-only fix. Owned fixture users/categories/observations clean, owned browser/server stopped, shared root-owned PG17 retained. Reports/reviews task-5-report/fix-report/review/fix-review.md and raw logs retained. Task6 actual committed Money/worker seams reconciled ready; approved Ruling7 acknowledgement and Ruling8 credential-byte clarifications retained, source GO still sequential after persistence. Future Phase07 preflight/legacy-money-design/progress remain provisional preparation only, no classification/migration/Phase07 checkoff. No source merge, Sammlerraum deployment, real provider/role/purge or real-data action.
