# Task 8 implementation report

## Result

Implemented printable owner-only storage labels and a protected `/l/[token]` scan route. The label embeds `${APP_ORIGIN}/l/${token}` in a server-generated QR image and displays the location name and first eight uppercase UUID characters as an internal short code. It does not render item values, private notes, or the raw token as text. The token is the existing stable 32-byte random `qrToken`; no schema migration or token rotation is needed. A location's disclosure in collection management links to its label; a localized location page shows owner-scoped child locations and item titles/quantities after a scan.

The scan page checks a fresh server session (`disableCookieCache`, `disableRefresh`) before any token lookup. A token lookup always includes the actor owner ID; invalid and foreign tokens both yield 404 for authenticated actors. Anonymous scans redirect to the localized login page before token lookup, regardless of token validity. No location ID or metadata is returned to an anonymous or foreign actor. Pages are dynamic, have noindex metadata, and matching paths get `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, and `Referrer-Policy: no-referrer`. The existing proxy matcher only covers `/` and exact `/de`/`/en`, so `/l/[token]` reaches the scan route untouched. No QR service is called: `qrcode-generator@1.5.2` generates the image on the server.

## RED / GREEN

- RED: `corepack pnpm vitest run packages/domain/src/locations/label-service.test.ts` exited 1, missing `./label-service` (test written first).
- GREEN: same focused command exited 0 with 2 tests, verifying owner-scoped token resolution, anonymous/foreign failures, malformed token failure, and printable output excluding private item data.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- CI-complete production environment, `corepack pnpm --filter @sammlerraum/web build`: passed; Next registered `/l/[token]`, `/[locale]/locations/[locationId]`, and the label path as dynamic routes.
- `corepack pnpm --filter @sammlerraum/web exec playwright test e2e/location-labels.spec.ts --list`: 2 cases discovered, desktop and mobile. Plain command exited 0 with both skipped because `RUN_AUTH_E2E` was unset. The actual owner print/scan, anonymous equal redirect, invalid/foreign 404, noindex/no-store checks need the CI PostgreSQL/Chromium environment. Both projects explicitly include this spec, and CI runs it with `RUN_AUTH_E2E=1 --workers=1`.

## Limits / review focus

No local PostgreSQL, Docker, or Chromium was available; browser behavior and real database queries have not been executed locally. CI should validate route redirects, response headers, locale selection, item location fixture, and mobile layout. The QR label is intentionally a printable page rather than a downloadable image/PDF. Existing login behavior directs an anonymous scanner to login; they can rescan after signing in. No task checkoff or push was performed.

## Independent review correction

The review found the scanned location destination called `LocationLabel.printLabel` without a dictionary entry. Added "Etikett drucken" and "Print label" to the DE/EN `LocationLabel` dictionaries. A focused Node assertion for both keys first failed on `de: missing LocationLabel.printLabel`, then passed after the change. `corepack pnpm --filter @sammlerraum/web lint` and `corepack pnpm --filter @sammlerraum/web typecheck` both passed. The real browser run remains pending CI.

## Production browser locale fixture correction

CI run `36315633315`, job `108609685026`, passed real database and production label `no-store` gates but failed both label projects at the owner scan URL assertion (desktop expected `/de/locations/...` and got `/en/...`; mobile expected `/en/...` and got `/de/...`). The test visited `/de/login` or `/en/login`, but the proxy sets `NEXT_LOCALE` only on the exact `/de` or `/en` route. The neutral `/l/[token]` route correctly selects locale from the cookie, then `Accept-Language`; the fixture had not set its expected cookie. The login helper now visits the exact locale home page first and asserts `NEXT_LOCALE`, before login. The owner scan sends the opposite `Accept-Language` to verify cookie precedence. Anonymous API requests explicitly send the chosen `Accept-Language` to verify header fallback without an auth cookie. No production routing or privacy assertion changed. Targeted web lint and typecheck both passed; the production PostgreSQL/Chromium browser run is pending CI.

## Production locale prefetch correction

CI run `36315959950`, job `108610590792`, still failed both desktop/mobile scan locale assertions after the fixture confirmed `NEXT_LOCALE` at login. Subsequent pages render `/de` and `/en` language links in the shared layout. Next 16's installed client code sends `next-router-prefetch` for Link prefetches, and the proxy treated every request to exact `/de` or `/en` as a deliberate language choice, setting the cookie on speculative requests. This explains both inversions: prefetching the opposite language link can overwrite the cookie after the fixture's initial assertion. A focused proxy test reproduced RED: a prefetch of `/en` with `NEXT_LOCALE=de` yielded a `Set-Cookie` for `en`, while a real navigation intentionally yielded the same cookie. The proxy now skips cookie mutation on `next-router-prefetch`, `purpose: prefetch`, or `sec-purpose: prefetch`; real navigation still persists the selected locale. Language switcher Links also use `prefetch={false}` to avoid speculative cross-locale requests. The focused proxy suite is GREEN (3 tests: Next prefetch, browser prefetch, real navigation), and targeted web lint and typecheck pass. The owner scan and anonymous privacy assertions remain unchanged. Production PostgreSQL/Chromium browser validation is pending CI.

## Browser suite rate-limit isolation correction

CI run `36316300580`, job `108611542753`, passed both production label journeys, then the authentication journey failed at `auth.spec.ts:299` because its reauthentication `/api/auth/sign-in/email` response was not OK. The logs also showed a rate-limit unique-key conflict, but the failing response status/body was not captured, so HTTP 429 is an inference rather than a verified response. The configured Better Auth `/sign-in/email` rule uses a shared database bucket (5 requests per 60 seconds). Each label project signs in an owner and an outsider, and the label suite previously cleared rate-limit rows *before* each project but left the final project's two sign-in counts for the following auth suite, which uses the same `_test` database and performs several further sign-ins. The label suite now clears its test rate-limit rows in `afterAll` before disconnecting, including after a failed test. The existing `_test` database and nonproduction fixture guards remain in place. No production rate limit, authentication assertion, or journey count changed. Targeted web lint and typecheck passed, and Playwright discovery still lists both desktop/mobile label cases. The real browser gate must confirm this isolation in CI.


## Final remote verification — complete

Exact source `d6a1a5e860bbf3bd84c0f0d5a213292362ca73ad` passed CI36316664397 / job108612541982:240 unit/static,109 dedicated integrations (22 actual database cases),2 production QR journeys,4 auth journeys,16 management journeys; migrations/lint/typecheck/build/Compose/both Docker builds PASS. Task and scoped reviews approved corrections. Phase integration R1 is addressed; R2 fixture teardown corrected and verified in actual DB gate. M1/M2 remain documented nonblocking UX follow-ups. This completes Task8 and Phase03, not the V1 release or deployment.
