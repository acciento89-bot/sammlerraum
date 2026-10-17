### Spec Compliance

- ✅ Spec compliant for Task 6 at `639257e7c744dfd2e0b41acc8d66428b8e1e1a5e`, against base `6b87b34ec5b545eb887b64079ff62e559427ffed` and the binding approved design. Every brief-listed file has its required implementation/test/route hunk.
- ✅ Optional persisted links, category inference/mismatch handling, explicit unlink preservation and retained inactive references are implemented in `packages/domain/src/items/item-service.ts:724`, `:742`, `:789`; category changes require unlink at `packages/domain/src/condition/condition-service.ts:185`.
- ✅ Native subset SET NULL, both partial-null guards, tuple indexes and value-leading identifier index match the design in `packages/db/prisma/migrations/20261017225206_item_catalog_links/migration.sql:1`. Native metadata assertions independently protect the Prisma-unrepresented deletion columns at `packages/domain/src/catalog/item-catalog-link.test.ts:305`; the reported empty Prisma diff is correctly limited to represented drift.
- ✅ Parent-first locking and bounded split retry/revalidation are implemented at `packages/domain/src/catalog/item-catalog-locks.ts:5` and `packages/domain/src/items/item-service.ts:567`; the existing grading guard remains at `:590` and no grading clone was added.
- ✅ Authenticated fresh-session/no-store read APIs, strict Origin/streamed mutation boundaries and bounded search contracts are wired at `apps/web/src/lib/catalog-link-routes.ts:95`, `:108`, `:117` and `packages/contracts/src/catalog-reads.ts:64`. Current snapshot reads join the exact entry revision in one statement at `packages/domain/src/catalog/catalog-read-service.ts:92`; compact search projections and literal matching are at `:108`.
- ⚠️ Unchanged generic create/update input whitelists and the anonymous public-item projection were not independently re-reviewed beyond the supplied diff; they receive no changes here. Whole-phase cross-task verification and exact-source remote CI remain controller-owned, as scoped in `task-6-report.md:81`.

### Strengths

- `packages/domain/src/catalog/item-catalog-link.test.ts:83` tests persisted unlink preservation with condition, grading and purchase facts. The genuine behavioral RED and subsequent GREEN are visible in `logs/task-6-original-unlink-red.log:18` and `logs/task-6-original-unlink-green.log:4`; the fixture setup failure is honestly distinguished.
- `packages/domain/src/catalog/item-catalog-link.test.ts:332` verifies exhausted retries do not decrement or duplicate items; `:417` observes real PostgreSQL contention against the actual canonical writer. Retained inactive references, native deletion behavior, category races and actual DTO/read/split paths also receive database-backed coverage.
- `packages/domain/src/catalog/catalog-read-service.ts:52` keeps canonical reads independent of personal/account/proposal data. Its snapshot join and SQL preview projection avoid mixed revisions and full snapshot transfer for each search result.

### Issues

#### Critical (Must Fix)

- None.

#### Important (Should Fix)

- None.

#### Minor (Nice to Have)

- None attributable to this task. `logs/task-6-build-final.log:36` contains esbuild's informational 6.9 MB worker-size marker; no worker/dependency change or failed build is present in this task. Final test output itself is clean.

### Assessment

**Task quality: Approved.**

- Checks: reviewed the supplied complete patch in sequential chunks; re-read only output omitted by tool truncation, then derived source line references from that package. No changed source file was separately re-read, no suite was rerun, and no database/repository state was changed. Only this requested review report was written.
- Named outside-diff risk check — summary producer compatibility: inspected `packages/contracts/src/catalog.ts:97`–`:255`; title/translation/variant/identifier maxima and snapshot fields agree with the new summary contracts.
- Named outside-diff risk check — canonical writer lock inversion: inspected `packages/domain/src/catalog/catalog-service.ts:170`–`:269`; the mutation seam locks the entry before persistence updates variants, matching the new entry SHARE → variant SHARE → item UPDATE order.
- Supplied verification: `logs/task-6-full-suite-final.log:80`–`:81` records 70 files/515 passing tests. The package includes successful lint, production build, post-build types, schema validation, 21-migration status, empty represented drift and exact native metadata evidence. No concrete unanswered hypothesis warranted a focused reproduction.
- Reasoning: the implementation enforces personal/canonical separation through both service checks and native constraints, and tests the principal lifecycle and concurrency risks at real database seams. Accepted search/detail/Prisma operational limits are explicit rather than presented as guarantees the implementation cannot provide.
