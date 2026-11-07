# Independent whole-Phase10 review

Candidate: `372334a6e59734f927e3a31aaa601befe32e244b`. Accepted baseline: `1760cd29f9239f83c92d37be22055c78d96467ed`.

This is the single fresh independent review requested by `whole-phase-review-request.md`. It covers all eight tasks against `docs/superpowers/plans/2026-09-19-10-community-moderation-notifications.md`, the relevant design specification, and the task reports/rulings. Source review was read-only; only this report was written. No tests, builds, browsers, servers, database actions, provider calls, or additional agents were run. Findings below are source-derived causal reproductions, not claims of independently executed failures. Preserve this original verdict through the root's consolidated correction pass.

## Findings

### Critical

None found.

### Important — I1: Export renewal publishes a completion event before completion

Location: `/Volumes/SSK SSD/Kamilunavo/Projects/Sammlerraum-SourceRecovery-20261105/apps/worker/src/jobs/private-artifact-repository.ts:142` (the `onJobCompleted` call in `renew`, lines 142–147).

`renew()` has just checked that the export is still `BUILDING` and extended the job/media leases. It nevertheless creates the stable `export:completed:<jobId>` notification. The real worker invokes renewal after ten seconds while source capture or storage I/O is still in progress (`tabular-export-runtime.ts:54`). An export with a slow upload therefore records `EXPORT_COMPLETED` before `ready()` verifies current authorization/source and publishes the artifact. If that upload fails, is cancelled, or the final verification rejects stale source, the completion row survives although the job remains pending or failed. Notification listing still displays its completion type even though its target is unavailable. With optional inventory email enabled, the delivery repository also accepts this receipt without checking job readiness, so it can send an activity email for a failed export. Event-key deduplication later masks the premature event rather than correcting when it occurred or which preference snapshot it used.

