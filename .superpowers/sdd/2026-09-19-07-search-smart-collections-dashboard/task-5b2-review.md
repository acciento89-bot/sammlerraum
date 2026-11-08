# Task5B2 independent SPEC + QUALITY review

## Spec Compliance

- ✅ Spec compliant within Task5B2's bounded backend scope. Reviewed the supplied 114,111-byte, one-source-commit package `review-fbc0b9f..f173934.diff`, BASE `fbc0b9fbee421f13622298f8ccacfc1d952bb28b`, HEAD `f17393415262ad2074f1434957a6aa01236927e0`. Read the brief first, then P7.29–33, preparation requirements and implementation report. The package was read in five bounded, nonoverlapping passes; no Git rederivation or separate changed-file reads were used.
- ✅ The three GET/POST families use fixed key/body shapes, exact POST Origin, fresh session identity and closed existing error mapping (`apps/web/src/lib/search-reference-routes.ts:33`, `apps/web/src/lib/api/read-search-body.ts:6`). The raw decoder extraction preserves the original search conversion while returning parent keys to reference callers (`apps/web/src/lib/item-search-routes.ts:31`).
- ✅ Exact request caps and source-native DTOs are present: default20/max50 lists, normalized unique hydration batches, SUMMARY50/OPTIONS2, required persisted condition flags and bounded options (`packages/contracts/src/search-references.ts:14`, `packages/contracts/src/search-references.ts:30`, `packages/contracts/src/search-references.ts:47`, `packages/contracts/src/search-references.ts:55`). The 100-reference fixture demonstrates that a valid draft exceeds one hydration batch (`packages/contracts/src/search-references.fixture.ts:1`, `packages/contracts/src/search-references.test.ts:11`).
- ✅ Fixed SQL applies live owner checks to collections and custom definitions, preserves input order through VALUES ordinality, and bounds authored options before aggregation. Canonical condition reads retain inactive metadata; category-only tuples and exact option/scheme/category joins support the required closed states (`packages/domain/src/search/search-reference-sql.ts:33`, `packages/domain/src/search/search-reference-sql.ts:39`, `packages/domain/src/search/search-reference-sql.ts:42`, `packages/domain/src/search/search-reference-sql.ts:45`, `packages/domain/src/search/search-reference-sql.ts:48`). No inventory values/counts, schema/index changes or new producers appear in the package.
- ✅ The two category modes dispatch explicitly while omitted-view callers retain the legacy path (`apps/web/src/lib/catalog-link-routes.ts:187`). Their SQL reads complete metadata or exactly one selected definition with a101 sentinel, rather than loading all options (`packages/domain/src/search/search-reference-sql.ts:51`, `packages/domain/src/search/search-reference-sql.ts:54`).
- ✅ The dedicated cursor binds the exact actor/family/parent/limit tuple and rejects noncanonical representations. Its only shared extraction is the seven-line byte decoder, leaving existing search schema/context/re-encoding intact (`packages/domain/src/search/search-reference-cursor.ts:7`, `packages/domain/src/search/search-reference-cursor.ts:23`, `packages/domain/src/search/cursor-json.ts:1`, `packages/domain/src/search/search-cursor.ts:48`).
- ⚠️ Cannot verify from this task diff alone: unchanged search authorization, Smart Collection deduplication, filter parser depth/clause guarantees, dashboard currency/source separation, the full transaction-wrapper implementation, and foundation/cross-task acceptance. The package preserves those foundations and includes relevant regression execution; root owns their broader acceptance. Task5C UI/cache behavior, full Phase07 completion and exact B2 CI are not delivered or claimed by this review.

## Strengths

