# Task3A implementation report — dynamic owned saved queries

Base: `f24679c4be785b7db588c11513ad23c4689e5a00`. Read `task-3-brief.md` first, then the binding `task-3-execution-context.md` (P7.14–15) and preparation context. Stable reviewed product dependency: `3d52a5cefdbc66e5cc7dea68f18bbdbb688b809f`; remote equivalent `c016c03b44958854e5a71f30b1d12b40cfdfbc36`. No Task2/Task3 checkoff, ledger/main/push/merge/provider/production/real-data action or subagent.

## Delivered behavior

Saved version1 whole-query envelope `{version:1,text,filter,lifecycle}`, owner/name/revision/timestamps/deletedAt and filterVersion1. Explicit null-filter/empty-text all-owned selection; no result IDs or membership relation. Strict normalized domain contracts and raw-filter-string mutation wire preserve actual Task1 duplicate-member/complexity guards. Name raw plus NFKC/trim bounds, no controls; duplicates allowed. Full replacements reset omitted query fields to documented defaults.

Actor-required create/get/list/update/delete/resolve use the existing bounded RepeatableRead transaction and actual executeItemSearch. Create/replacement validate current references/capabilities at limit1 inside their write transaction. Resolution loads saved row/revision then validates references/count/items within that one snapshot, passing trusted saved ID/revision to the actual search cursor seam. No query/context override input. The only transaction changes rename the implementation runSearchTransaction with runSearchRead compatibility alias and explicitly recognize SmartCollectionError after rollback. No second retry loop or generic transaction framework.

Owner+live+revision CAS updates/deletes; stale own409 versus missing/foreign/deleted404; max revision conflicts before overflow. Soft deletion advances revision and timestamps. Known domain errors and native SQL failures escape the transaction; tests prove rollback after actual INSERT/UPDATE/DELETE and statement timeout. Only recognized40001 retries; no unknown-outcome retry promise.

List uses indexed createdAt DESC/id DESC keysets, operation/owner/limit-bound canonical cursor and checked safe-number total before cursor even on exhausted pages. Summaries omit definitions; detail validates stored AST/envelope but permits current unavailable capabilities/references for safe editing. Malformed stored data never falls back to raw bytes. Resolve maps only stored filter/reference availability to409, retaining caller cursor400, dependency503 and inventory/invariant500. All outputs bounded1MiB.

Three actual Next route modules expose six exports: collection GET/POST, detail GET/PATCH/DELETE and items GET. Thin dependency factory uses actual bounded Prisma pool and fresh session options. Mutation origin exact APP_ORIGIN, bounded32KiB streaming/fatalUTF8 JSON, strict wire keys, raw f parsing, no owner input; only limit/cursor query keys for list/resolve. Existing raw-query reader gains a narrow allowed-key parameter; default direct-search behavior unchanged. All success/error responses no-store/requestId. Native route tests exercise actual three path modules with native service/database dependencies and fresh-session auth adapter.

Additive migration `20261018090000_smart_collections` adds owner CASCADE/index plus native version/revision/basic JSONB envelope/32KiB checks. Used guarded existing `sammlerraum_test` with `prisma migrate deploy` and `prisma generate`, rather than creating/resetting a development/shadow database with migrate dev. Applied once; no old migration edits or DB-role/server changes. Prisma schema validation passes. CI native allowlist includes both new native files. `docs/search/smart-collections.md` records semantics and remaining scope.

## TDD and intermediate evidence

All commands source `../sammlerraum-test-env.sh`, then use `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm ...`; native commands additionally set RUN_DATABASE_INTEGRATION=1. Full logs are retained, including failures.

- `logs/task-3-red.log`: genuine initial PostgreSQL fixture/tag-service dynamic-membership scenario failed the expected assertion `saved query service must exist`, before production implementation. Test creates through service, resolves empty, mutates tags with actual createTagService, resolves added and removed membership.
- `logs/task-3-green.log` and `task-3-green-attempt2.log`: first implementation failed module load because domain directly imported undeclared zod. Exposed the swallowed import error, moved boundary schemas to existing contracts package; no new dependency/lock change.
- `logs/task-3-green-attempt3.log`: original native dynamic-membership test passes.
- `logs/task-3-route-red.log`: two native route scenarios fail because route module is not yet implemented;11 already-written normalized-input tests pass. This is missing-module evidence, not a second claim of a behavioral RED assertion.
- `logs/task-3-route-green.log`: route/native and strict-input scenarios pass after implementation.
- `logs/task-3-focused-native.log`:27 pass. Expanded `task-3-focused-native2.log`:33 pass (18 native domain,4 native route,11 regular input).
- `logs/task-3-types-initial.log`: initial workspace types passed before added path/error projection tests. First frozen attempt then found3 unknown JSON response types in those added tests (`task-3-attempt1-types.log`). Explicit existing detail/error response types fixed test typing only; failed gate, first manifest/check and full results retained under `task-3-attempt1-*`. No production fix for that failure.
- `logs/task-3-format.log`: formatter could not infer a Prisma parser; TS/routes were formatted successfully, Prisma file remained intact. Later format logs show targeted TS formatting; schema validation supplies the actual Prisma check.

