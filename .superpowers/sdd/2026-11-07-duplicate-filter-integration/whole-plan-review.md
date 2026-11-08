# Duplicate filter integration — whole-plan review

Reviewed immutable range `617aa5cbea0584905563a731ff0c2d1c371f164c..301c9dda49418b227db15126985c2daa44bc214a` on 7 November 2026. HEAD readback matched the requested candidate. This is the single fresh whole-plan review, using static source/diff inspection and existing root-owned evidence only. No runtime, tests, build, browser, database or network commands were run; no source was changed and no other reviewer was dispatched.

## Findings

### Important: migrate the remaining unavailable-duplicate draft test before integration

**Evidence:** `apps/web/src/components/search/search-state.test.ts:42` places `{ kind: "duplicate", value: false }` under NOT/OR alongside an available manual-money range. Line 52 still asserts `available(root)` is false. The change in `apps/web/src/components/search/filter-draft.ts:72` removes duplicate's unavailable gate, so this entire tree is now available. The omitted test file was not migrated with the other unavailable-family fixtures.

**Reproduction and impact:** The retained root-owned `task-3-full-regular.log:280` reports this exact test failing at line 52, expected false/received true. The completed run has 1 failed / 1653 passed tests, with 143 passed files and 101 skipped. Thus the reviewed frozen candidate fails its regular verification gate and should not be integrated as passing. This is a stale test expectation, not evidence of incorrect duplicate execution.

**Correction:** Keep the nested NOT/OR and explicit false/zero round-trip coverage, assert the supported duplicate tree is available, and retain a separate genuinely unavailable subtree round-trip/repair assertion using the default-disabled market family (or equivalent still-unsupported operation). Root should perform the one consolidated correction and rerun the affected test plus the final regular gate before pushing/claiming acceptance.

No Critical or Minor findings identified.

## Scope and assessment

- Read the parent `AGENTS.md`, the integration plan, original Phase07 Tasks 2–5, root P7.1/P7.2 and related retained query-preparation acceptance gates, and Phase10's real duplicate producer/dashboard semantics. Reviewed every changed compiler, availability, control, localization, test, CI and documentation path in the requested range.
- `packages/domain/src/search/duplicate-filter.ts:5` binds all actor operands and requires the private relation plus both live/current-owned endpoints and live/current-owned parents. Its endpoint OR is grouped. `search-compiler.ts:288` uses EXISTS for true and its two-valued complement for false. Existing outer authorization/lifecycle, mixed Boolean, text, count/page and snapshot composition remain in place. There is no quantity/title/catalog heuristic, endpoint-summary expansion or per-item producer call.
- Ordinary partner archive/disposal remains distinct from candidate lifecycle, consistent with the existing Phase10 producer and ALL_LIVE_OWNED_PAIRS dashboard statistic. Actual transfer retirement remains producer-owned; the new predicate also checks current ownership defensively. Membership does not expose another owner's declarations.
- Native cases cover real marking/unmarking, deleted partners/parents, actual membership/transfer retirement, saved resolution, selected dashboard counts, overlapping pairs and concurrent unmark across count/page. Existing root receipts report 12 native cases passing. The retained 1/50/500-item measurements show 11 instrumented raw/configuration calls per true/false search and actual count/page plans. These synthetic measurements establish the requested local evidence, not a production latency guarantee.
- `filter-leaf-editor.tsx:72` provides localized editable true/false choices through a native labeled select; market controls remain disabled. Existing root evidence reports eight compiled DE/EN desktop/mobile cases passing. The migrated generic unavailable HTTP fixtures retain closed-error/privacy checks, and the native duplicate file is included in the explicit CI cohort.
- Documentation preserves the independent shared-authorization prerequisite and canonical 63/91 count. This scoped review does not accept the original full Phase07 milestone, reopen the closed market review, or assert deployment/public release. Task 3 final receipts and exact candidate CI remain root-owned completion steps.

## Verdict

**Changes required: 0 Critical / 1 Important / 0 Minor.** The implementation is otherwise consistent with the scoped plan. Resolve the remaining stale draft test and obtain the final green local/exact-candidate CI evidence through the already planned root-owned correction/integration path; no second whole-plan review is requested.
