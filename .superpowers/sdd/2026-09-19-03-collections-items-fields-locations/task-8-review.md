# Task 8 review — 98b832d..4883984

## Spec verdict: changes requested

The printable label uses the existing random, stable `qrToken` in an absolute `/l/[token]` URL, and renders only the location name, short code, and QR image. The scan route obtains a fresh session before querying the token; the lookup and destination contents query are owner-scoped. Anonymous requests redirect without token lookup, and foreign or invalid tokens return 404. DE/EN locale selection, noindex and private no-store headers are present. The browser spec is registered for desktop and mobile CI. However, a successful scan cannot render its intended location page because of the finding below, so the core scan-to-location journey is incomplete.

## Quality verdict: changes requested

- **Important — valid scans hit a missing translation key.** `apps/web/src/app/[locale]/(app)/locations/[locationId]/page.tsx:46` calls `t("printLabel")`, but `LocationLabel` has no `printLabel` in either `apps/web/messages/de.json` or `apps/web/messages/en.json` (the `printLocationLabel` key exists only under `CollectionDetail`). `next-intl` raises `MISSING_MESSAGE` while rendering, so the destination for every valid QR scan errors rather than showing location contents. Add this key to both `LocationLabel` dictionaries or use a key that exists, then let the browser journey verify the rendered page.

The reported focused unit tests went RED/GREEN (2 passing); lint, typecheck, and build passed. The browser spec lists two projects, but the actual PostgreSQL/Chromium execution is pending CI. Its owner-scan assertion should expose the render error when run. I did not rerun the full suite.
