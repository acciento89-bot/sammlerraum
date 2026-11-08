# Phase 13 whole-phase Senior Code Review

Reviewed immutable range `7289140d8fd422cc0561e03cf5e5f33a75d683f4..06cab579f45c9f118368a003e7887deb6161f3ab`. All file/line references below refer to the latter commit, not the subsequent working tree. Read-only review of source, test contracts, original design spec, Phase13 plan and committed evidence. No tests, builds, browser sessions, Docker/native runtime, subagents or Git mutations were run. This report is the only file written.

## Verdict

Changes substantially implement the authorized Phase13 source work, with careful separation between source proof and live production authorization. Two Important verification gaps should be corrected before treating the phase's source gates as complete. No Critical defect found. Passing the eventual exact-source CI remains necessary; neither the pending earlier CI nor this static review establishes that result. Public availability, production deployment, providers and Search Console remain unaccepted and separately authorized.

## Critical

None found.

## Important

### I1 — Run the real application against the recovered database and uploads in the recovery gate

**Location:** `scripts/recovery_test.py:89-110` (health fixture), with the disconnected application drill at `scripts/test-production-stack.sh:39-44` and CI wiring at `.github/workflows/ci.yml:324-339`.

The successful restore test serves `status: ok` from a Python HTTP server whose only application check is `SELECT 1` against the target DB. The separate real web/worker stack starts a fresh migrated database and new uploads volume. Consequently both mandatory CI stages can pass without the real application ever opening the restored schema or accessing any restored bytes. For example, a dump/restore that preserves counts and inventory but cannot be consumed by the deployed app, or restored storage permissions/paths that prevent the non-root web process from serving a private document, will not be detected. This is a missing source integration test, not a request for an unauthorized production restore.

The docs honestly disclose this limitation (`docs/operations/backup-restore.md:29`), but saying the later application gate remains mandatory does not connect that gate to the recovered resources. The plan calls for recovered-service health, and the spec's section29 requires an actually tested, logically consistent recovery; a reasonable operator also needs evidence that recovered data remains usable through the application.

**Smallest fix:** extend the owned CI recovery drill to start the reviewed real web image with the restored DB and restored uploads, outbound integrations/dispatchers disabled. Check the real `/api/health` and read at least one retained private original/document and variant through the actual authenticated media route, comparing bytes and verifying an anonymous denial. Run exact-count verification before starting any mutating application activity. Keep scratch isolation and existing corruption/refusal cases. A local synthetic CI drill is sufficient for this source requirement; no live access is needed.

### I2 — Public locale-page smoke can pass for the wrong page or redirect destination

**Location:** `scripts/smoke-production.py:30-45` and `scripts/smoke-production.py:50-52`.

`urlopen` follows redirects, and each landing/login/pricing assertion accepts any final HTTP200 body containing `<html` and `</html>`. For example, redirect `/de/pricing` and `/en/pricing` to the same English login page while leaving health/OpenAPI and the negative API checks intact: all six page checks can still pass. A proxy catch-all serving one HTML shell produces the same false positive. The receipt nevertheless reports the German and English landing/login/pricing checks as passed. This misses a concrete deployment/configuration failure in an explicitly required Task7 check.

**Smallest fix:** assert the final owned-host URL and expected locale/path (with only deliberate canonical-host normalization permitted), HTML language, and a stable page-specific localized marker for landing, login and pricing. Add offline fixture-server tests showing wrong-page HTML, cross-locale redirects and an unrelated-host redirect cannot earn a passing receipt. This can be implemented and tested without making any live changes or declaring the presently failing smoke accepted.

## Minor

### M1 — Permission suite unnecessarily binds a PostgreSQL17 requirement to patch17.11

**Location:** `apps/web/e2e/security-permissions.spec.ts:36-40`; related moving CI image at `.github/workflows/ci.yml:46`.

The permission fixture refuses any server whose version string does not start with `17.11`, while CI deliberately pulls `postgres:17-bookworm`. Once that tag advances to17.12, the entire permission gate will fail in setup despite meeting the PostgreSQL17 contract and without testing any permissions. The recovery tooling correctly checks the major version instead.

