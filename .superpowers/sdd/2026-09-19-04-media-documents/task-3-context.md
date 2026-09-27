# Task3 integration context

Read task-3-brief.md as requirements and the FINAL task-2-report.md for actual media contracts after review corrections.

MediaAsset PENDING is durable processing intent for every supported image MIME (IMAGE or DOCUMENT kind); UPLOADING is an unfinished durable original write. Worker must dispatch PENDING even when upload-time enqueue never happened, and recover stale PROCESSING after crashes. Original storage key is durable before writes. Store names THUMBNAIL/MEDIUM/LARGE, max-edge256/640/1600, WebP, aspect ratio preserved, no upscaling, EXIF/GPS removed, orientation correctly applied. Reject unsupported/oversized/corrupt source before fan-out and retain original on failure. Task2 schema may need additive fields/index for processing error code and claim/recovery; don't rewrite its published migration.

Use queue existing registry/client/runtime in packages/queue; apps/worker/src/run.ts currently only wires runtime health. Register before startup. Poll/recover durable intents with bounded work and stop timers on shutdown; queue downtime must leave records retryable. Duplicate/redelivered jobs and partial variant writes must be idempotent. A variant storage-key tracking row must exist before its bytes are written; publish READY only after all three complete; public readers inTask4 will gate onREADY. Asset mutation/claim design must allow Task5 cleanup to exclude active processing and avoid resurrection. Document the locking/lease and recovery interface.

MediaAsset owner and MediaVariant parent FKs RESTRICT to preserve byte tracking. Cleanup eventually removes bytes before rows; don't silently cascade originals or other links. Existing Task1 storage minor directory-fsync remains for phase final review; don't expand current scope without concrete impact.

Sharp is native. Current worker is esbuild bundled CJS with only dist copied into Dockerfile.worker. Make actual worker image include/resolvable Sharp+platform binaries (and any external runtime deps); validate runtime module load/decode in CI, not just docker build success. Use existing pinned tooling and verify packaging CLI options via local help/docs. No provider/prod deployment.

Focused real image fixtures including EXIF orientation/GPS, dimensions,no-upscale,exactthreevariants; retry/failure and durable tracking. Integrate meaningful DB/worker runtime tests into normalCI if needed. No localPostgres/Docker/Chromium; describe skippedgates honestly. No unnecessary repeatedfullsuite.
