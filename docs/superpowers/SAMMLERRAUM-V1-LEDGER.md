# Sammlerraum V1 Completion Ledger

**Stand:** 20.09.2026
**Master plan:** `docs/superpowers/plans/2026-09-19-sammlerraum-v1-master-plan.md`  
**Canonical product/system spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`  
**SEO/Search Console spec:** `docs/superpowers/specs/2026-09-19-seo-search-console-design.md`

This is the handoff/status file for long-running implementation. Update it after every completed and reviewed task.

| Phase | Plan | Tasks | Status | Next |
|---|---|---:|---|---|
| 01 | Platform Foundation | 6 | complete (6/6) | — |
| 02 | Identity, Auth & Policies | 7 | Task 1 reviewed; CI pending | Task 1 gate |
| 03 | Collections, Items, Fields & Locations | 8 | not started | Task 1 |
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

No external blockers recorded yet.

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
