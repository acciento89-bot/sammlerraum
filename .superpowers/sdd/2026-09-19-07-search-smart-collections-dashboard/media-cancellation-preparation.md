# Media cancellation — causal preparation, no source GO

Prepared 2026-10-18 during independent Task3 review. This file is the only owned write. No source, database, generated/build files, browser/server, index, commit or remote state was changed. No runtime reproduction has been executed. Root must supply fresh BASE and explicit source/DB/browser GO before the proposed experiment or implementation. At the final read the repository HEAD was `be1a496bb02e384f4b0793ccfc18f4617a7e8352`; reviewed Task3 product source is `eda7248973550623fe50f10714be0fc4ea199109`. These observations do not grant release or check off any task.

Read the cancellation brief, existing investigation and systematic-debugging skill first. The conclusions below are static evidence and a falsifiable hypothesis, not a claim that the historical failure has already been reproduced.

## Retained failure and correction to the timeout interpretation

The exact failed run `39109459988`, job `117622246524`, and successful run `39109459049`, job `117622243930`, both report head `c016c03b44958854e5a71f30b1d12b40cfdfbc36` in the retained `task-2-final-ci-*-steps.json` files. The successful protected-media step ran 08:00:13–08:03:08 UTC and has conclusion `success`. Its retained primary tail contains container cleanup, not browser stage diagnostics. It does not establish any request ordering.

The failed connector-full log lines 1452–1496 records seven tests, two failures in German desktop/mobile, five passing, 2.5 minutes total. Both errors are `route.fulfill: Route is already handled!` at spec line 256, the GET branch for `cancelStage === "reload"`. The log has no per-route ordering or primary test-timeout record that establishes why it occurred.

**Retract the earlier root interpretation that these were two 60-second test timeouts.** `apps/web/playwright.config.ts` has a 60-second default, but `apps/web/e2e/media-documents.spec.ts:102` overrides the describe with `test.setTimeout(180_000)`. The exact c016 source has that same override. The spec SHA256 at c016 and at preparation time is identical: `99c685f14f86af6f71ea7edb8dc488944d88842d7a5b3a338a0022c538beba7e`. A timeout/teardown could still create secondary errors, but the retained evidence does not prove a timeout, and aggregate elapsed time is not a substitute for its actual configured limit.

## Exact application and test lifecycle

`apps/web/src/components/media/media-upload.tsx`:

- Lines 112–124 clear `operation.xhr` before the item-link POST and explicitly do not abort that fetch. Cancel at lines 56–59 sets the canceled flag and aborts only a present upload XHR. It does not abort the link or listing fetch. No client-abort cause is established here.
- Link cancellation observes the real response/link ID, issues a real compensating DELETE (127–129), then enters catch. Reload cancellation waits for `onChange()` first (131–136), then issues the compensating DELETE and enters catch.
- Catch sets the canceled status message at 142–146 **before** awaiting its second `onChange()` at 147. Only after this cleanup refresh settles does finally clear busy at 149–150. Therefore canceled UI plus restored link count do not prove the upload operation or cleanup refresh has finished; enabled upload input is the existing UI completion signal.

`apps/web/src/components/media/item-gallery-editor.tsx:19–31,39–48` supplies that `onChange()` via an actual no-store media GET. When rendered listings contain a PENDING/PROCESSING/UPLOADING asset it independently invokes the same reload every two seconds. It does not serialize reload requests or abort them on cancellation. The active ref only prevents state writes after unmount.

`apps/web/e2e/media-documents.spec.ts:231–274`:

- One route matches all methods for the item media URL. `didLink` becomes true after `route.fetch()` of any matched POST finishes (245–246), before the browser has consumed the link response.
- The link branch suspends its POST response. The reload branch suspends **every** GET whose handler sees `didLink`, including possible pending polls and the later cancellation cleanup GET. The `atStage` and release promises are shared by those GETs, not one request identity. `atStage` has no local bound.
- After clicking actual cancel the test resolves the release promise, checks canceled/no-uploaded UI and link count, then immediately calls `page.unroute()` (263–268). It never waits for upload input to become enabled at the end of that stage, nor for owned callbacks to finish. A cleanup GET beginning after release still executes `route.fetch()` and line 256, since awaiting an already resolved release promise does not exclude it.
- The next iteration waits for enabled input at its beginning (259), which is too late to protect the previous iteration's unroute. Normal `unroute()` does not await callbacks. A callback left from the old registration can also survive into the next registration.
- There is no per-stage finally to release/drain on an assertion failure; the outer finally closes the foreign context and cleans DB fixtures (465–469), not the page-route latch.

