# Phase 04 Task 4 — independent spec and quality review

Reviewed base `52c47fd4ff4c75a3b6d29dd73220a653e93607a8` through head `8499da4d9967459ca409520eefba6821ad7be09c`, against the Task 4 brief, integration context, implementation report, and supplied review diff. Inspected changed source/tests and relevant direct dependencies: recursive resource queries, public item query, route wrapper, schema constraints, image READY transition, and production browser server wiring.

## Verdict

- **Spec: PASS for the implementation reviewed; required CI execution remains pending.**
- **Quality: PASS; no actionable Critical or Important findings identified.**
- **Open Critical: 0. Open Important: 0.**

This is code-review approval, not a claim that the real PostgreSQL or production Next gates have passed.

## Findings and evidence

No Critical or Important defect was found within Task 4 scope.

- `packages/domain/src/media/media-read.ts` validates identifiers and exact lowercase variant names, reads server-owned facts, and requires an applicable live item/document/avatar reference even for an owner. It checks subsequent links when an earlier link cannot authorize. Asset ownership must match loaded item ownership. `createResourceQuery.loadItem` resolves the full node chain and rejects missing roots/cycles and soft-deleted items/collections; the resolver additionally excludes archived/disposed items. Existing composite foreign keys enforce collection ownership and same-collection parent/item-node relationships.
- Documents use their own link visibility plus item and ancestor visibility. A public item cannot make a PRIVATE/UNLISTED document public. The policy change checks protected documents before general member grants and allows only the owner; no speculative membership or catalog capability is introduced.
- Public image and image-document reads require READY plus a complete selected WebP variant. Public original images are denied. The existing worker only publishes READY after all three variants are complete. The avatar path uses the current profile reference and retains the original-image owner restriction.
- `apps/web/src/lib/media-read-routes.ts` resolves current authority before storage reads or conditional 304 responses. Public responses require revalidation, owner responses are private/no-store, and denied responses inherit no-store from the actual route wrapper. PDF downloads use a constant safe attachment name, nosniff, and sandbox headers. Storage keys remain internal.
- The new PostgreSQL integration case exercises actual ancestor/link/profile relationships and revocation. The production journey checks actual Next response cache headers and conditional denial after revocation. CI registration runs it against the production server before development journeys can rewrite the build.

## Verification limits and remaining gates

Reviewed the supplied evidence of 38 focused tests passing, one database test skipped locally, and successful typecheck, targeted format/diff checks, and Playwright test listing. Did not redundantly rerun those suites: inspection produced no concrete hypothesis requiring another local execution.

Controller must still obtain passing real-PostgreSQL integration and production-Next media journey results from CI before claiming those runtime gates complete. In-process response tests cannot establish deployed Next cache behavior. This pending evidence is explicitly recorded rather than treated as a source-code defect.

Task 5 cleanup/removal implementation and Task 6 UI remain outside this review and are not claimed complete. No source changes, commit, push, merge, or deployment were performed; only this review report was added.

## Scoped rereview: CI test typing correction

Reviewed `491fc652c5e0865feafa20769b6ed02207072b3f..5bf4d2ce01fdbd02fa6f1e3ca9c417f1f064a297` (source correction `668a027661c7c01b534b83f3f89c524fa30445e6`). **Spec: PASS. Quality: PASS. Open Critical: 0. Open Important: 0.**

The only code change is in `packages/domain/src/media/media-read.test.ts`: removing `vi.fn` preserves the fixture's generic `$queryRaw<T>` return signature. Replacing the mock call assertion with `expect(calls).toHaveLength(0)` preserves the zero-database-access check, because every fixture query appends to that log before any query branch. Both inherited-key requests and null-result assertions remain intact. Production interfaces, implementation, and authorization assertions are unchanged; no type suppression or weakened production typing was added.

Reviewed the correction report's reproduced TypeScript RED, domain/full-workspace TypeScript GREEN, focused 8/8 tests, and formatting evidence. No redundant tests were run for this rereview. Real-PostgreSQL and production-Next CI execution remain pending and are not approved by this test-typing correction alone.