**Smallest fix:** validate `server_version_num / 10000 = 17` plus the owned test-database guard. If a patch-specific regression truly requires17.11, pin and document that test dependency consistently instead. A patch-version upgrade should not require changing an unrelated permission matrix.

## Plan/spec alignment and strengths

- Task1 adds an actual compiled API matrix with seven signed-in actors plus anonymous, positive/negative persisted effects, private bytes/cache protections, owner-only boundaries, explicit moderation, Premium gates and share/block cases. It does not weaken runtime policies to fit guessed statuses.
- Task2 implements four locale/viewport collector journeys with real forms, signup verification, media/import workers, explicit AI confirmation, recipient invitation, insurance PDF, notifications and private/public boundaries. Provider transport is explicitly synthetic; no real provider acceptance is implied.
- Task3 uses an exported repeatable-read snapshot for custom dump/counts/references, validates archive and per-object checksums, refuses unsafe paths and nonempty scratch targets, and exercises real PostgreSQL restoration and negative cases. I1 is the remaining application-integration gap.
- Task4 adds bounded broker options, retry-budget validation, serial batch execution, bounded image reads and terminal oversized-source classification. Shutdown preserves application DB connections when queue/market settlement is unproven. The replay tests explicitly preserve SMTP uncertainty rather than inventing exactly-once delivery.
- Task5 prepares immutable four-service Compose, external DB/uploads volumes, resource limits, reduced application privileges, one-shot migration dependencies, guarded frozen migration tooling and a CI-only non-destructive stack drill. Operator commit/backup inputs are explicitly documented attestations, not cryptographic proof.
- Task6 adds generated OpenAPI/ICU parity/payment-route contracts, a complete native zero-skip gate, and a source-SHA-bound CI coordinator. The exact four allowed subscription-billing endpoints are appropriately separated from forbidden user-to-user payments. No product scope reduction is apparent in this phase.
- Task7 prepares a manually invoked anonymous owned-host smoke and records actual predeployment failure rather than claiming availability. I2 concerns the source's ability to detect wrong deployed locale pages.
- Original complete V1 scope91 and all later live/SEO prerequisites remain binding. Neither source-ready artifacts nor disabled provider configuration constitute completed operational V1.

## Evidence limitations

The committed records and assignment report actual84 permission cases, four complete browser flows, eight real recovery tests,162 affected native/pure worker checks, and3055 tests across282files with zero skips. These are supplied/committed evidence, not runtime results independently reproduced by this reviewer. The3055 full run predates the final narrow test-helper correction; the subsequent20 focused passes do not replace a final whole exact-source run. Earlier Task5 CI failed at the historical Docker-command string assertion, so it provided no container-stage acceptance. The corrected earlier-source run, even if successful, does not cover the final Task6 coordinator. Require the final reviewed/corrected source's successful complete CI and actual container receipts before source acceptance. The13 failing HTTPS smoke checks remain failures, as recorded. No Docker or real application recovery evidence was inferred from a fixture health response.

## Declined to judge

1. Actual Docker rendering, image startup/migrations, non-root filesystem behavior and running volume persistence: prohibited runtime execution in this reviewer assignment; final exact-source CI receipts are required.
2. Actual recovered Next.js/media-route behavior: no such integrated source gate exists at this reviewed version (I1), and this reviewer cannot run applications. DB-backed fixture success is insufficient evidence.
3. Final-head complete test/browser/build success: only immutable source and supplied evidence were reviewed; final exact-source CI has not been established for this head.
4. Live Portainer deployment, public TLS/DNS/proxy correctness, real media persistence on the host, real OAuth/SMTP delivery, provider/payment rights or activation, and live customer readiness: outside authorized source work and no adequate live proof supplied. No live operation is requested as a review fix.
5. Actual production SEO/Search Console ownership/sitemap submission: separately scoped Phase14/live authorization; subsequent Phase14 working-tree changes were intentionally excluded.

No other intentional refusal to judge behavior within the reviewed Phase13 source scope.