Causal reproduction: create and claim a valid export; call `renew(claim)` while it is `BUILDING` (or hold the worker's storage upload past its ten-second heartbeat); observe the notification inserted by this source path; fail/cancel the export before `ready`. The receipt remains. The existing successful-export assertion checks the final count of one and therefore does not distinguish this premature emission.

Correction: remove completion emission from renewal and retain it only in the successful `READY` transaction. Add a real repository regression proving claim/renew/failure produce zero completion receipts, while successful readiness produces exactly one and a failed readiness transaction produces none. This also removes renewal's newly introduced user lock after job/media locks; `ready()` correctly takes that participant lock first.

### Minor — M1: The deepest accepted reply is immediately unreadable

Location: `/Volumes/SSK SSD/Kamilunavo/Projects/Sammlerraum-SourceRecovery-20261105/packages/domain/src/community/comment-service.ts:155` (parent acceptance), related visibility bound at line 56.

`visibleCommentTree` permits at most 32 ancestor edges and requires that traversal to reach a root. Creation applies this test to the parent, then adds another edge without checking the resulting depth. A visible comment at depth 32 is therefore accepted as a reply target, but its newly inserted child at depth 33 fails the same visibility predicate on every list. Creation returns success, the UI appends the body, and source notifications are emitted; a reload then loses the comment from the thread.

Causal reproduction: through `createComment`, create one root and a chain of 32 replies; reply once more to the last visible comment. That final request succeeds, but listing the target (across all pages) omits the returned ID. This uses ordinary supported calls within the daily quota and needs no malformed database rows.

Correction: reject a reply whose resulting depth exceeds the supported traversal limit, before insertion and notification creation. A boundary regression should prove the deepest accepted reply remains readable and the next request fails without a comment or notification. Keep the bounded/cycle-safe read behavior.

### Minor — M2: An owner's hide action has no usable restore path in the UI

Location: `/Volumes/SSK SSD/Kamilunavo/Projects/Sammlerraum-SourceRecovery-20261105/apps/web/src/components/community/comment-thread.tsx:103` (hide followed by reload), with the sole owner action at line 208.

The owner action always sends `{ hidden: true }`, then reloads the public-only thread. That read excludes owner-hidden comments, including for the actual owner. No hidden-comment management view or `{ hidden: false }` UI action exists, so after an accidental hide the owner cannot restore the comment through the application, even though `moderateOwnContentComment` deliberately supports restoration. Platform restore only clears the independent platform hide and cannot undo this owner flag.

Causal reproduction: as the content owner, open an item's comments, hide a visible comment, and reload. The comment and its controls are gone; neither the thread nor the moderation workspace offers an owner-unhide operation. This is a UI completeness gap in the implemented owner moderation workflow, not a request for a new platform moderation capability.

Correction: expose an owner-authorized way to find and restore owner-hidden comments, without weakening public reads or platform-hide/author-delete rules. At minimum, provide an undo for the current action; persistent owner management is needed to recover after reload. Validate hide/reload/restore and continued suppression of independently deleted or platform-hidden content.

## Coverage and assessment

- **Task 1:** Reviewed private wishlist contracts/service, exact prospective money handling, canonical duplicate pairs, current ownership fences, transfer retirement and erasure constraints, and representative native tests. Separate exemplars are preserved and private reads do not inherit membership permissions.
- **Task 2:** Reviewed follow/favorite reads and writes, quotas, idempotence, C-ordered participant locking, effective public ancestor checks, and block-trigger relationship retirement. No additional concrete gap found.
- **Task 3:** Reviewed comment/reply visibility, posting switches, author deletion, owner hiding, bidirectional blocks, report deduplication/privacy, and retained reported bodies. M1 and M2 apply.
- **Task 4:** Reviewed authoritative application-role checks, reported hidden-comment review, immutable separate moderation events, reason requirements, resolution idempotence, and independent hide flags. Collection roles do not grant platform authority.
- **Task 5:** Reviewed typed server-only event production, recipient/event-key deduplication, own-only routes/read state, category/channel preferences, security-email override, and current-target/block redaction. Source mutations use same-transaction receipts; the export renewal exception is I1.
- **Task 6:** Reviewed durable dispatch, claim/begin-send rechecks, verified recipients and opt-outs, cancellation, bounded proven-nonacceptance retry, acknowledgement-only retries, SMTP TLS/header handling, worker wiring and default-off configuration. Ambiguous `UNKNOWN` deliveries intentionally do not resend automatically; this is consistent with the explicit SMTP ruling, not a defect.
- **Task 7:** Reviewed feed and responsive UI source, pagination/control paths, DE/EN integration, private API session/origin/body/query boundaries, and representative browser-test scenarios. Reviewer did not run browsers or perform independent pixel verification. M2 is the concrete UI gap found.
- **Task 8:** Reviewed the real public routes, strict decoded `@handle` resolution, stable UUID collection slugs, current owner/ancestor privacy, public projections, notification deep links, import/export hooks, and dashboard query/contract additions. Full-own wishlist/duplicate/item milestone bases are explicit; no invented completion rewards are introduced. I1 applies to the export hook.

The review accepts the documented adaptations: Next dynamic public-handle segments instead of `@` parallel-slot directories; stable collection UUID slugs; informational milestones; forward-only frozen migrations; native push and future billing hooks outside this phase; providers remaining off. Those are not findings.

## Verification evidence and limits

Root reports final candidate gates of 1,547 native tests in 139 files with zero skips (211.79 seconds), 1,631 regular tests with 1,032 explicitly native-disabled cases, 218 compiled browser cases (4.8 minutes), passing types/lint and worker/web production builds, two empty guarded database schema diffs, 18 unchanged frozen migrations, and a passing 69-test closing cohort (9.30 seconds). These are supplied implementation evidence, not independently rerun reviewer results, and overlapping cohorts must not be summed. Task reports also preserve earlier failures and corrections. The premature-renewal path and reply-depth boundary are not established by those aggregate totals; the inspected tests do not assert the required negative behavior.

Coverage gaps: no independent runtime execution, live SMTP/provider validation, production data inspection, or full raw-log/EXPLAIN audit. Review inspected the scoped committed implementation and representative tests, not every generated proof artifact. No production-safety conclusion beyond this source/evidence review is claimed.

**Verdict: With fixes.** I1 must be corrected before Phase10 acceptance. M1 and M2 are concrete lower-severity edge/workflow defects for the root's consolidated disposition. No Critical issue found and no external dependency blocks the correction pass. This is the original single-review verdict; no second review loop is requested.
