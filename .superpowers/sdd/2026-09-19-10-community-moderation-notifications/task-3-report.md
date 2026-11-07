# Phase10 Task3 — comments, personal blocks and private reports

Implementation base: `85c99123945a85bb894a1c153c870fd7639096ca`. Implementation currently under closing validation; not independently reviewed, merged or deployed.

## Behavior

- Public collection/item threads with optional replies; current visibility, every ancestor, and bidirectional block policy are enforced at read/write time. No private notes, login email, money or documents are returned.
- Actual content owners can disable new comments globally, per collection or per item and hide/unhide comments on their own content. Authors can delete their own comments. An owner cannot override a platform moderation hide or deleted state.
- Personal directional blocks disable interaction in either direction and retire follows/favorites atomically. Removing one's own block never removes the other user's block.
- Private user/comment reports retain category, reason, current status and canonical target snapshot. Open retries deduplicate, including differently cased spellings of one UUID. Moderation authority is never supplied by the client.
- Reported deleted comments retain text only for the pending review path. Actual account erasure deletes comment text, detaches surviving replies, and clears report foreign keys while preserving minimal report identifiers.
- Authenticated API uses fresh real sessions, same-origin mutations, strict payloads and no-store responses. The owner controls are distinct from platform moderation (Task4).

## Evidence already read

- Required missing implementation RED: task-3-red.log.
- HTTP missing producer RED: task-3-http-red.log.
- Actual UUID report alias RED: task-3-report-alias-red.log; canonical contract and database guard GREEN.
- Focused native and HTTP: 25 passed, zero skips (task-3-http-current-green.log).
- Root TypeScript gate found cross-package Zod union incompatibility; complete wire schema now exported by contracts. Final current-types.log is empty on successful exit.
- New additive migration100000 applied only to the two owned PostgreSQL17.11 test databases. Both schema diff checks empty. Previous14 migration bytes verified before apply; task-3-migration-frozen-hash.json freezes new bytes.

## Pending closure

Whole native selection PASS:1478/128files/zero skips196.87s (task-3-full-native.log). Regular suite PASS1579 with999 explicitly native-disabled cases; lint PASS. Recursive build completed package type gates and worker bundles, then correctly rejected optional array indices in the new browser fixture; corrected only the owned non-null fixture references. Web build rerun and compiled-cookie/browser regression remain in progress, followed by exact fixture retention, commit and task-done closing gate. Phase10 whole-phase review remains after all8 tasks.

## Closing verification

Initial compiled-cookie gate exposed a genuine empty DELETE stream rejection; native and pure regressions failed (2fail/7pass). `readBoundedBody(request,0)` now consumes an empty transport stream while rejecting actual bytes, without broadening any other payload bound. Focused26cases pass; current web production build passes. All54compiled browser cases pass in1.0m, including real comment creation/report/hide/author-delete, nonowner-denial, current disable policy, and own-only unblock. Raw initial build/browser failures preserved.

1478native/128files/0skip196.87s and1579regular/999explicitnative-disabled60.08s passed before the isolated transport fix; targeted26 and the compiled54 cover the final fix. Package/worker build succeeded; final web build succeeded after fixing the owned test fixture's optional indices. Historical PDF/PNG bytes restored individually from HEAD with fresh bytes retained and hashed. All15 recorded frozen migration receipts verified unchanged. No production or live provider actions.
