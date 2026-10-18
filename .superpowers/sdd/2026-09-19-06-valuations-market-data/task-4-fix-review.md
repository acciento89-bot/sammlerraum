### Finding Verdicts

- **I1 — Actual acquisition outages escape the required 503 mapping — ADDRESSED.** `packages/domain/src/valuations/valuation-query.ts:103` recognizes the captured P1001 and supported Prisma connection/timeout codes; `:121` recognizes the installed adapter's DatabaseNotReachable, ConnectionClosed and SocketTimeout causes through the existing bounded cause traversal. The fix leaves serialization-only retry selection intact. `apps/web/src/lib/valuation-routes.integration.test.ts:352` covers both GET and POST for captured/supported connection error shapes, asserting sanitized VALUATION_UNAVAILABLE503, no-store and exactly one transaction attempt. `:394` verifies an unknown SQL42703 fault remains sanitized500 with one attempt. This closes the specific actual-error-shape defect without indiscriminately relabeling unknown errors.
- **I2 — Acquisition time is not deducted from server-side remaining-work limits — ADDRESSED.** `packages/domain/src/valuations/valuation-query.ts:208` derives the callback deadline from actual remaining overall time; `:217`–`:219` install post-acquisition transaction/statement/lock limits and check setup completion. `:222`–`:226` refresh statement/lock limits before each data query and check after both setup and awaited data SQL. The transaction deadline bounds the added setup round trips. Both source history (`:446`, `:462`) and summary (`:569`, `:570`) now check after DTO validation/serialization before returning. The existing awaited transaction boundary preserves settlement before the outer promise resolves/rejects; no detached SQL or Promise.race was added. This addresses the processing/DB budget, without asserting a universal HTTP deadline.

### Covering Evidence Checked

- `packages/domain/src/valuations/valuation-query.test.ts:698` simulates two serialization attempts consuming10s plus1.8s acquisition, asserts200ms initial limits and100ms later limits against real PostgreSQL query execution.
- `packages/domain/src/valuations/valuation-query.test.ts:736` runs real pg_sleep(0.5) with only150ms installed remaining budget, requires VALUATION_UNAVAILABLE after the transaction promise settles, and verifies subsequent database usability.
- `packages/domain/src/valuations/valuation-query.test.ts:778` advances the controlled clock after awaited SQL for summary and source history, including a genuine empty native source-history page constructed from the recordedAt cursor key; both reject without issuing another query.
- `logs/task-4-fix-red.log:123` records the three original regression failures; `logs/task-4-fix-green.log:8` records the first focused green result. `logs/task-4-fix-native.log:16` records37 passing native tests. The strengthened final empty-page fixture's initial field error is retained honestly, followed by6 passing focused tests at `logs/task-4-fix-focused-recovery.log:8` and final typecheck success at `logs/task-4-fix-types-final-recovery.log:3` and `:5`. Lint, final formatting and production build evidence are present in `logs/task-4-fix-lint.log:4`, `:8`, `logs/task-4-fix-format-final.log:2`, and `logs/task-4-fix-build.log:11` onward.
- Reviewed only the fix report and supplied fix diff for `fe15a8bcb40e926fffd69e991ae09e73f0fb048b` → `25e36584bc1cea04ef12e672c629b040b4fea910` (source commit `e75067846afa112a78493d8d10b36682410f4eb2`, then report-only commit). No suites/probes rerun, unchanged source audit, git commands, children or source/index/branch mutations. Only this review report was written.

### New Breakage in the Fix Diff

- None. **0 Critical, 0 Important, 0 Minor.** The additional bounded timeout-setting round trip per query is the documented enforcement cost; no privacy, DTO, mapping, pagination or snapshot behavior was changed by this fix.

### Out-of-Scope Observations

- None newly raised. Previous deferrals and root exact-source CI remain outside this scoped re-review.

### Verdict

- **Fix round: All findings addressed, no new Critical/Important breakage.** I1 and I2 are closed. **SPEC: compliant for the previously reviewed task plus these corrections. QUALITY: Approved.** Open severity counts: **0 Critical, 0 Important, 0 Minor newly raised**.