## Installed Playwright lifecycle, actual resolved paths

The installed `@playwright/test` entry resolves through these physical package directories, rather than an assumed `lib/client/network.js` layout:

1. `apps/web/node_modules/@playwright/test` → `node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test`.
2. That package's `playwright` symlink → `node_modules/.pnpm/playwright@1.63.0/node_modules/playwright`.
3. Its `playwright-core` symlink → `node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core`.

All following core line references are to that resolved package's `lib/coreBundle.js`, SHA256 `549070af3acabb3efcc4f55bfe6210f9f7c2fcf633cf7eaa59bfe60719969171`:

- Client route `fetch()` only performs API fetch, without consuming the intercepted route (59740–59743). `fulfill()` and `continue()` each run `_handleRoute()` (59745–59758,59811–59818). `_checkNotHandled()` rejects when its handling promise is absent (59820–59827).
- `RouteHandler` tracks individual active callback invocations and can await them with `stop("wait")` (60149–60187). `page.unroute(url, handler)` calls `_unrouteInternal(...,"default")`, which does **not** invoke that wait (61756–61773). `unrouteAll({behavior:"wait"})` does wait before updating server interception patterns; it must only be used when all routes are owned and there is no suspended callback waiting for test release.
- Once the final page interception pattern is removed, `PageDispatcher.setNetworkInterceptionPatterns()` removes its actual server request interceptor (53661–53670). `Page.removeRequestInterceptor()` removes the handler and notifies routes in flight (22733–22739). Context notification calls each route's `removeHandler()` (52083–52090).
- Server route `removeHandler()` calls `continue({isFallback:true})` when that interceptor currently owns the route (13682–13687). If no next interceptor exists, continue calls `_startHandling()` (13750–13775) and marks the server route handled.
- A later `route.fulfill()` reaches server route `_startHandling()` at 13706, which asserts `!this._handled` at 13774 with exactly `Route is already handled!`. The dispatcher also has a separate already-handled guard (54993–55010). The historical single user stack does not distinguish these guards, but the in-flight auto-continue path can produce that exact text without a client abort or test timeout.

## Single leading hypothesis and what is still unknown

**Hypothesis:** after the genuine reload-stage cancel and successful compensating DELETE, the catch exposes canceled UI while its actual cleanup GET remains inside this test's route callback. The test passes the message/link-count assertions and removes the last page interceptor. Playwright automatically continues that in-flight route. Its delayed `route.fetch()`/callback resumes and line 256 tries to fulfill the already continued server route. Pending polling may provide another late GET with the same outcome, but is not needed for this hypothesis.

This accounts for the failing GET line, timing dependence, and identical-head success, and it has a concrete source-level mechanism. It is not yet proven to be the ordering of the historical CI run. We have not observed that run's selected route identity, upload-enabled state, fetch completion time, unroute ordering, any abort or original assertion/timeout. No product cancellation defect is established.

## Minimal controlled proof after fresh BASE/source GO

Do not start by increasing timeouts, blanket-catching fulfill errors, ignoring route errors, changing production cancel, or rerunning the entire original scenario until it happens to pass.

1. Retain the original failing CI evidence. On the positively owned synthetic test environment, first run the unchanged exact German desktop case against the owned production server/worker with bounded diagnostics around this cancellation block. If it passes, record that the historical flake was not reproduced; success alone does not confirm the hypothesis.
2. Log only sequence number, relative monotonic time, cancellation stage, locally assigned request/route ID, method, endpoint class, POST fetch/fulfill start/end, GET fetch start/end, selected suspension, release, cancel click, canceled assertion, compensation response, upload-enabled transition, handler settled, and unroute start/end. Record request failure/finished and page-close events without cookies, payloads, full IDs, file bytes or user data. Preserve the actual first error, rather than allowing drain/teardown errors to replace it.
3. Prove the candidate in a controlled version of the **same real upload/cancel flow**: observe the real target asset upload and exact link POST; hold the genuine first `onChange` GET to perform reload cancellation; release it after the actual cancel click. Observe the real compensating DELETE and identify the following catch cleanup GET by ordering plus a real listing with the target link absent. Gate that late GET after its real `route.fetch()` response but before fulfill. Let the existing canceled/no-success/link-count checks complete. While this identified callback is deliberately outstanding, perform the original unroute, await its completion, then release that one callback. This barrier forces `callback entered → canceled UI + restored count → unroute complete → fulfill attempt` without timing sleeps or a test timeout.
4. For this controlled negative experiment, retain and assert the **specific expected** `Route is already handled!` from that selected callback (or keep the genuine failing execution log). Do not add a catch to the production journey that swallows unexpected errors. Always resolve every barrier and await callback settlement in finally. A bounded wait that expires must report its last observed stage and stop the experiment cleanly.
5. If the expected error is absent, reject/revise the hypothesis using the captured route order; do not call this a reproduced RED. If the proof succeeds, record it as a deterministic reproduction of the demonstrated handler/unroute lifecycle defect, separately from whether the unmodified historical scenario reproduced naturally.

