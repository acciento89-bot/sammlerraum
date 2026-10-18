# Task 7 implementation report

Status: implementation ready for root independent review and exact-source CI. Final production DE/EN desktop/mobile journeys and visual QA passed. Root owns task/phase completion; no canonical checklist or ledger was changed.

BASE: `3b535da9ffcafb24c804c7fa4af09aad54428c38`. Root GO followed Task6 independent review, exact CI and persistence. Design preflight was read-only. Existing feature checkout and PostgreSQL17 test environment; pnpm10.17.1 throughout. No subagents, local Docker, provider calls, production initializer, role grant outside synthetic fixtures, push, merge or deployment.

## Implemented source

- Authenticated warm-paper DE/EN catalog search/detail, disambiguated variant selection, independent personal link/unlink, condition/category and grading forms. Editors are siblings after ItemForm's main form; no nested forms or core payload expansion. Existing saved-ID gating is retained. Archived/disposed metadata is owner-readable and presented read-only, including retained inactive condition/variant facts.
- All seven strict proposal operation kinds have ordinary human field forms, typed category attributes, explicit translations and canonical sources. Required summary and optional distinct review-evidence URL. Only canonical fields are composed; no copied personal item object, condition, grading, acquisition or private notes. Own proposal outcomes, actual-grant review/approve/reject reason controls, stale/conflict/replay handling, canonical history and reasoned CAS restoration reuse existing protected services.
- Advisory own capability route and bounded authenticated history list/read routes reuse fresh sessions, no-store envelopes, strict query/revision/cursor validation, canonical-only projections and existing grant enforcement. No role-write endpoint or persistence migration.
- Explicit worker-runtime operator initializer, default dry-run and deliberate `--apply`, installs only approved trading_cards/vinyl templates/schemes. Every starter band is null. One transaction and namespaced operator lock cover all semantic preflight and reused maintenance writes; a typed condition-service adapter uses the enclosing transaction. Reruns preserve identities, inactive flags and appended definitions/options. Conflicting seed semantics fail before writes. Documentation: `docs/catalog-starter-definitions.md`. No startup hook or canonical entries/real grants are created.

## Genuine chronology and integration findings

1. Actual project registrations and dedicated production CI invocation were added before the original E2E. `task-7-discovery.log` proves DE/EN discovery in both desktop/mobile projects.
2. `task-7-original-red.log`: real synthetic owner, valid existing item page, persisted condition and PSA9 API checks passed; page lacked displayed PSA9. This is missing new UI, **not an old grading-overwrite claim**. After independent editors, first GREEN attempt timed out on select label naming; explicit accessible select labels corrected that. Unchanged condition/PSA9 journey passed in `task-7-original-green.log`.
3. History service/HTTP/capability API-surface RED logs preceded implementation; real-PG history/capability tests passed. Initializer missing-module log is not behavioral RED. A runnable nonmutating scaffold then produced actual persisted0-versus2 and missing-conflict failures (`task-7-initializer-behavior-red.log`, scaffold retained). Implementation passed; expanded tests cover atomic rollback after reused writes, conflict preflight, identity/retirement/append preservation and no entries/grants.
4. Browser link initially failed an overbroad locator that matched result/option text before save completed. The corrected journey exposed a real producer integration defect: Next supplies a non-null **zero-byte DELETE stream**, while catalog/grading boundaries rejected any stream. Real-PG `task-7-empty-delete-red.log` records400 instead200/204. Root approved counting bounded bytes and rejecting only nonempty input. All15 catalog/grading route tests passed in `task-7-empty-delete-green.log`; nonempty/oversized, auth and Origin checks remain. Actual DE/EN browser link/unlink then passed. This corrects Task6/Task5 HTTP adaptation, not service semantics.
5. Expanded browser iterations retained all failed logs: translation detail needed to be expanded; EN displays the authored primary title until its explicit translation is expanded; the Next route announcer is another alert outside main. These were test selection/navigation assumptions. Synthetic sign-in limits use the established test-only per-test isolation; production limiter is unchanged.
6. `task-7-grading-retry-red.log` caught a real new-UI recovery bug: acknowledged POST followed by failed sibling refresh, then retry, produced two records. The editor now retains the acknowledged grading identity before refresh, and displays saved-but-refresh-failed copy; retry updates that record. Ambiguous network POST failure retains the existing manual-check advice and never automatically retries creation. Recovery GREEN, actual stale/conflict/replay/reject and revoked-grant rollback UI checks passed in subsequent focused logs.
7. First types exposed the narrow PrismaPromise-only shared grant helper type and unknown test JSON; widened only the read-query type seam and typed the test response. Later web typecheck exposed inherited ignored `.next/types/* 2.ts` duplicates, as in Task5. Four duplicates were preserved outside compiler inclusion at `/tmp/sammlerraum-task7-generated-duplicates`; no source ignore workaround. Normal production build regenerated canonical outputs.
8. First production build caught a .ts test importing a .tsx module under the root compiler without JSX. Form serializers were extracted into `catalog-form-values.ts`; no compiler settings changed. Failed build log retained. Rebuild passed.

