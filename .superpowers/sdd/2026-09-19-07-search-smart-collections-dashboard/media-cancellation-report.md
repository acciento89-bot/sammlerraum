# Existing media cancellation gate — local repair report

BASE: `a6e73099647af92a8a487a03930be5f215c0b3a5`. This finite test-only task concerns the existing media cancellation gate. Task3 product source remains `eda7248973550623fe50f10714be0fc4ea199109`. No push, deployment, Task2/Task3 checkoff or whole-project success is claimed. Root owns independent review and subsequent CI.

## Cause and proof

The unchanged German desktop production journey naturally reproduced the exact `route.fulfill: Route is already handled!` at original spec line256 in **26.8 seconds**. The original spec's describe overrides the 60-second configuration default to **180 seconds**, including at exact failed CI head c016. The earlier interpretation that two 60-second test timeouts explained the failure is retracted. This local reproduction did not reach that test timeout.

The test's reload-stage handler intercepted every GET after `didLink`, including the catch cleanup refresh. MediaUpload sets the canceled message before awaiting that refresh, and only later enables the upload input. The test checked canceled/no-success UI and restored DB link count, then default-unrouted while that GET callback could still be fetching/fulfilling. Installed Playwright1.63 removes the interceptor and auto-continues its in-flight routes; the delayed callback's fulfill then attempts to handle the same server route twice. Application cancel does not abort link/list fetches: its upload XHR has already been cleared.

The controlled RED used the same real upload/cancel/compensating-DELETE flow and gated the real post-delete GET after fetching a listing containing the original two images. Ordered evidence, in milliseconds relative to reload-stage start:

| Event | Controlled RED | Controlled GREEN |
|---|---:|---:|
| Actual onChange GET fulfilled | 69 | 56 |
| Compensating DELETE response | 90 | 76 |
| Cleanup GET fetched original-two listing | 96 | 82 |
| Canceled UI observed | 107 | 94 |
| Original link count restored | 124 | 107 |
| Cleanup held, upload still disabled | 128 | 111 |
| Unroute completed | 132 | 119 |
| Cleanup GET fulfill attempted | 133 | 112 |
| Cleanup handler settled | 136, exact already-handled error | 114, successful fulfill |
| Upload input enabled | Not awaited by old lifecycle | 118 |

The GREEN differed by releasing cleanup, waiting for upload completion and draining callbacks **before** unroute. Its full focused journey passed. This proves the demonstrated callback-removal race without relying on an invented timeout or expected client abort. Historical CI lacks ordered route diagnostics, so its exact late request identity cannot be recovered; the matching natural local error and controlled mechanism are retained separately.

## Source change

Only `apps/web/e2e/media-documents.spec.ts` changes. No production component, database schema, CI setting, retry or global timeout changes.

- Each cancellation stage reloads and verifies a real two-READY-image baseline. No pending-media interval exists while the exact target link response and first onChange listing are held.
- Match the real asset upload response and its exact item-link POST. The first post-link GET must contain that real link; reserve one stage request before awaiting network work. Later polling/cleanup requests cannot satisfy its stage latch.
- Keep the demonstrated late cleanup schedule in the reload regression: after the real target compensating DELETE, hold one real listing without the removed link, assert canceled/no-success UI, restored count, exact created asset filename/orphaned marker, and that upload remains busy while the catch refresh is held. Holding an unrelated polling request would let the operation finish and fail this busy assertion.
- Bound deliberate stage arrival/release and route fetches locally to ten seconds. Always release both suspensions in finally and use `unrouteAll({behavior:"wait"})` to drain this scope's owned callbacks before removing interception. Then await enabled input, covering the product catch refresh. Preserve original failures; if cleanup also fails, report both through AggregateError.
- Retain real uploads/worker processing, spoofed/oversized/network errors, Unicode filename, sorting/reload, private receipt, ownership and origin assertions. No mocked product responses, blanket fulfill catch, ignored route errors or skipped tests.

The final spec SHA256 is `723196995b8aa967fa5c4549b206786ab29a4e93b8a8c5bce9e813a3eb1c65fa`; `logs/media-cancellation-frozen-source.json` records it. Source commit: `e73d4e91a59637bbd2f4645dd21b778a5a7c1ca5` (`test: drain media cancellation routes before removal`), containing only the owned spec.

## Validation and retained evidence

Every browser command sources the existing `../sammlerraum-test-env.sh`, uses Node24.19.0/pnpm10.17.1 and `RUN_MEDIA_E2E=1 RUN_AUTH_E2E=1 RUN_PRODUCTION_E2E=1`. `logs/media-cancellation-runtime.log` confirms the guarded `/sammlerraum_test` target. Exact commands and exit codes are retained in `logs/media-cancellation-commands.json`.

| Gate | Actual result | Own evidence |
|---|---|---|
| Unchanged original German desktop | Exact original line256 error; exit1; 26.8s test | unchanged-desktop-de.log, unchanged-context-0.md, original-spec.ts.txt |
| Controlled lifecycle RED | Exact already-handled error from gated cleanup GET3; exit1; 24.7s test | controlled-red.log, controlled-probe.patch |
| Controlled lifecycle GREEN | 1 passed, 41.6s total | controlled-green.log/.patch |
| Final focused German desktop | 1 passed, 45.1s total | final-focused.log |
| Failure-path probe | Intended `INTENTIONAL_MEDIA_STAGE_FAILURE` only; exit1; 36.4s test; held actual GET fulfilled/drained and input enabled | failure-path.log, failure-path-probe.patch, failure-path-context-0.md |
| Web typecheck | Passed, exit0 | typecheck.log |
| Web lint | Passed, exit0 | lint.log |
| Actual seven-case protected production journey | **7 passed**, exit0, 2.9m total; desktop/mobile DE/EN | protected-production.log |

All evidence filenames in the table have prefix `logs/media-cancellation-`. The temporary controlled/failure probe edits are retained as patches and restored out of final source. Raw runner logs/context retain their original trailing whitespace; an evidence-wide diff whitespace check reports those raw-output lines (exit2, retained in `media-cancellation-evidence-whitespace.log`). Source and report whitespace checks pass; raw evidence was not rewritten to conceal the output. The failure-path probe injects an intentional error after actual reload capture; its finally releases/fulfills the held request, drains callbacks and observes enabled input, preserving the intentional failure instead of a teardown route error.

## Build/server ownership and limits

Before reuse, every Task3 frozen source hash matched; product diff from reviewed eda was empty, and the fresh Task3 build outputs existed. `logs/media-cancellation-baseline.json` records product/source and production-build hashes. Test ports3000/3001/3465 were free before the first and final suite. Playwright started this checkout's standalone Next server and built worker through the existing browser-test-server wrapper; exact PID/parent/CWD evidence is in `logs/media-cancellation-ownership.jsonl`. No unknown process was attached or stopped. After the full journey, ports3000/3001/3465 have no listeners; product components, BUILD_ID, standalone server and built worker hashes still match the baseline; final spec still matches its frozen manifest. `logs/media-cancellation-final-check.json` and the final ownership record retain those checks. Product source diff remains empty.

No broad regular/native suite was run for this test-only repair, per the task brief. Root separately reported the dependency CI's native URL-boundary failure; this media task does not change or resolve it. Independent review and subsequent exact CI remain root-owned. There is no production cancellation defect established by this investigation.
