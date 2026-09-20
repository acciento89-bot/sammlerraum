# Phase 03 Task 6 — independent SPEC + QUALITY review

Initial reviewed candidate: `d744045f18eb2a0504dd1c9924a9778095d43b51`.
Reviewed fix candidate: `3dcc973f593509b888cce98bbd160883559671bc`.
Scope base: `a3ccc67f3528fc5ac5696789cb989ea377b7d2fe`.

**SPEC: PASS — F1 and F2 resolved.**
**QUALITY: PASS — no open code findings or fix-induced breakage found.**
Actual PostgreSQL integration and full CI remain the controller's completion gate.

## Initial findings — both resolved in fix round 1

### F1 — P2: DECIMAL owner reads do not preserve the canonical write contract

Location: `packages/domain/src/api/resource-query.ts:378–379`.

The new owner metadata loader uses `String(row.decimalValue)`. Prisma returns a Decimal instance for the numeric column, and its default string conversion uses exponent notation for sufficiently small valid values. For example, a field written as the accepted canonical value `"0.0000001"` is returned by GET item metadata as `"1e-7"`. The existing DECIMAL validator accepts only ordinary decimal notation and rejects this returned value with `CUSTOM_FIELD_VALUE_INVALID`. Thus loading and resubmitting an otherwise unchanged field fails, and the response violates the Phase 03 Task 4 canonical DECIMAL ruling reused by this API.

Focused reproduction used the actual new `createResourceQuery().getItemMetadata`, the installed `Prisma.Decimal`, and the existing `validateFieldValue`: expected `"0.0000001"`, received `"1e-7"`. The original value passes the write validator. No PostgreSQL service or previously reported suite was needed for this reproduction.

Required correction: serialize stored Decimal values to canonical, non-exponential strings without conversion through JavaScript Number. Add a round-trip regression including a small value at/below the exponent threshold and a value near the supported precision limit.

### F2 — P2: new collection/item text writes accept PostgreSQL-invalid NUL input and return 500

Primary new API location: `apps/web/src/lib/collection-item-routes.ts:132–140`; new update contract: `packages/contracts/src/collections.ts:22–25`.
Shared affected validators: `packages/contracts/src/collections.ts:6` and `packages/contracts/src/items.ts:21–22`.

Collection/node names and item title/public-description/private-notes schemas permit embedded U+0000. The new HTTP routes treat such JSON as validated and call the domain writer. PostgreSQL cannot store NUL in text, so e.g. an authenticated same-origin `POST /api/v1/collections` with `{"name":"bad\u0000name"}` reaches the database and returns `500 INTERNAL_ERROR`, rather than the promised safe validation response. The same shared validators feed the new PATCH and item endpoints. Identifier/tag/location/custom-field validation already rejects this character, so their handling does not cover these remaining text inputs.

Focused reproduction passed this request through the actual collection route factory and actual collection domain service, with only the database persistence adapter supplied by installed PGlite. PostgreSQL text binding rejected the NUL with SQLSTATE `22021`; the HTTP assertion expected 400 and received 500. This is an invalid-input/API-contract defect, not an assertion that protected data leaks.

Required correction: reject NUL in the shared collection/node and item free-text contracts before persistence, while retaining legitimate newlines in descriptions/notes. Add focused request validation coverage proving a safe 400 response and no attempted write for these inputs; keep existing error/request-ID/no-store behavior.

## Scope and evidence

- Read the task brief, implementer self-review report, packaged task diff, canonical Phase 03 preflight and final Task 6 interface rulings, and task progress file.
- Inspected the route factories, thin routes, production dependency/session construction, trusted policy facts, recursive resource/public queries, owner metadata serialization, new contracts, deletion policy, additive migration, and affected transactional domain services. Followed the existing custom-field validator and DB ownership/hierarchy constraints where necessary.
- CRUD and auxiliary endpoint scope matches the accepted rulings. Public item responses reuse the established explicit whitelist. External reads enforce PRIVATE/UNLISTED ancestry and deleted collection/item filtering. Owner checks use server sessions and DB-derived facts; location/token data remains owner-only. Collection deletion retains contents, and sequential direct-service calls reject deleted targets. No independent privacy/ownership finding was established.
- The new migration is additive; the candidate does not modify previously published migrations.
- Existing test evidence is accepted as reported, not represented as rerun by this review. Only focused new defect reproductions ran: `corepack pnpm@10.17.1 vitest run --config /tmp/task-6-review-vitest.config.mjs` (2 expected failures: F1/F2). Transient reproduction source is `/tmp/task-6-review-repro.test.ts`; it does not change implementation or tracked tests.
- Actual PostgreSQL integration/full CI remains the controller's gate. The PGlite invalid-text reproduction is explicitly not a replacement for that gate. No commits, refs, canonical ledger, or implementation files were changed by this reviewer.

## Scoped re-review — fix round 1

Reviewed the seven-file fix diff and updated implementation report. The supplied staged tree matched `3ee564856be869957d816cc1f7750a9b69ac503d`; local HEAD subsequently matched the persisted fix commit `3dcc973f593509b888cce98bbd160883559671bc`. Scope was F1/F2 and breakage introduced by their corrections, without reopening unrelated task work.

- **F1 resolved:** `canonicalStoredDecimal` obtains exact ordinary notation through Decimal `toFixed()` and reuses the canonical DECIMAL validator, without conversion to Number. New unit cases cover `0.0000001` and the full numeric(38,18) precision boundary. The existing real-DB route case now also writes, reads, and resubmits both values; execution of that extension remains a CI gate.
- **F2 resolved:** shared collection/node and item text validators reject NUL for create/update/read contracts. Five HTTP regressions assert 400, the safe validation envelope, request ID, no-store, and no writer calls. Item creation additionally stops before collection loading; node creation correctly authorizes the collection before body validation. The positive description/notes case retains legitimate multiline text.
- Independently reran only the two original reviewer reproductions against the fix: **2/2 passed** (previously 2/2 failed). The Decimal assertion now preserves the accepted write value and the actual collection route/domain reproduction returns 400 before the PostgreSQL-invalid write.
- Accepted implementer evidence: combined focused tests 17 passed; expanded required scope 93 passed with 15 DB-gated skips; lint/typecheck/diff checks and final production web build passed. These reported suites were not redundantly rerun by this reviewer.
- No implementation files, tracked tests, commits, refs, or canonical ledger were changed by the reviewer. The implementer also corrected the report wording: the no-resource-loader claim applies to item creation, while node creation authorizes the collection before validating its body.

No open code findings remain. SPEC and QUALITY approve this fixed candidate; final task checkoff still requires the controller's actual PostgreSQL/full-CI result.