9. Visual QA found catalog navigation widening the mobile document beyond its412px viewport. The first window.innerWidth probe passed because the mobile layout viewport expanded too; it is retained as an insufficient probe. `task-7-mobile-overflow-viewport-red.log` then measured actual document474px(DE)/441px(EN) against configured412px and failed both cases. Targeted catalog-nav wrapping fixed the unchanged assertions. Screenshots were regenerated after scrolling to the actual page top to avoid the full-page capture's offscreen fixed skip-link artifact.
10. Self-review identified a real cancellation-state defect: changing own-proposal state filter while a delayed detail request was in flight left rows disabled. `task-7-proposal-cancellation-red.log` captures the disabled-button failure. Invalidating the read now releases busy state, stale pagination is ignored, and filter changes are disabled during authoritative decisions. Final production matrix verifies the unchanged delayed-detail journey in desktop/mobile.
11. The overflow probe initially used a direct DOM global that the root ES-only test compiler does not include. `task-7-build-final-ui.log` retains that failed build; a narrow browser-context structural type annotation fixed it without compiler changes. Final production build, types and lint pass.

## Verified evidence

Logs below live under `.superpowers/sdd/2026-09-19-05-catalog-condition-grading/logs/`.

| Check | Result | Log |
| --- | --- | --- |
| Complete serial real-PG workspace suite, before pure serializer extraction | 74 files,528/528 passed | task-7-full-suite-candidate.log |
| Workspace lint | Passed | task-7-lint-candidate.log |
| Production workspace build after serializer extraction | Passed | task-7-build-values-fixed.log |
| Expanded initializer PostgreSQL tests | 4/4 passed | task-7-initializer-expanded.log |
| Catalog/grading route suite after zero-byte DELETE fix | 15/15 passed | task-7-empty-delete-green.log |
| DE/EN actual proposal forms plus link/unlink focused iteration | 3 passed/1 test translation-display assumption failed, corrected subsequently | task-7-browser-links-forms-fixed.log |
| DE/EN stale/replay/reject/revocation and recovery focused iteration | 3/3 passed | task-7-moderation-recovery-fixed.log |
| Post-extraction serializers | 3/3 passed | task-7-serializer-extracted.log |
| Final production workspace build | Passed | task-7-build-final.log |
| Final post-build workspace types | Passed | task-7-typecheck-final.log |
| Final workspace lint | Passed | task-7-lint-final.log |
| Final real production browser matrix | 28/28 passed, DE+EN in both desktop/mobile; includes overflow/cancellation/recovery | task-7-production-browser-final.log |
| Existing core ItemForm creation and metadata-retry browser regressions, production | 4/4 passed across desktop/mobile | task-7-core-form-browser-regression.log |
| Actual bundled operator CLI default dry-run | Passed; two intended category/scheme actions, no writes | task-7-operator-dry-run.log |

Workspace commands use `npm exec --yes --package=pnpm@10.17.1 -- pnpm` after sourcing the established synthetic test environment. Complete serial suite command was `RUN_DATABASE_INTEGRATION=1 PNPM test --no-file-parallelism`. Final browser command was `RUN_AUTH_E2E=1 RUN_PRODUCTION_E2E=1 PNPM --filter @sammlerraum/web exec playwright test e2e/catalog-grading.spec.ts --workers=1`; actual desktop/mobile project arrays and dedicated CI invocation include the file. New real-PG history/initializer/capability tests are explicitly registered in the serial CI allowlist.

