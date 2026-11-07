### Task 2: Actual saved/dashboard/API and localized Boolean controls

**Files:** Modify apps/web/src/components/search/filter-draft.ts and filter-leaf-editor.tsx, existing draft tests and e2e/search-dashboard.spec.ts; add focused duplicate consumer cases in the new native file. Existing API adapters stay generic unless a real regression requires a narrow fix.

- [ ] TDD actual saved mark/unmark resolution and dashboard matched selection/count parity; strict routes remain fresh-auth, no-store and closed errors. Retained own summaries must not expose pair IDs/other private endpoint metadata.
- [ ] Enable only duplicate family, add editable localized true/false selection, and make available() reflect its actual producer. Preserve market disabled-by-default controls and canonical-money behavior.
- [ ] Run actual DE/EN desktop/mobile compiled journeys selecting true/false and live refresh/saved resolution, plus relevant HTTP/native regression and types/build checks. Commit exact results.

