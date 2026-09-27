# Phase 04 Task 3 — durable sanitized image variants

Base: `74e81efcea5a7aeea1171ca10289b22e1db0c90d`. Implementation head: `96cd21fbbf3e64cdd1cd781c3b7c826177fbfa76` (this report follows in a second commit).

## Implementation

- Every PENDING JPEG/PNG/WebP asset, whether IMAGE or DOCUMENT, is a durable processing intent. A bounded dispatcher selects at most 32 eligible assets per pass, enqueues `media.process-image { assetId }` with an asset singleton key, and stamps successful dispatches so a larger backlog advances. Failed enqueue leaves the row eligible. The timer begins only after the queue registry is registered and runtime has started; shutdown clears the timer and awaits the in-flight scan before queue teardown.
- An additive migration introduces a claim UUID, lease deadline, attempt count, explicit error code, dispatch timestamp, and indexes. Atomic `updateMany` claims PENDING or expired PROCESSING; max five attempts lead to FAILED. A claim token fences renew/reserve/finish/READY/FAIL updates; stale delivery cannot alter the current claim. Transient storage/processing errors return to PENDING, while corrupt/missing/oversized input and encoding errors mark FAILED. A crashed attempt is retried after its ten-minute lease. There is no upload-time enqueue dependency.
- The processor verifies the stored original length and SHA-256, MIME/decoded dimensions/pages/pixel cap, then decodes and applies EXIF orientation once. It produces only THUMBNAIL (256), MEDIUM (640), and LARGE (1600), fit inside max edge, without enlargement, as metadata-free WebP. Each deterministic variant key has a committed `MediaVariant` reservation before `storage.put`; retry rewrites the same tracked key and metadata. READY requires all three complete records after all writes. The original is neither changed nor removed.
- The worker holds a dedicated PostgreSQL-session advisory lock across claim, decode, and storage writes. `createMediaAssetLocker` is exported from `@sammlerraum/db/media-lock` for Task 5: cleanup must take the identical lock across byte deletion and row removal, skip and retry when held, and exclude active processing. Unexpected observed lock-session loss aborts the worker process. A network partition can release the server lock before the client detects it; this is a residual late-write race rather than a mathematically perfect fence. Task 5 should use a conservative deletion/quarantine interval and recovery checks along with this lock.
- Sharp remains an external native runtime module in the esbuild bundle. Docker uses pinned pnpm legacy production deploy to copy worker runtime modules and platform binaries into the final image; CI builds/tag it and runs WebP encode/decode in that final image.

## RED → GREEN and verification

- Processor RED: missing `process-image` module (after adding worker Sharp dependency); GREEN: 8 processor tests cover both asset kinds, oriented EXIF/GPS fixture and stripped outputs, exact dimensions/no upscale, corrupt/tampered input, byte cap, storage retry and a partial tracked write.
- Dispatcher RED: missing module; GREEN: 2 tests cover batch of 32, singleton payloads, outage eligibility, and timer stop.
- Repository and advisory lock integration RED: missing modules; local suite skips actual PostgreSQL tests. CI now runs two repository integration tests (stale claims, token fencing, tracked keys, READY, max-attempt failure, pagination/PDF exclusion) and one two-session advisory lock test after migration deployment.
- Worker lifecycle RED: startup omitted dispatcher; GREEN: registration lifecycle startup/stop ordering test.
- Full `corepack pnpm test`: **301 passed, 28 skipped**, 41 files passed and 7 integration-only files skipped. The first full run had one production-config assertion failure because Docker flags moved its required command prefix; changing only the flag order made the focused test green, then the full run passed.
- `corepack pnpm typecheck`, worker build, worker/db lint, Prisma schema validate, frozen offline install, and `git diff --check` passed. Local `pnpm deploy --prod --legacy` included Sharp and native WebP encode/decode passed. Docker and PostgreSQL are unavailable locally, so the final-image probe and DB integration remain **CI gates**.

## Scope and handoff

No deployment, push, merge, cleanup implementation, or ledger checkoff. Task 5 must use the shared media asset lock and account for reserved variant rows with zero metadata or a put that completed before metadata update. It must delete bytes before tracking rows, including any partial variant and original; give a stale worker's bounded attempt time to stop before destructive cleanup. The lock's observed-loss fail-stop reduces but cannot eliminate a server/client partition interval.

Changed paths: `apps/worker/src/jobs/{process-image,image-dispatcher,image-repository}*.ts`, `apps/worker/src/{main,main.test,run}.ts`, `apps/worker/package.json`, `packages/db/src/media-lock*.ts`, `packages/db/{package.json,prisma/schema.prisma,prisma/migrations/20260927160000_media_image_processing/migration.sql}`, `pnpm-lock.yaml`, `Dockerfile.worker`, `.github/workflows/ci.yml`, and this report. Controller owns `progress.md` and canonical ledger.

## Review correction

The real-database fixture's incomplete-READY assertion now passes the promise directly to Vitest's `.rejects` matcher. The earlier `expect(await promise).rejects` shape would throw before Vitest could observe the intended rejection. Local PostgreSQL is unavailable, so this fixture still requires the CI database gate; the focused local test loads and skips it.