The complete528-test run preceded only pure serializer extraction and later UI/cancellation/CSS edits. Focused serializers, final production build/types/lint and28 production browser tests cover those final changes; per root's instruction an unchanged broad DB suite was not repeated merely for repetition. Exact remote whole-workspace CI remains root-owned. Browser logs contain inherited npm/color warnings; they are not described as pristine output.

## Visual artifacts and self-review

Twelve final production screenshots are preserved in `outputs/phase-05-task-7/`, including DE/EN owner, retained archive facts and restored reference/history screens in both device projects. Author visually inspected desktop owner and both final mobile history screens; root independently inspected desktop proof and the final mobile DE/EN history images. Nav wraps within412px, controls and history remain readable, and retained personal sections stay distinct. Authored fixture titles deliberately carry UUID suffixes; these are fixture text, not internal-ID fallbacks.

Absolute example paths:

- `/Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum/outputs/phase-05-task-7/catalog-owner-desktop-de.png`
- `/Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum/outputs/phase-05-task-7/catalog-review-mobile-de.png`
- `/Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum/outputs/phase-05-task-7/catalog-review-mobile-en.png`
- `/Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum/outputs/phase-05-task-7/catalog-retained-mobile-de.png`

Author self-review checked strict producer use, no raw JSON/internal-ID fallback, private payload separation, form boundaries, archived facts, atomic initializer and authority/CAS behavior. This is not independent review; root owns that gate. No known unresolved functional failure remains in this implemented scope.

## Accepted limits

Canonical browsing remains authenticated. History/search pages are live keyset pages, not cross-request snapshots; CAS protects rollback. History lists omit full snapshots but retain bounded canonical source provenance, so heavily sourced histories can still be large. Single detail snapshots retain producer maxima. Grading remains personal mutable CRUD without a new immutable audit framework, provider verification or universal numeric ranking. Ambiguous network POST outcomes require checking current records before deliberate manual repetition; there is no invented idempotency guarantee.

Starter bands are all null. Adding a band or correcting immutable option semantics later requires new option keys and retirement, preserving old selected facts. The operator initializer has no overwrite mode and never runs automatically. Only its default dry-run CLI was invoked here; real apply behavior was verified through the same service in uniquely scoped synthetic database tests. No production bootstrap, new migration, applied-history rewrite, global canonical sample data, real role grant or external provider action occurred. At final checks, ports3000/3174 had no listeners; unrelated processes were preserved.

Next dev also generated managed-only `apps/web/AGENTS.md` and `CLAUDE.md` during the first browser runs. Their generator and timestamps were checked, bundled Next routing/client/caching guidance was read, and the generated files were preserved at `/tmp/sammlerraum-task7-generated-instructions` rather than committing unrelated repository policy. No source ignore setting changed.

Source/tests/report/logs/visuals are supplied for root review. No push, merge, deploy, exact remote CI success or canonical task/phase completion is claimed.

## Review fix round 1 — I1 condition drafts

Scope is review I1 only, based on `423d095b202e1525684c31054258ef5bbb992f7d`. M1 pending catalog-detail cancellation and M2 warning/bundle diagnostics remain deferred for root's whole-phase triage; this round does not claim to resolve them.

The condition editor synchronized all local fields whenever its `condition` object identity changed. Every successful sibling grading/link save reloads and parses that object, even when saved condition facts are identical. The editor now keys synchronization on saved category/option IDs and item identity, with separate category and option effects. Identical reloads preserve unfinished category, explicit-clear and condition selections. A genuinely changed saved category resets the category draft and its clear confirmation; a changed saved option updates the option selection. Intentional saves still synchronize from authoritative reloaded facts.

New real production browser regressions use existing owner sessions, persisted fixture facts, actual grading writes and canonical link/unlink routes. Before the component fix, the unchanged production server failed all four DE/EN desktop cases at the precise draft assertions: a successful grading save reverted Near Mint to Mint, and a successful link reverted the unsaved no-category selection to the saved category. `task-7-fix1-drafts-red.log` retains these behavioral failures, and the original Playwright error contexts are preserved at `outputs/phase-05-task-7/fix1-red-test-results/`. The same failure assertions remain in the GREEN tests; the later intentional-save portion additionally waits for its successful-save status before reading persistence.