- Ownership filtering lives in the actual set joins, including both custom metadata and OPTIONS reads; unavailable entries cannot accidentally expose foreign labels through a later options request (`packages/domain/src/search/search-reference-sql.ts:39`, `packages/domain/src/search/search-reference-sql.ts:42`).
- Pretransfer guards substitute invalid markers for oversized TEXT, followed by producer schema validation and final byte/time checks. This separates corrupt metadata from declared capacity exhaustion without partial output (`packages/domain/src/search/search-reference-sql.ts:4`, `packages/domain/src/search/search-reference-service.ts:23`, `packages/domain/src/search/search-reference-service.ts:29`).
- The service, routes and native tests are separate responsibilities. Actual SQL tests exercise ordered unavailable states, retained inactive conditions, 1/50 query counts, 100/101 options, a concurrent rename/options/delete snapshot, and the valid100×100 catalog transfer gap (`packages/domain/src/search/search-reference-service.integration.test.ts:1`, `apps/web/src/lib/search-reference-routes.integration.test.ts:1`). The tests use real producers and native constraints; impossible condition overflow and response-byte exhaustion are explicitly boundary fixtures (`packages/domain/src/search/search-reference-service.test.ts:7`, `packages/domain/src/search/search-reference-service.test.ts:48`).
- Evidence distinguishes235 DB-enabled suite cases from independent SQL cases, and separately identifies14 new domain SQL cases,5 route SQL cases,24 transport-only cases and30 pure cases. Preserved native RED contains actual ordered-state and inactive-condition behavioral failures, not just module-loading failure (`logs/task-5b2-native-red.log:4`, `logs/task-5b2-validation-receipt.json:1`).

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

None found.

### Minor (Nice to Have)

- `packages/domain/src/search/search-reference-sql.ts:31` (also the subsequent query returns through line55): substantial SQL statements are compressed onto single long lines. The authorization joins, bounded subqueries and aggregation ordering are correct in this package, but this formatting makes later changes harder to inspect and produces unnecessarily broad diff lines. Format the existing template literals over SQL clauses when this file next changes; no new abstraction or query behavior change is needed.

## Checks and evidence limits

- No suite, build, database operation or focused test was rerun. Inspected existing final native/regular/type/lint/build evidence:15 files/235 passed/0 skipped; corrected regular900 passed/482 expected guarded skips; typecheck/lint/build complete. No unexpected warning/error was found in the final-gate diagnostic scan (`logs/task-5b2-final-native.log:76`, `logs/task-5b2-final-regular-corrected.log:133`, `logs/task-5b2-final-types.log:25`, `logs/task-5b2-final-lint.log:45`, `logs/task-5b2-final-build.log:142`). Intentional query-plan/capacity diagnostics are required evidence, not unexplained test noise.
- The receipt records native tree `3b104fd8950dbcbab275cc377549783d72e6f3c6`, final tree `3ef3e136f5b6b144ab5f0cc34f83de517a5c70ef`, and the sole post-native pure fixture correction from blob `5e90ff85355015832b93176f406e42ce9f58c722` to `49162df9909c6ed1a6a0ca437b6188aecba1d420`. Production/native sources are unchanged under the supplied root freeze reconciliation; the final package contains the corrected category fixture (`logs/task-5b2-validation-receipt.json:1`, `packages/domain/src/search/search-reference-service.test.ts:48`). Git/tree/hash rederivation was intentionally not performed under the review instructions.
- Named outside-diff risk1: unguarded canonical keys could undermine the bounded-transfer claim if they were unbounded TEXT. One focused schema/migration inspection confirmed category/definition/option/scheme keys are VARCHAR64 and condition labelKey is VARCHAR128, while the unbounded collection/custom display projections use guards (`packages/db/prisma/schema.prisma:546`, `packages/db/prisma/schema.prisma:567`, `packages/db/prisma/schema.prisma:592`, `packages/db/prisma/schema.prisma:755`, `packages/db/prisma/schema.prisma:769`). No issue.
- Named outside-diff risk2: reused producer schemas might default missing persisted flags, drop strict output semantics, or omit selection-option invariants. One focused read of the condition/catalog/custom contracts confirmed required scheme.active, the new option overrides of producer defaults, canonical option-type checks and actual string normalization/length rules (`packages/contracts/src/condition.ts:46`, `packages/contracts/src/catalog.ts:80`, `packages/contracts/src/custom-fields.ts:54`; overrides in `packages/contracts/src/search-references.ts:61`). No issue.
- Only this review file was written. Source, index, HEAD and branch state were not modified; no subagents were dispatched.

## Assessment

**Task quality: Approved.**

The implementation meets the task's bounded transport and metadata requirements with explicit authorization, finite set reads, strict output checks and meaningful native coverage. The SQL formatting suggestion is nonblocking; root acceptance and exact B2 CI remain separate gates.
