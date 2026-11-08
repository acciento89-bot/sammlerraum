# Phase09 Task6 — conflict-aware restoration

## Implemented behavior

Current Owner can preview a supported original event and explicitly restore one changed field. Confirmation binds the observed current timestamp and immutable bigint audit sequence. The transaction verifies actual current value and rejects any later same-field transition, including a change away and back; unrelated newer fields stay intact. Restoration appends a new original-actor event, never rewrites previous history. Owner transfer changes who may inspect/restore; old Owner/Admin is denied.

Supported facts: item title/quantity/node/trade/acquisition/visibility, collection name/visibility, current-category active condition option, same-owner physical location, unarchive and item/collection trash restoration. Location rollback appends a true physical movement receipt. Quantity cannot invalidate a new single-item grading. Restoring archive/trash does not reactivate a previous sales offer. Digest-only private text, financial provenance, permissions and membership are deliberately unsupported.

The private GET/POST event restore route requires a fresh server session, same-origin mutation, strict bounded duplicate-key-safe JSON and no extra URL/body scope. Expected current-state conflicts return409; foreign resources404. Native Request/Response integration uses the controlled server-session port; actual cookie UI proof followsTask7.

## Durable capability retirement

New additive070000 creates immutable ShareRevocation records; collection trash permanently retires all its prior grants, item trash retires direct-item grants, and pending collection invitations retire on trash and historical restore. Restoration never revives these capabilities. Marker FK KEY SHARE remains compatible with guest Share SHARE, avoiding a Share/Item lock inversion. Native paused guest reads and actual trash/restore verify both stable revocation and absence of deadlock. Arbitrary marker mutation/deletion is rejected; real parent erasure remains possible.

## Verification so far

- Genuine initial implementation/API failures retained.
- Physical history RED expected3/actual2 fixed in the same restoration transaction.
-65audit/domain/HTTP tests pass, including17native restoration cases,12native audit cases,22core integration cases,3native HTTP cases and11boundary cases.
- Separate existing share regression19PASS at the checkpoint.
- Root/web strict TypeScript pass.
- Eleven previous migration hashes unchanged;070000 frozen and applied to both guarded test DBs, both actual schema diffs empty.
- Full regression/build/browser results are appended after their actual completion.

No source merge, application deployment, live providers/mail/payments/customer data or other apps/stores changed. This task remains implementation work pending the independent whole-phase review afterTask7.

## Closing gates

Source f755430:1435native-enabled testsPASS/118files/0skip185.94s;1553regular testsPASS/956explicitnative-disabled cases16.24s (overlapping selections). Root/web strict types, whole workspace lint and full production buildPASS. Seven compiled DE/EN desktop/mobile sharing/invitation cookie journeysPASS8.0s. Both guarded schema diffs empty; twelve frozen forward migrations. No physical device or production-capacity claim. Whole-phase review remains pending afterTask7.
