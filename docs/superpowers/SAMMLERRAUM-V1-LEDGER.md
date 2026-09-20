# Sammlerraum V1 Completion Ledger

**Stand:** 19.09.2026  
**Master plan:** `docs/superpowers/plans/2026-09-19-sammlerraum-v1-master-plan.md`  
**Canonical product/system spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`  
**SEO/Search Console spec:** `docs/superpowers/specs/2026-09-19-seo-search-console-design.md`

This is the handoff/status file for long-running implementation. Update it after every completed and reviewed task.

| Phase | Plan | Tasks | Status | Next |
|---|---|---:|---|---|
| 01 | Platform Foundation | 6 | in progress (3/6 recovered) | Task 4 |
| 02 | Identity, Auth & Policies | 7 | not started | Task 1 |
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

No implementation tasks have been executed yet. The repository currently contains the approved product/system/SEO designs and detailed implementation plans.

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
