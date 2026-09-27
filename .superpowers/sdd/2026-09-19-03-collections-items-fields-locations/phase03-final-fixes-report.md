# Phase03 final fix wave — implementation report

Base `dd972b6` on `work/sammlerraum-v1`. Scope: R1 split metadata, observed auth hydration race, and production label header browser gate. M1/M2 intentionally deferred to controller's record. No merge, push, deployment, or phase checkoff.

## Changes

- Split retains the existing row lock and ReadCommitted transaction, then reads the source's identifiers, tag links, typed field rows and ordered multi-select links. It creates the split item with current location, copies those rows with the new item ID and original collection/owner scope and exact values (Decimal converted via fixed decimal string; MONEY minor units/currency preserved), and adds one initial location-history assignment from null when located. Existing movements are not copied. All writes occur in the quantity transaction, so any metadata failure rolls back both scalar changes. Identifier uniqueness is item/type/normalized value, so copying item-scoped identifiers is supported; their new row IDs are generated.
- ProfileForm renders its submit button disabled until `useEffect` marks it hydrated; its handler also prevents and rejects an early submit. The browser regression uses a JavaScript-disabled, authenticated page to check SSR disabled state and Enter implicit submission, while the existing same journey checks successful hydrated PUT/save.
- `RUN_PRODUCTION_E2E=1` starts the built standalone Next server with `NODE_ENV=production`; the harness links built static assets into standalone output and retains the test SMTP overrides. CI runs both desktop/mobile storage-label projects against this server immediately after build/Chromium install and before dev journeys can mutate `.next`. The strict `no-store` assertion remains unchanged.

## Tests-first evidence and local checks

- RED: `corepack pnpm@10.17.1 vitest run packages/domain/src/items/item-service.test.ts -t 'copies populated metadata in the locked split transaction'` exited 1; expected the new row to contain `storageLocationId`, but the actual insert had no such property. This was before production edits.
- GREEN: same focused command exited 0 after correction. Subsequently `corepack pnpm@10.17.1 vitest run packages/domain/src/items/item-service.test.ts apps/web/src/app/api/v1/items/resource-route.integration.test.ts` exited 0: 10 passed, 6 skipped (four item and two route PostgreSQL integrations). The populated owner-API test checks both reads, location/global count 10, identifier/tag preservation, exact DECIMAL and MONEY, ordered multi-select and one initial movement; the real-database rollback fixture injects an identifier metadata write failure after row creation.
- `corepack pnpm@10.17.1 exec tsc --noEmit --project tsconfig.base.json --pretty false` exited 0. Initial recursive typecheck exposed the new select/type mismatch; it was corrected before the clean direct workspace-wide TypeScript check.
- `corepack pnpm@10.17.1 exec prettier --check` on seven changed implementation/test/CI files exited 0. `git diff --check` exited 0.
- Local built standalone runtime (without database/browser): invoked `node apps/web/.next/standalone/apps/web/server.js` with production environment and `curl --noproxy '*'` for an anonymous `/de/locations/<uuid>/label`. Actual HTTP response: `307 Temporary Redirect`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, redirect to `/de/login`. This proves the route's production response header for an anonymous request on the available prior build, not an authenticated label read or a new-build browser pass. The built route manifest also has the label `private, no-store` rule.

## Remaining remote gates

PostgreSQL, Docker and Chromium are unavailable locally. Therefore the newly added PostgreSQL owner-route/rollback tests, auth SSR/browser regression, production label desktop/mobile journeys, and full GitHub CI need the controller's fresh CI run. Existing concurrent split test remains in the remote DB suite. No claim that those skipped/unrun gates passed locally.