## Smallest proposed correction, contingent on that proof

Keep production components unchanged. Restrict edits to the owned spec and only narrowly necessary test support.

- Make the stage suspension single-use, with an explicit target request identity and closed selection immediately after capture/release. Match the real link POST to the asset from this upload and verify its real successful link response. Stage capture must not match any arbitrary item-media POST.
- Establish a ready baseline from the real initial listing/gallery before cancellation: exactly the original two READY assets, enabled input, and the existing page reload. Complete and drain link-stage cancellation before starting reload-stage cancellation. While the link response is held the browser has not rendered any added pending asset; while the first actual onChange GET is held it still has not rendered that asset. With this ready baseline there is no polling source that can stand in for the first post-link reload. Record that ordered invariant in the stage diagnostic, and fail if an unexpected earlier GET prevents uniquely identifying the genuine reload. Do not simply rename `didLink` or treat any late GET as evidence.
- Suspend only the selected real link response or actual post-link onChange GET. All later polls/cleanup refreshes take the normal real-network path and cannot satisfy the stage latch. Keep actual cancel click, canceled status, zero uploaded success messages, restored original link count and the created asset's orphaned marker in both stages.
- Bound stage arrival locally with a descriptive error. A per-stage try/finally must always close selection, release any suspended callback, and await all owned callbacks before removing the interceptor. Await enabled upload input after cancellation as the existing product completion signal; this specifically includes catch's cleanup refresh. A mere sleep or canceled-message assertion is insufficient.
- Drain before unroute. Use a named owned handler and explicit tracked completions, or `unrouteAll({behavior:"wait"})` only when this scope owns every registration and all latches have already been released. Do not use default unroute with outstanding callbacks, `ignoreErrors`, a blanket fulfill catch, skips, retries or a timeout increase. If unrelated routes make an all-route wait inappropriate, keep completion tracking local to this handler and remove only that handler.
- Add a controlled regression where the late cleanup callback is held at the same barrier and the corrected lifecycle demonstrably waits; release it, observe successful fulfill/settlement, then permit unroute. A separate failure-path probe should inject a known assertion failure after stage arrival and verify finally releases/drains without replacing that primary failure. These are test-harness probes, not replacements for the real production journey.

## Scoped validation and handoff plan, not executed

After root issues fresh BASE and ownership release, freeze relevant source hashes, verify the pre-existing production build corresponds to the exact product source, and positively identify or start only this task's server/worker. `apps/web/e2e/support/browser-test-server.mjs:130–183` starts the existing standalone product and worker when `RUN_PRODUCTION_E2E=1` and `RUN_MEDIA_E2E=1`; it mutates SMTP/static support and therefore was read only here. Do not attach to an unknown server or stop another app.

Use the existing `../sammlerraum-test-env.sh`, Node `24.19.0` and pnpm `10.17.1`, without printing secrets. The eventual focused original/probe command is the existing `e2e/media-documents.spec.ts` German desktop case with one worker; then run the actual protected media command with both `e2e/media-read.spec.ts e2e/media-documents.spec.ts --workers=1` and all three production/auth/media flags, covering desktop/mobile DE/EN. Preserve Unicode upload, actual worker processing and real uploads, invalid/oversize/network errors, sorting/reload, receipt privacy, ownership and origin assertions. Run formatting/type checks appropriate to the spec/support change; no broad native suite, global timeout or CI threshold change is needed for a test-only repair.

Retain exact commands, original/probe failures, final outcomes, request order, source/build hashes and owned server/worker cleanup evidence in the later owned report/logs. If the unchanged historical scenario never fails, say so. A deterministic handler lifecycle regression proves only its demonstrated mechanism until the real journey and later root-owned exact CI also pass. Root independently reviews the complete task diff before any further GO; no push or task checkoff is authorized here.
