# Phase08 Task2 completed-candidate review

BASE: `0611d35007e73c3d1da2928825dd433763ba01d3`
HEAD: `f90e6d49d73327bad2f0848a50815fe83650b23f`

SPEC: FAIL — retryable parse failures have no effective retry continuation.
QUALITY: FAIL — one actionable P2; no P0/P1 found in the changed candidate.

Read-only review of all 20 changed files against plan Task2, spec §17, the scoped task-2-execution-context.md and applicable parent /Volumes/SSK SSD/Kamilunavo/AGENTS.md. No tests, database, browser, servers or source/git mutations were performed by this reviewer. Runtime/test pass counts supplied by the coordinator were treated as reported evidence, not independently executed results.

## P2 — Retryable parser errors acknowledge the queue job instead of retrying

Location: `apps/worker/src/jobs/import-parser-runtime.ts:118-122` (the catch completes normally after this call).

A transient storage/database error, including a batch transaction failure after a persisted prefix, is mapped to `IMPORT_PROCESSING_ERROR`; cancellation is mapped to `IMPORT_PARSE_CANCELLED`. The handler calls `repository.fail(claim, code, true)` and then resolves. The real repository clears the claim and sets status back to AWAITING_UPLOAD (`import-parser-repository.ts:191-194`). The registered pg-boss callback awaits this handler (`packages/queue/src/runtime.ts:92-100`), so normal resolution acknowledges successful queue processing. There is no import retry dispatcher in this candidate. As a result a transient transaction failure leaves a partially parsed job permanently AWAITING_UPLOAD even though the code explicitly chose retry=true; pg-boss's configured retries do not run. This affects the worker after a source has already been uploaded and dispatched, independently of the future uploader/API/UI task.

Preserve the durable retry state but signal retryable failure to the queue (or provide an equivalent durable retry continuation). Keep permanent source/format/limit failures terminal. Verify through the actual registered handler/queue boundary that a one-time append failure rejects the first queue attempt, then a second attempt validates the existing immutable prefix and reaches PARSED without duplicate rows. The current runtime test 'does not complete a partially consumed source after persistence fails' only checks repository.fail and therefore permits the queue acknowledgement bug.

## Other reviewed boundaries

The implementation deliberately avoids a formula engine and reads only stored XLSX values, including exact numeric lexemes. Macro content/types, encrypted ZIP entries, path traversal, external relationships, DTDs, missing shared strings and malformed row/cell addresses are rejected. ZIP entries, decoded XML bytes, depth, shared-string count, scanned rows, columns and compact per-row bytes have finite ceilings; sparse sheet addresses do not allocate dimension-sized arrays. Actual LocalPersistentStorage reads are bounded, and the same private returned bytes are length/SHA-256 verified before PARSING and row writes.

The persisted claim/token checks fence ownership; batch writes are transactional and limited to 100 rows; retries compare raw cells/source addresses instead of rewriting the prefix; completion checks total row coverage. Cancellation awaits actual outstanding work and renewal before releasing the claim. Deleted collections are excluded from each locked mutation, while deleted owners cascade their jobs through the existing foreign key.

Plan review focus 3-5 concerns actual inventory commit idempotency, duplicate-resolution choices, and export/PDF privacy defaults. Those are future tasks and are not implemented or claimed by this candidate. No finding demands their implementation here. Upload endpoint, dispatch initiation and cleanup exposure remain the explicitly deferred integration obligations.

## Root closure after the frozen review

Original independent FAIL is retained above. Root reproduced the P2 with actual native retry tests and runtime cancellation/failure tests: three genuine failures in task-2-20261106-review-retry-red.log. Commit4437e0c releases the durable claim before throwing a controlled retryable error to pg-boss. Permanent invalid sources remain terminal normal completions. Native retry then reaches PARSED, and five failures close at the attempt limit. Root also reproduced uppercase UUID row-key mismatch and normalizes the payload before deriving stable keys. Final29focused cases pass (8native,18parser,3runtime), including both closures. Full835native/73files/0skip,1501regular/706explicitnative-off, finaltypes/lint/build and22actual-built inventory browser cases pass. Root accepts the completed fix pass with no remaining actionable finding; no second independent PASS is fabricated.