P7.14 hold respected: root reported c016 push CI failure and requested a temporary broad/build/commit hold while diagnosing. Focused work continued; already-running initial types completed. Root identified existing `e2e/media-documents.spec.ts:256` cancellation-routing `Route is already handled!` in de desktop/mobile; identical c016 PR workflow succeeded including native search. Root explicitly resumed this task's gates and owns separate browser-harness repair after release. No media browser journey/spec modification here. Root-owned CI logs/progress are excluded from this task's staging.

## Frozen verification

`logs/task-3-frozen-source.json` records SHA256 of the18 owned source/test/doc/config paths before final gates; `task-3-frozen-check.log` records post-gate equality. `task-3-final-gates.json` preserves exact expanded commands, environment overrides, exit codes and durations. Runtime logs confirm Node24.19.0/pnpm10.17.1, synthetic sammlerraum_test, PostgreSQL17.11(Homebrew), deterministic ICU root collation. Native suites execute serially without root DB suite concurrency.

Source commit: `eda7248973550623fe50f10714be0fc4ea199109` (`feat: add dynamic owned saved queries`), with exactly the18 frozen paths. Evidence/report are committed separately after this source commit. `logs/task-3-source-stage-check.log` proves indexed contents match the frozen SHA256 and staged diff checks passed.

| Gate | Final result | Raw log |
| --- | --- | --- |
| Runtime/schema | Node24.19.0/pnpm10.17.1; Prisma valid | task-3-final-runtime.log, task-3-final-schema.log |
| Regular workspace |73 files passed,36 DB-gated skipped;785 tests passed,387 DB-gated skipped | task-3-final-regular.log |
| Workspace types | passed | task-3-final-types.log |
| Workspace lint | passed | task-3-final-lint.log |
| Production workspace build | passed; all three new API paths built | task-3-final-build.log |
| Relevant native |8 files /171 tests passed, zero skips | task-3-final-native.log |
| Frozen equality | all18 unchanged through gates and staging | task-3-frozen-check.log, task-3-source-stage-check.log |

The native171 comprises new saved-service18/native-route4 plus existing149 search/valuation regressions. The regular785 includes11 new always-on input tests. PostgreSQL runtime was independently read with `/opt/homebrew/opt/postgresql@17/bin/psql "$DATABASE_URL" -X -t -A -c "SELECT json_build_object(...)"`; full returned database/version/collation fields are in task-3-postgres-runtime.log. Final build contains no warning/error lines. Native valuation test output includes the existing maximum-response diagnostic1419287bytes; that belongs to its unchanged valuation API, not the saved-query1MiB contract. No browser/remoteCI result is inferred from these local gates.

The preserved attempt1 gates JSON retains its original raw log path strings; filenames were archived from task-3-final-* to task-3-attempt1-* before the final run. task-3-attempt1-log-renames.json maps those archival names. No failing log was overwritten.

## Proof coverage and limits

Native saved-service18 tests: actual tag edit membership; exact complete persisted query/no membership relation; actor hiding/count and all six actor-required methods; list order/count/pagination/empty/exhausted/safe overflow; cursor owner/operation/limit/direct-search/saved-ID/revision bindings and override rejection; concurrent replacement and delete/update CAS; revision overflow; reference/unsupported leaves under NOT/OR with no candidates; malformed stored data and retained safe editing/repair; live parent and lifecycle; one saved-row/query/count/page snapshot followed by later live edit; recognized-domain rollback after all three writes; actual native SQL failure after insert; recognized native serialization rollback/retry; actual timeout rollback and dependency mapping; native schema checks.

Native route4 tests plus regular input11 cover create/list/detail/fullreplace/resolve/delete; fresh sessions; origin/auth; fatal UTF8/body oversize/raw duplicate f/strict keys/limits/query malformed UTF8/duplicates/size; closed unavailable/reference and500/503/409 responses; actual path export wiring. Existing149 relevant native search/valuation regressions verify unchanged compiler/typed-fact/retained URL/valuation behavior under the reused seam. Safe-number impossible count uses a real-query wrapper to inject bigint overflow (native count cannot practically reach it); path tests inject the authenticated dependency factory while all service/DB work remains native; error projection tests deliberately inject closed service errors. None is presented as live OAuth or remote CI proof.

Evidence staging note: `git diff --cached --check` flags trailing spaces/blank EOF lines only in preserved raw command logs (including native/regular output and Next static-page progress). Those raw bytes are intentionally retained; the18 source paths passed their staged whitespace check before source commit. The evidence commit contains only this report and34 own task-3 logs/manifests, with root progress/CI evidence excluded.

Full original Task2/Task3 and count41/91 remain open. Future legacy-money/market/shared/duplicate relation producer integration and UI(Task5) remain separate gates. Independent root review, exact Task3 remote CI and existing media harness failure resolution remain outstanding; no skip-as-native-proof, deployment, original task completion or remote persistence claimed by this report.
