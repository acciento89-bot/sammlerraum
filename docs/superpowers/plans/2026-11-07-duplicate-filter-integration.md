# Real duplicate-filter integration implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, task-by-task. Root is the only source/runtime owner; one fresh whole-plan reviewer at the end, then one consolidated root correction. No implementation agents.

**Goal:** Complete the declared duplicate Boolean filter using the existing Phase10 explicit private DuplicateRelation producer in actual search, saved queries, dashboard selection and responsive DE/EN controls.

**Architecture:** Lower the existing strict duplicate leaf to one parameterized EXISTS over actual canonical pairs, both current-owned live items and live owned parents. Reuse the generic owned/lifecycle scope, AST compiler, mixed Boolean semantics and same-MVCC count/page/saved/dashboard paths. No new schema, inference heuristic, permissions or duplicated search implementation.

**Tech Stack:** Existing TypeScript/Zod/Prisma.sql/PostgreSQL17, Next/next-intl, Vitest and compiled Playwright. Node24.19.0/pnpm10.17.1. Existing retained databases only, serial native/build/browser runtime.

**Spec:** Approved V1 design; original Phase07 plan Tasks2–5 and root-design-rulings P7.1/P7.2 plus task-2-query-preparation full-acceptance gates; Phase10 Task1 explicit private pairs and Task8 actual ALL_LIVE_OWNED_PAIRS dashboard count. This root brief settles routine implementation choices under the user's explicit opt-out of questions and authorization to finish; it does not claim new human design approval.

## Global constraints

- Source BASE617aa5cbea0584905563a731ff0c2d1c371f164c; market prerequisite locally verified/review-corrected and pushed, exact CI42393762009 completedSUCCESS. Duplicate work is independent; no dependent push/checkoff until that exact CI succeeds.
- Existing work/search-repair-20261105 checkout and existing DraftPR1 only. No main/merge/deploy, live providers/mail/payments/customer-data actions, devices, stores or automations.
- Membership or granular share access never grants visibility into another owner's private duplicate relations. Shared-scope integration remains a separate prerequisite.
- The request lifecycle restricts candidate items. A marked partner may be ACTIVE/ARCHIVED/DISPOSED while still a live owned record, matching Phase10's existing explicit-pair/dashboard semantics. Deletion, dead parent or ownership loss excludes it; transfer/restore follows the actual producer's permanent retirement, never recreates a pair heuristically.
- True means a current explicit pair exists; false is its two-valued complement after outer authorization. Quantity/title/catalog similarity alone never marks a duplicate. NOT/AND/OR, text and pagination retain existing behavior.
- Keep all18frozen migrations unchanged. Preserve proof workspaces and individually restore original generated proof bytes after retaining fresh variants. Existing12s total/three serialization attempts/5s transaction/2s statement/500ms lock bounds stay intact.

## Review focus

1. The other pair endpoint or its parent is deleted/transferred: no stale duplicate flag/count or foreign private inference.
2. An archived/disposed partner versus candidate lifecycle: explicit relation survives ordinary lifecycle changes; candidate scope remains exact.
3. Negative filter/NOT/OR and exhausted cursors: Boolean/count/page parity without inferred matches from titles or quantity.
4. Saved queries reevaluate a real mark/unmark and current owner changes in the same bounded snapshot; no stored permission or result cache.
5. UI permits both true and false, uses localized labels, and remains keyboard/mobile usable; old market availability and legacy-money gates stay intact.

### Task 1: Native current-owned duplicate predicate

**Files:** Create packages/domain/src/search/duplicate-filter.ts and duplicate-filter.integration.test.ts. Modify search-compiler.ts and filter-ast.ts; adjust existing filter-ast.test.ts and item-search-service.test.ts only where obsolete unsupported-duplicate assertions become actual supported behavior.

- [x] Write and run failing real producer/native tests for true/false and NOT/OR, symmetric endpoints, no similarity/quantity heuristic, foreign/dead-parent exclusion, archived/disposed partner and candidate lifecycle, unmark and actual ownership transfer/retirement.
- [x] Implement one fixed-alias parameterized EXISTS using current owned/live endpoints and parents, reuse existing outer predicates; remove only duplicate's old unsupported gate. Preserve money/market gates and strict parsing.
- [x] Run affected native/pure cohorts and types; record actual results and commit.

### Task 2: Actual saved/dashboard/API and localized Boolean controls

**Files:** Modify apps/web/src/components/search/filter-draft.ts and filter-leaf-editor.tsx, existing draft tests and e2e/search-dashboard.spec.ts; add focused duplicate consumer cases in the new native file. Existing API adapters stay generic unless a real regression requires a narrow fix.

- [x] TDD actual saved mark/unmark resolution and dashboard matched selection/count parity; strict routes remain fresh-auth, no-store and closed errors. Retained own summaries must not expose pair IDs/other private endpoint metadata.
- [x] Enable only duplicate family, add editable localized true/false selection, and make available() reflect its actual producer. Preserve market disabled-by-default controls and canonical-money behavior.
- [x] Run actual DE/EN desktop/mobile compiled journeys selecting true/false and live refresh/saved resolution, plus relevant HTTP/native regression and types/build checks. Commit exact results.

### Task 3: Bounded proof, one review and existing draft integration

**Files:** Add the actual new native file to .github/workflows/ci.yml; update operational/implementation receipts and pending originalPhase07 ledger explanations without adding canonical completed tasks.

- [ ] Capture real bounded1/50/500-item duplicate query counts/plans with existing indexes and current scope; no speculative index or timeout waiver.
- [ ] Run appropriate final local gates on the frozen source, retain exact evidence; perform the one fresh whole-plan review and one consolidated root correction if needed.
- [ ] After market617aa5c exact CI succeeds, push ordinary fast-forward/readback to the existing draft and observe exact candidate CI. No full originalPhase07 acceptance until separately required shared authorization is integrated and reviewed.
