# Phase06 Task5 fix round1/5

Status: I1 fixed and locally verified; ready for root scoped re-review and new exact-source CI. BASE `204dfe46717ecf61e2f465eb3d8bb8bd1e550b00`. Root accepted the final review's0Critical/1Important finding and explicitly deferred nonblocking M1 to Phase13. No API/schema/DB service, auth configuration, provider policy, legacy-money interpretation or global color configuration changed. No children, push, merge, deploy or reset.

## Verified cause and smallest repair

A source-history404 cleared the expanded result but retained a same-scope summary. The page consequently fell back to its cached directory/five-row seeds and kept the all-eligible-groups currency-conflict claim, even while the owner-summary check was pending or had failed. A new production browser RED reproduced20 observation nodes remaining visible instead of0 during the held recheck.

`ValuationState.externalInvalidated` now explicitly marks that cached external snapshot unusable. A current source404 or stale-selector rejection sets it in the same patch that clears expanded source state. Source calls using old selectors are blocked. Only a validated, current-generation successful summary clears it; starting, failing, aborting or superseding a read cannot restore eligibility.

The page combines that flag with its existing scope check, suppressing all cached groups/seed rows, source-derived currency claims and obsolete directory controls while invalid. It does not manufacture an empty/disabled availability result. The manual summary and form identity remain mounted, including the private draft. Existing401/owner-summary404 clearing, mutation/ACK/unknown-outcome safeguards, lifecycle authority and generation guards are unchanged.

Owned production files: `apps/web/src/components/valuations/valuation-state.ts` and `valuation-page.tsx`. Owned regressions: `valuation-state.test.ts` and `apps/web/e2e/valuations.spec.ts`. This report and `logs/task-5-fix-*` are the only added evidence. Root review/context/progress/ledger/Phase07 files are excluded.

## Meaningful RED and GREEN

The pure regression uses a populated source seed row, a manual record, a next-directory cursor and `currencyConflict:true` even though the visible group/manual currency is EUR, representing the off-page-derived claim. It holds the second owner-summary read, asserts immediate invalidation and unchanged manual/draft identity, rejects that read as offline, asserts persistent invalidation and blocked obsolete selectors, then confirms a successful third summary restores the actual eligible group and conflict claim. The existing contextual owner404 and race cases remain in the same executed file.

The existing external transport journeys were extended without a new fixture framework. Seed prices still come from actual ingestion/query results. For the rejection, the worker invokes the real route dependency/handler composition with the default empty display policy and its explicit synthetic owner auth stub; it returns the actual404 error envelope for the emitted selector. The following exact owner-summary GET is held behind a promise gate, then aborted to simulate offline failure. Browser assertions prove zero source rows/groups, no off-page currency claim and no obsolete source paging during the hold and after failure, while a real saved manual record and edited amount/note remain visible. A fresh successful query-generated summary restores eligible groups/claim without discarding that draft. External fixture interception still excludes POST/sign-in/public routes. This remains transport rendering evidence, not a production provider-display grant.

All commands used this pinned prefix:

```sh
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm
```

Browser/build/type/lint commands sourced `../sammlerraum-test-env.sh`; the browser fixtures retain the existing nonproduction `_test` PostgreSQL17 guards and run serially. Exact relevant commands/results:

| Log | Command after pinned prefix | Exit and output |
|---|---|---|
| `task-5-fix-state-red.log` | `vitest run apps/web/src/components/valuations/valuation-state.test.ts` |1;1 failed/12 passed. New populated rejection case: `expected undefined to be true`, before the invalidation state existed. |
| `task-5-fix-browser-red.log` | `--filter @sammlerraum/web exec playwright test e2e/valuations.spec.ts --project=desktop --grep 'external UI transport.*\(en\)' --workers=1` with `RUN_AUTH_E2E=1 RUN_PRODUCTION_E2E=1` |Playwright subprocess1; new assertion expected0 observation nodes and received20 while the actual404 owner recheck was held. The capture shell subsequently printed the prior unit RED tail, so that outer cell returned0; this is a failed browser proof, not a green run. |
| `task-5-fix-format.log` | `--filter @sammlerraum/web exec prettier --write src/components/valuations/valuation-state.ts src/components/valuations/valuation-page.tsx src/components/valuations/valuation-state.test.ts e2e/valuations.spec.ts` |0. Only owned paths formatted. |
| `task-5-fix-state-green.log` | `vitest run apps/web/src/components/valuations/valuation-state.test.ts apps/web/src/components/valuations/valuation-client.test.ts` |0;16/16 passed across2 files:13 state cases and3 client cases. |
| `task-5-fix-typecheck.log` | `typecheck` |0; all recursive workspace typechecks complete. |
| `task-5-fix-lint.log` | `lint` |0; all workspace formatting checks pass. |
| `task-5-fix-build.log` | `build` with `NODE_ENV=production` |0; full workspace production build completes, including the values route. |
| `task-5-fix-browser-green.log` | `--filter @sammlerraum/web exec playwright test e2e/valuations.spec.ts --grep 'external UI transport' --workers=1` with `RUN_AUTH_E2E=1 RUN_PRODUCTION_E2E=1` |0;4/4 passed in12.8seconds: DE and EN, desktop and mobile, including the new deferred/failed/restored fallback boundary. |

The full original12-case browser suite, original42 pure cases, workspace550/native54 evidence remain evidence for the original implementation, not newly rerun round1 results. This round ran only the affected external browser cases and related state/client tests plus required lint/types/build. No native54 rerun was needed because no DB/API/query code changed. No failed corrective attempt followed the named REDs; the first correction passed the above checks. M1's NO_COLOR/FORCE_COLOR runner warnings are retained verbatim in the new logs as well; no filtering or historical rewrite occurred.

## Self-review and resource/screenshot notes

Self-review checked every external rendering consumer against the invalidation guard, atomic rejection/selection clearing, clearing only after current successful validation, obsolete source-call blocking, and preservation of owner/manual/draft/mutation guards. Source/report whitespace checks exclude raw logs, whose original whitespace is preserved. No known I1 implementation gap remains; approval still belongs to the scoped reviewer/root.

The two external screenshots at these existing outside-repo paths were refreshed by the successful round1 browser cases and now match this fix's product source after a successful fresh-summary restoration:

- `/Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum-values-preview/de-desktop-external-transport.png`
- `/Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum-values-preview/en-mobile-external-transport.png`

They remain labelled synthetic real-ingestion/query-generated transport rendering, not live prices or production HTTP display activation. The two production/default-off captures remain the original `204dfe4` positive-path images; this fix changes only the rejection boundary, not their normal layout/money presentation.

`task-5-fix-cleanup.log` confirms0 owned synthetic users/categories/observations after these fixtures, no listener on owned browser/SMTP ports3000/3465, and the shared PostgreSQL17 process21136 still listening on5432. Nothing unrelated was stopped. For completeness, the root-requested wrap-up before this fix round identified an interrupted original-run catalog entry/category by exact IDs/key/creation time and synthetic authored title; it removed only entry `49e90a9f-8b4a-46ca-90cb-7543facca9af` and category `40bf0184-81c6-4803-a0c9-2dd6790a7baf` after verifying no item/observation/proposal references. No report-only commit was made then. This round left no such fixture residue.

Legacy L1, empty production provider grants, external transport/auth-IP proof limits and independent exact-source CI/persistence gates remain as stated in the original approved context/report. M1 is explicitly deferred by root to Phase13; it is not silently counted as fixed here.