After the narrow component fix, the DE/EN desktop/mobile matrix verifies unsaved condition selection across a grading save, unchanged saved condition before deliberate submission, deliberate condition save, genuinely changed persisted condition synchronization on a subsequent grading refresh, and unsaved category plus checked clear confirmation across link and unlink refreshes. Deliberate category removal clears the saved exact condition and removes the confirmation. The existing original condition/PSA9 journey also remains GREEN in both locales and device projects.

| Fix check | Result | Log |
| --- | --- | --- |
| Unchanged production server, new interleaving cases | 4/4 genuine expected draft-reset failures | task-7-fix1-drafts-red.log |
| Focused production matrix plus original condition/PSA9 regression | 12/12 passed | task-7-fix1-drafts-green.log |
| Workspace production build | Passed | task-7-fix1-build.log |
| Workspace lint | Passed | task-7-fix1-lint.log |
| Post-build workspace types | Passed | task-7-fix1-typecheck.log |

Commands use the established synthetic environment and pinned pnpm10.17.1. RED selected `--project=desktop --grep 'unsaved'`; GREEN selected `--grep 'unsaved|changing own condition'` across both registered projects, with `RUN_AUTH_E2E=1 RUN_PRODUCTION_E2E=1` and one worker. No unchanged broad database suite was repeated for this UI synchronization fix. Ports3000/3174 had no listeners before the production run; unrelated processes were preserved. Independent scoped rereview and exact-source CI remain root-owned gates.

## CI integration C1 / fix round 2 — consistent production browser runtime

Root retained two exact-source CI failures for `a20e7ca53d2793968859b24ca97dc889c75aa013`: runs39079795109/job117534234231 and39079792379/job117534226078. Both passed the36-case production catalog step, then the existing16-case collection/item step failed only its first desktop creation journey: core POST201 returned an ID, but the URL remained on the new-item page after its unchanged5s assertion. The other15 cases passed. Those root-owned truncated CI logs remain separate and were not staged by this fix. They show the URL failure and stream-close warnings, not route timing or a proven compiler cause.

Systematic debugging traced the unchanged save sequence: core POST, acknowledged working ID, concurrent metadata PUTs, then `router.push` after every metadata response succeeds. Task7 mounts its independent read editors once that acknowledged ID is available. No core save/navigation implementation changed. An unchanged local development test passed first with existing cache on Node26, then passed with the preserved development cache removed on the exact CI Node24.19.0. The cold trace shows core POST28ms; first metadata PUTs1337–1680ms, of which Next accounted for1300–1621ms versus37–59ms application work; destination page1269ms, of which Next1205ms versus64ms application work. New condition/grading/link reads began alongside the metadata writes and also incurred initial framework work. The successful local run reached the destination in roughly3s after POST. This supports cold development compilation cost as the CI timing explanation, but **the exact CI failure was not reproduced locally** and no application state-flow bug is claimed solved. No artificial CPU failure, timeout increase, test skip or assertion change was used. The installed Next16.3.5 Playwright guide also recommends exercising production code for E2E.

The first combined production Node24 run passed all16 core cases but failed two auth registration journeys (18/20). A fresh normal Node24 workspace build with no subsequent development server produced the same18/20 result, so reused dev output was not a sufficient explanation. A focused unchanged auth trace and temporary runtime-only HTTP/TLS instrumentation located the separate fixture failure: signup request bodies completed in157ms, then Nodemailer tried a non-loopback IPv6 address for the synthetic SMTP `localhost:3465` connection and never completed TLS before the assertion. Direct DNS probes showed OS `lookup(localhost)` returned loopback while c-ares `resolve4`/`resolve6` also returned non-loopback addresses. Installed Nodemailer documentation confirms it uses those resolution methods before OS lookup. This was pending local fixture mail delivery, not missing registration hydration. Failed auth runs and their diagnostic logs are retained.

