# Task 5 fix review

Reviewed `e3e463e5df5a5f8efa48938326ed29198c026ba7..971cec14d7e14c9058599fa52993713eeb3ca9c4`, limited to the three findings in `task-5-review.md` and regressions introduced by their fixes.

## Findings

No findings.

## Assessment

All three review findings are resolved.

- `packages/domain/src/locations/location-service.ts:259-262` now rejects every unchanged assignment, including `X -> X` and `null -> null`, immediately after locking and loading the owned item and before target lookup, current-location update, or history insertion. The regression at `packages/domain/src/locations/location-service.test.ts:130-156` verifies `ITEM_LOCATION_UNCHANGED` and proves neither mutation is called.
- `packages/domain/src/locations/location-service.test.ts:158-208` covers `X -> Y` followed by `Y -> null`, including the updated current location and exact history endpoints. The PostgreSQL case at lines 503-525 repeats both transitions against the real composite foreign keys and checks persisted current state and history. The existing forced history failure still proves transaction rollback at lines 450-481.
- The intentional `ItemLocationHistory.assignedById ON DELETE RESTRICT` retention boundary and published migration are unchanged. The PostgreSQL fixture now explicitly removes its own randomly scoped history rows before deleting its users at `packages/domain/src/locations/location-service.test.ts:526-533`, so teardown respects the product retention ruling instead of weakening it.

The fix changes only the location service and its focused tests. Static review found no new ownership, privacy, transaction, or concurrency regression, and `git diff --check` is clean.

## Verdicts

- **SPEC: PASS.** Location history now records only real assignments, moves, and unassignments, with current state and history written atomically.
- **QUALITY: PASS.** The prior PostgreSQL cleanup defect is corrected without weakening audit attribution, and the missing transition coverage is present at both unit and real-database levels.

Reported evidence is accepted without rerun: the new same-location RED followed by GREEN, 203 unit passes with 19 expected database skips, lint, and typecheck. Controller full CI run `35536014090` is still in progress and remains the final external gate.
