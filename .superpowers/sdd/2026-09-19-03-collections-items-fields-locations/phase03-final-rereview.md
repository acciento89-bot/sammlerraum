# Phase03 final-fix scoped rereview

Reviewed 2026-09-27. Range: `dd972b6..7936d5890ac4089761658d98692b199d11d3dbdd`.

**R1: ADDRESSED in production code. One new Important/P2 test-fixture issue remains. No new Critical finding.**

## Scope and evidence

Read the complete 954-line prepared fix diff in bounded passes and `phase03-final-fixes-report.md`. Inspected only relevant surrounding code for the split transaction, fixture cleanup contract, profile form, production browser harness and CI environment. This is one scoped rereview, not a repeated Phase03 audit. No suites were rerun and no production/test code was edited. M1/M2 remain explicitly deferred and were not reopened.

Accepted supplied evidence: tests-first split reproduction, focused local result of 10 passed / 6 database-dependent skips, workspace TypeScript/changed-file format success, and a real anonymous no-store response from the available prior production build. The latter does not establish authenticated label behavior or correctness of the newly built candidate. Fresh CI remains pending.

## Original R1 — ADDRESSED

`packages/domain/src/items/item-service.ts` now obtains `storageLocationId` in the locked source projection. While retaining the source row lock and the same transaction, it reads identifiers, tag links and typed values with ordered multi-select links; creates the split row with the current location; copies related values to the new item ID; and creates one initial location-history assignment when located.

The copy retains exact Decimal strings via `toFixed()`, bigint money/integer values, currencies, dates, field/option IDs and selection positions. It generates new identifier row IDs and uses existing owner/collection scopes. It does not duplicate prior movement events. All relation and history writes occur before the transaction returns, so an error rolls back both the decrement and new row. Existing metadata setters serialize on the source item lock. Adding the location to the internal selection does not enlarge the item DTO: its contract still strips fields outside the explicit schema.

The new owner-route integration case meaningfully exercises count/location conservation, identifiers/tags, exact DECIMAL/MONEY and ordered multi-select round trips. A separate PostgreSQL regression injects a metadata-write failure after scalar creation. Their real-database execution is pending, not claimed successful from the skipped local run.

## New Important finding

### R2 — Important / P2: new located-item fixture omits required history cleanup

**Location:** `apps/web/src/app/api/v1/items/resource-route.integration.test.ts:308-309`.

**Trigger:** run the new `splits a populated item and preserves owner metadata, location count, and typed values` case with `RUN_DATABASE_INTEGRATION=1`. The fixture creates an initial assignment history for the source and another for the split item, both referencing `ownerId` as `assignedById`. Its `finally` directly calls `prisma.user.delete` without first deleting those history rows.

`ItemLocationHistory_assignedById_fkey` deliberately uses `ON DELETE RESTRICT`. The canonical Phase03 Task5 ruling explicitly requires fixtures to remove their history before users (`SAMMLERRAUM-V1-LEDGER.md:421`); the established location integration fixture does so at `packages/domain/src/locations/location-service.test.ts:526-532`. This new fixture reintroduces the previously corrected restricted-history teardown problem. The real database gate can fail in cleanup, masking the substantive split assertions and leaving its fixture behind. This is a source/constraint finding; it was not reproduced against a local PostgreSQL instance.

**Correction:** in this fixture's `finally`, first delete history scoped to this fixture's `assignedById: ownerId`, then delete the owner, matching the established fixture pattern. Preserve the schema's RESTRICT behavior. The normal fresh real-database CI run should verify the corrected teardown along with the new split assertions.

## Other fix areas

- **Profile hydration guard:** the submit button is disabled in SSR and stays disabled until the effect runs. The handler prevents default before checking hydration. The added JavaScript-disabled context checks the disabled SSR state; the existing hydrated save journey remains. No new Critical/Important production issue identified in this small fix.
- **Production label harness:** production mode launches the built standalone server, links static assets, preserves the test SMTP configuration, and sets production only for the server child. The Playwright fixture runner retains the test environment and its production-data safety guard. CI runs labels before dev-server journeys can rewrite `.next`, and retains the strict no-store assertion. No new Critical/Important source issue identified; authenticated desktop/mobile execution still requires fresh CI.

## Verdict

R1 is addressed. Fix R2's isolated integration-fixture teardown and obtain the controller's fresh normal CI result before final Phase03 checkoff. This scoped review makes no V1 release, merge or deployment approval claim.
