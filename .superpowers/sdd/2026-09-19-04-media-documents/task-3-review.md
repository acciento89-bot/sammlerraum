# Task 3 independent spec and quality review

Reviewed base `74e81efcea5a7aeea1171ca10289b22e1db0c90d` through head `785b70113c778d4fb40792d568a15e645a19077a`, using the Task 3 brief, context, report, supplied diff, changed implementation/tests, and direct queue/storage consumers. No implementation edits or redundant suite reruns.

**SPEC: PASS. QUALITY: PASS. Open Important findings: 0.**

Scoped rereview of `785b701..df4654ab7c4fa9f6cf2a0dc814d23ba63175102c` confirms I1 is fixed: the promise is passed directly to `.rejects` and the resulting assertion is awaited. Only the assertion and its report correction changed. No additional tests were run or review scope reopened. Real-PostgreSQL CI remains pending; this verdict closes the code-review finding and does not claim that gate passed.

## Resolved Important finding

### I1 — CLOSED in df4654a: rejection assertion awaited correctly

- Path: `apps/worker/src/jobs/image-repository.integration.test.ts:64`.
- The third claim has only a reserved, incomplete THUMBNAIL row. `repo.ready(third!)` correctly rejects with `Incomplete image variants`. In `expect(await repo.ready(third!)).rejects.toThrow(...)`, the inner `await` throws before `expect` is called, so this integration test necessarily fails when `RUN_DATABASE_INTEGRATION=1`. Local default runs skip it; CI now explicitly enables it. This also prevents the rest of this test from verifying successful READY publication and attempt exhaustion.
- Precise fix: replace the statement with `await expect(repo.ready(third!)).rejects.toThrow("Incomplete image variants");`. Run the dedicated real-PostgreSQL gate in CI to confirm the remaining assertions and migration/claim behavior.

## Scope assessment

No additional actionable correctness, security, or specification regressions found in the reviewed production paths. Durable PENDING/expired PROCESSING discovery is bounded and fairly ordered by dispatch timestamp; successful queue sends are recorded, outages preserve eligibility, and registry registration precedes runtime startup. Startup/shutdown integrate the dispatcher with queue lifecycle. Atomic claims, claim-token checks, bounded attempts, and deterministic variant reservations cover normal duplicate/crash/retry behavior. Reservations commit before byte writes, metadata follows writes, and READY requires all three completed variant rows. The processor validates length/checksum/type/pixel limits, decodes and orients once, and creates the exact three metadata-free WebP variants with bounded edges and no enlargement while preserving the original.

Sharp is externalized from the worker bundle and production dependencies are deployed into the final image. The new CI probe actually encodes/decodes with Sharp in that final image. Supplied local evidence is 301 passed / 28 database skips, typecheck/build, and native production-deploy smoke success; actual PostgreSQL and final Docker-image gates remain pending and are not claimed verified by this review.

## Cleanup contract and residual risk

The shared `createMediaAssetLocker` holds a dedicated PostgreSQL advisory lock across the claim and asynchronous storage work; Task 5 must acquire the identical lock around byte deletion and row removal, recheck eligibility/references under the cleanup protocol, and retain discoverable rows after partial failures. A live lock prevents normal overlap even if the claim lease expires. Observed unexpected session loss fail-stops the production worker.

The report accurately discloses that server-side lock loss can precede client detection during a partition. The claim token fences database mutations, not an already-started filesystem write. The ten-minute lease is not a hard attempt or storage-I/O deadline: no bounded cancellation of `storage.put` is implemented here. Therefore an arbitrary quarantine interval alone must not be presented as proof against late writes. This is a concrete destructive-cleanup integration hazard for Task 5, not an additional current Task 3 blocker: Task 5 cleanup does not yet exist, the writer retains tracking rows, and this review does not approve a future destructive cleanup implementation. Task 5 must solve/document late-write recovery and test the cleanup race before phase completion; it must not equate lease expiry or lock reacquisition with guaranteed cessation of prior storage I/O.
