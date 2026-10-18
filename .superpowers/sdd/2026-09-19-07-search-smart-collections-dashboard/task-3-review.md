# Task3A independent spec and quality review

## Spec Compliance

- ✅ Task3A behavior and scope are compliant with the binding P7.14–15 milestone. The complete versioned query is persisted, actual current search validates mutations and resolution, ownership is required throughout, and membership remains dynamic. All four original brief paths have corresponding changes; the additional contracts/routes/tests/transaction integration are explicitly authorized by the execution context. One nonblocking native constraint weakness is recorded as M1.
- Reviewed base `f24679c4be785b7db588c11513ad23c4689e5a00` → head `eda7248973550623fe50f10714be0fc4ea199109`, using the supplied review package. The initial output was truncated; only the undisplayed middle was recovered in bounded sections. No diff was regenerated. A final marker extraction supplied exact line references.
- ⚠️ This approves the owned, available-family Task3A milestone only. Full original Tasks2/3, count41/91, later producer integration and UI remain open as documented in `docs/search/smart-collections.md:15`. Dashboard currency/source separation is unchanged and outside this task. Remote CI and the root-owned existing media cancellation failure are not certified by this local review.

## Strengths

- `packages/contracts/src/smart-collections.ts:49` and `:82`: strict versioned definition and wire contracts retain text/lifecycle/null filter and pass raw `f` directly to the actual filter parser. The normalized service boundary cannot accept arbitrary query strings, owner overrides, or extra wire keys. `apps/web/src/lib/smart-collection-routes.test.ts:23` covers duplicate filter members and clause overflow.
- `packages/domain/src/search/smart-collection-service.ts:69` and `:189`: live owner-qualified row loading, current query execution and trusted saved ID/revision cursor context share the bounded transaction. No saved definition grants access or stores result IDs. `packages/domain/src/search/smart-collection-service.test.ts:37` proves tag-service edits change membership; `:341` proves one saved-row/item snapshot followed by a later live read.
- `packages/domain/src/search/smart-collection-service.ts:154` and `:174`: owner/live/revision SQL predicates, positive revision bounds and throwing failure paths protect replacement/deletion. `packages/domain/src/search/smart-collection-service.test.ts:203`, `:386`, `:500` and `:531` exercise concurrent CAS, rollback after each real write, native serialization retry and timeout rollback.
- `packages/domain/src/search/smart-collection-service.ts:59` and `:87`: strict stored parsing rejects malformed data; structural detail reads still permit editing unavailable definitions. Resolution maps only filter/reference availability to saved-definition conflict and preserves caller cursor, infrastructure and inventory error classes.
- `packages/domain/src/search/smart-collection-service.ts:118`: checked pre-cursor totals, stable descending keysets, owner/operation/limit-bound cursor hashes and bounded summary-only responses satisfy the list contract.
- `apps/web/src/lib/smart-collection-routes.ts:74` and `:91`: bounded fatal-UTF8 bodies, fresh sessions, configured-origin checks and the shared closed response wrapper provide the intended request boundary. Actual path exports are exercised with native service/database dependencies in `apps/web/src/lib/smart-collection-routes.integration.test.ts:117`.

## Issues

### Critical

- None.

### Important

- None.

### Minor

- **M1 — nullable SQL predicate weakens the native envelope check.** `packages/db/prisma/migrations/20261018090000_smart_collections/migration.sql:21`: for an otherwise valid definition with `"lifecycle": null`, `definition->>'lifecycle' IN (...)` evaluates to SQL NULL. PostgreSQL CHECK accepts NULL, so this malformed basic envelope can be persisted by an out-of-band writer. The service's strict enum parsing rejects it on detail/resolution, so this is defense-in-depth rather than an executable-query or authorization escape. Add `jsonb_typeof(definition->'lifecycle') = 'string'` or make the complete predicate `IS TRUE`, and add this case to the native constraint test. This conclusion follows directly from SQL NULL semantics; no database mutation was performed to reproduce it.
- **Inherited evidence noise, outside Task3A source scope:** `logs/task-3-final-native.log:20`/`:23` print full search plans and `:49` prints a valuation response-size diagnostic. These are unchanged regression-suite diagnostics rather than new warnings or saved-query failures. Prefer opt-in diagnostic output for a pristine standard gate; no Task3A blocker is inferred from the unrelated valuation byte count.

## Focused outside checks and verification limits

- **Risk: write transactions could commit after a swallowed domain error or retry an unknown outcome.** The changed `search-read.ts` hunk omits the callback middle, so I inspected `packages/domain/src/search/search-read.ts:24`–`:54` specifically: query and callback budget checks throw before callback completion. The unchanged classifier `packages/domain/src/api/read-dependency-errors.ts:1`–`:43` recognizes serialization retries only for 40001. The new SmartCollectionError recognition remains outside the transaction, after rollback. No extra retry framework exists.
- **Risk: the reused query seam could bypass owner filtering, cursor context or distinguish errors incorrectly.** Inspected `packages/domain/src/search/item-search-service.ts:57`–`:123`, `packages/contracts/src/item-search.ts:26`–`:68`, and `packages/domain/src/search/search-cursor.ts:19`–`:63`. Current availability/reference checks precede count/page execution; actor-owned predicates and bounded output remain in the shared executor; the parser applies the actual ItemFilter parser; canonical cursors bind the complete query, owner, limit and saved context. This was a focused interface/composition check, not a new compiler audit.
- **Risk: imported HTTP helpers could omit body bounds or no-store/request IDs.** Inspected `apps/web/src/lib/api/read-bounded-body.ts:4`–`:33` and `apps/web/src/lib/api/route-handler.ts:47`–`:72`: streaming byte counting is independent of Content-Length, and both success and error wrappers supply the required response behavior.
- Existing verification evidence was read, not rerun: `logs/task-3-final-regular.log:121`–`:122` records 785 passing regular tests with explicitly DB-gated skips; `logs/task-3-final-native.log:55`–`:56` records 8 files/171 passing native tests without skips. `logs/task-3-final-types.log:25`, `logs/task-3-final-lint.log:45`, `logs/task-3-final-schema.log:8`, and the build entry in `logs/task-3-final-gates.json` record successful checks. `logs/task-3-frozen-check.log:1` records unchanged frozen source. These are retained implementer-run results, not fresh reviewer execution or remote CI proof.
- No tests, builds, database commands, branch/index operations, network requests or source edits were run. Only this requested review artifact was written. No subagents were dispatched.

## Assessment

**Task quality: Approved, with minor M1 hardening recommended.** Introduced findings: **0 Critical / 0 Important / 1 Minor**; inherited log noise is separately identified above. The implementation maintains the shared ownership/search/transaction boundaries and supplies meaningful native evidence for dynamic membership, concurrency, snapshot consistency and rollback. This task gate does not close the original full feature or the remaining root-owned integration gates.
