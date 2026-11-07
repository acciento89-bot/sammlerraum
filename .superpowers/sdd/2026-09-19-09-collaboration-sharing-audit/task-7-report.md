# Phase09 Task7 — collaboration management candidate

Status: ACTIVE. Whole-phase independent review, final current-source gates and source/evidence publication remain pending. This report distinguishes implemented paths from uncompleted validation.

## Real implemented views

- Current-member directory and names, actual server roles, role changes and nonowner self-removal. Owner-only transfer requires explicit private-data confirmation, with current collaboration revision and existing native transfer guards. Admin cannot promote to Admin or manage another Admin. Viewer sees no management form.
- Recipient-bound invitation issuance, expiry/revocation, explicit acceptance and a bounded same-locale authentication return. No SMTP delivery claim. New login/register callbacks preserve only an exact valid invitation route, never arbitrary external redirects. Expired, revoked, unverified and wrong-recipient errors are distinct.
- Owner sharing management: default-safe field checkboxes, selected-document IDs, node/item/collection scope, named initial target suggestions with explicit truncation and manual-ID fallback, registered recipient or hash-only bearer link, expiry and optional PIN. Full public link is returned only at creation. Existing list is bounded/cursor-paged and marker-aware; no hashes/PIN secrets/storage keys appear. Actual anonymous access is invalidated immediately by a UI revocation.
- Owner audit overview, including retained trash, plus resource history/cursors, original actor/source and stored before/after details. Supported field restoration explicitly compares current/previous values, sends observed timestamp/sequence and visibly rejects conflict without overwriting newer changes. Old capabilities are never revived.
- Shared collection discovery and a current-membership metadata workspace. Viewer reads only selected metadata; actual Editor/Admin creates/updates Owner inventory under their own identity. Ownership is derived separately from the current locked parent, not substituted as the actor. Owner private notes, raw amounts, currency, generations and evidence stay unchanged/excluded. Owner's full/private view stays separate.

## Authoring security and concurrency

Both the HTTP contract and internal shared-write seam reject private/monetary/disposal field injection. Membership is checked after the collection lock, not only in an initial lookup. A native paused provisional Editor lookup followed by real membership removal rejects the pending write. Scope is rechecked against the actual locked item's collection. Native new-quantity grading guards and ordinary item lifecycle logic remain in the reused writer.

Collaborative UI updates require both actual updatedAt and latest immutable item audit sequence; old inventory without history uses a nullable sequence. This prevents stale overwrite and timestamp-resolution ABA. Newer-edit RED→GREEN, actual raw money/generation preservation, real Editor actor receipts, denied Viewer writes and strict HTTP actor/owner injection tests are retained.

## Actual current evidence

- Initial missing UI heading/module/API/helper failures and genuine unsafe shared-writer/stale-edit failures retained; no fabricated RED claims.
- Twelve built management/invitation/share/audit cases passed16.7s after correcting a test-only ambiguity with Next's separate route announcer. App error behavior was unchanged.
- Expanded16 actual cookie-browser cases passed22.1s across DE/EN desktop/mobile, including shared collection discovery, actual Editor creation/update, demotion to read-only and membership removal. Full-page screenshots scroll the actual page to top; no image fabrication. Earlier cramped flex-row screenshots retained separately and the actual layout corrected.
- Focused native Editor/current-role/privacy/HTTP cohorts pass (overlap; not summed). Root and web strict types, current web production build pass.
- Final broad native/regular/types/lint/full production build/browser pipeline is running after the final role-aware navigation polish. Its actual results will be appended.
- Previous exactTask6 source/evidence3806d4c CI42357381299 verifiedSUCCESS. No new-head CI claim.

## Before Task7 completion

Check actual Admin collection-edit policy coverage in the shared workspace; the legacy Owner-only private DAL must not be relabelled as member-aware. Finish any necessary real-actor path and its focused/browser validation. Finish broad current-source gates, preserve generated PDF fixtures without changing prior evidence, commit and close this task, then request the single fresh whole-Phase09 read-only review.

Scope remains source/tests and existing DraftPR1. No main merge/deployment, production providers/mail/payments/customer data, other apps/stores, devices or stopped automations.

## Admin path and legacy fixture closure

Current Admin now edits collection name/visibility and creates/updates hierarchy nodes under their own actor using the original writer and fresh post-lock authority. Owner identity is a separate DB fact. Node scope and original cycle guards stay active; Owner-only deletion stays independent. UI exposes these controls only for actual Owner/Admin. Parent timestamp plus latest collection-anchor sequence binds all three HTTP mutation forms; strict original-actor services and stale/withdrawal tests pass. Focused18native cases and root/web typesPASS; current web production buildPASS. The final49-case compiled browser cohort is running.

The broad pre-Admin checkpoint passed1444native/121files/0skip192.20s,1559regular/965native-disabled16.67s, whole production build/types/lint. Its old collector browser add-on was misconfigured with monetary authoring OFF and interrupted; not accepted as a passing suite. Correct test flags are confined to the guarded local browser DB. One existing receipt test needed real response capture before client navigation, retaining its original refresh/error/no-duplicate assertions. Scoped2casesPASS5.7s and complete old22casesPASS25.3s. Its old global rate-limit reset was replaced by exact owned synthetic credential fixtures. Final actual-current-source results follow after execution.

## Current final gates — source68e09b7

- Entire domain plus every non-domain native CI selection:1446PASS/122files/0skip187.07s.
- Regular1559PASS/967explicit native-disabled16.54s; overlapping selections, not additive test counts.
- Strict root/web types, whole workspace lint and full production buildPASS.
- Actual compiled49cookie/browser casesPASS56.0s, covering20new collaboration UI,7previous sharing/invitation and22Owner collector cases.
- Committed-source plan-closing20new UI casesPASS24.9s.
- Both retained guarded DB schema diffs empty;12frozen migration hashes unchanged.
- Prior Phase08 PDF fixture bytes restored exactly; actual regenerated bytes/hashes retained under Task7 reports.

One fresh whole-Phase09 read-only review is active against82a1f0f..68e09b7. Source implementation is complete, independent acceptance pending; master reviewed48/91 unchanged. No main merge/deploy or provider activation. A diagnostic old-browser command lacking the required authoring test flag was interrupted, and another selector/capture failure was test-only; neither is represented as a passing suite.
