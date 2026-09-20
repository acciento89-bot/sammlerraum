# Sammlerraum V1 Completion Ledger

**Stand:** 20.09.2026
**Master plan:** `docs/superpowers/plans/2026-09-19-sammlerraum-v1-master-plan.md`  
**Canonical product/system spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`  
**SEO/Search Console spec:** `docs/superpowers/specs/2026-09-19-seo-search-console-design.md`

This is the handoff/status file for long-running implementation. Update it after every completed and reviewed task.

| Phase | Plan | Tasks | Status | Next |
|---|---|---:|---|---|
| 01 | Platform Foundation | 6 | complete (6/6) | — |
| 02 | Identity, Auth & Policies | 7 | complete (7/7) | — |
| 03 | Collections, Items, Fields & Locations | 8 | in progress (2/8) | Task 3 |
| 04 | Media & Documents | 6 | not started | Task 1 |
| 05 | Catalog, Condition & Grading | 7 | not started | Task 1 |
| 06 | Valuations & Market Data | 6 | not started | Task 1 |
| 07 | Search, Smart Collections & Dashboard | 5 | not started | Task 1 |
| 08 | Import, Export, Insurance & Reports | 7 | not started | Task 1 |
| 09 | Collaboration, Sharing & Audit | 7 | not started | Task 1 |
| 10 | Community, Moderation & Notifications | 8 | not started | Task 1 |
| 11 | AI-Assisted Capture | 5 | not started | Task 1 |
| 12 | Premium & Billing | 5 | not started | Task 1 |
| 13 | Integration, Hardening & Release | 7 | not started | Task 1 |
| 14 | SEO & Google Search Console | 7 | not started | Task 1 |

**Total:** 91 implementation tasks.

## Update rule

After each task is implemented, tested, reviewed and committed:

1. tick that task's boxes in its plan;
2. update this ledger's Status/Next cell;
3. append the implementation commit and review outcome below;
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