Root approved an explicit IPv4 loopback boundary for the existing real TLS mail fixture: bind its listener to127.0.0.1 and pass SMTP_HOST127.0.0.1 to the test server. The existing certificate already has that IP SAN. TLS certificate validation, SMTP authentication, actual message capture and all existing auth assertions remain intact. No SMTP bypass, fake success, production auth/SMTP change or shipped diagnostic preload was added. With only that harness change, the unchanged complete4auth+16core production Node24 suite passed20/20 on the fresh build, with no intervening dev server or diagnostic preload.

Only after20/20 proof, the approved CI change sets `RUN_PRODUCTION_E2E=1` on both existing auth and collection/item steps and updates their names and obsolete dev-rewrite comment. All browser suites now exercise the same built runtime. Cost: this CI gate no longer measures development compilation timing, and the synthetic SMTP harness deliberately uses IPv4 loopback. All test specs, assertions and timeouts are unchanged in this round; ItemForm and authentication application code are untouched. M1/M2 remain deferred.

| C1 check | Result | Log |
| --- | --- | --- |
| Existing creation, cached dev Node26, route/trace diagnostics | 1/1 passed | task-7-ci-dev-creation-diagnostic.log |
| Existing creation, cold dev Node24.19.0, route/trace diagnostics | 1/1 passed | task-7-ci-cold-dev-node24.log |
| Sanitized route-only trace timing extraction | Retained, no headers/cookies/bodies | task-7-ci-dev-trace-timings.log |
| Initial production Node24 combined auth/core | 18 passed,2 auth registration failures | task-7-ci-node24-production-auth-core.log |
| Focused production auth trace before fresh rebuild | Genuine pending registration failure | task-7-ci-production-auth-diagnostic.log |
| Fresh normal Node24 production build | Passed | task-7-ci-fresh-node24-build.log |
| Unchanged auth/core after fresh build, before loopback fix | 18 passed,2 auth registration failures | task-7-ci-fresh-node24-production-auth-core.log |
| Runtime HTTP/TLS boundary diagnostic before loopback fix | Request consumed; non-loopback mail connection pending | task-7-ci-production-auth-boundaries.log |
| Node24 localhost resolution classification | Confirms DNS/OS discrepancy without listing network addresses | task-7-ci-node24-localhost-resolution.log |
| Fresh production Node24 after loopback fixture correction | 20/20 passed | task-7-ci-loopback-node24-production-auth-core.log |
| Final Node24 workspace production build | Passed | task-7-ci-final-node24-build.log |
| Final Node24 workspace types | Passed | task-7-ci-final-node24-types.log |
| Final Node24 workspace lint and focused workflow/harness formatting | Passed | task-7-ci-final-node24-lint.log |

Diagnostics use `DEBUG=pw:webserver` to retain otherwise-suppressed development route/compile timings, plus Playwright `--trace on`/`--trace retain-on-failure`; the temporary observation-only preload source is retained as `logs/task-7-ci-auth-boundary-preload.cjs` and is not referenced by the final harness/CI. Raw local traces remain at `/tmp/sammlerraum-task7-ci-warm-dev-results`, `/tmp/sammlerraum-task7-ci-cold-node24-results`, `/tmp/sammlerraum-task7-ci-production-auth-trace-results`, `/tmp/sammlerraum-task7-ci-fresh-production-auth-failed-results` and `/tmp/sammlerraum-task7-ci-auth-boundary-results`. Raw traces are not committed because they contain synthetic session material; the route-only timing extraction and textual run logs are committed. The observed non-loopback network address alone is redacted from the committed TLS boundary log; the exact original remains at `/tmp/sammlerraum-task7-ci-production-auth-boundaries.raw.log`. The previous generated dev cache was preserved at `/tmp/sammlerraum-task7-ci-preserved-dev-cache`; regenerated instruction files and the dev-only next-env reference were preserved under `/tmp/sammlerraum-task7-ci-generated-instructions`, and the tracked next-env file returned to its normal production form.

Commands source the established synthetic environment and use `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm`. Cold diagnostics select only the existing desktop creation case; complete production proof runs unchanged `e2e/auth.spec.ts e2e/collections-items.spec.ts --workers=1` with `RUN_AUTH_E2E=1 RUN_PRODUCTION_E2E=1`. Logs retain inherited color warnings and deliberate social-request cancellation errors and are not described as warning-free. No unchanged broad DB suite was repeated. Root owns scoped rereview, new exact-source CI and completion decisions; no push or checkoff is claimed.
