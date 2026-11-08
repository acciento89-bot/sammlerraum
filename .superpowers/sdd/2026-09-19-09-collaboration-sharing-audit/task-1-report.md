# Task1 guarded collection membership and ownership transfer — current candidate

Status: Task1 implementation verified and plan-closing test recorded; independent whole-Phase09 review pending. Master reviewed count remains48/91. Approved Phase09 Task1/spec§7; local source/test/draftPR only. Root is sole implementer and local runtime owner.

## Behavior

- Owner derives exclusively from the collection's nonnull owner FK; persisted members are Admin/Editor/Viewer. Strict IDs, verified recipients, parent revision CAS, actual current DB roles and role hierarchy; outsiders receive no collection/member data. Only Owner transfers; nonowner self-removal permitted, Owner must transfer first.
- Immutable current-transaction transfer receipts and deferred canonical-owner checks make the old→new owner transition atomic; old owner becomes Admin, recipient member row is removed so no second owner role exists.
- Both users locked in stable order before collection/items, matching hierarchy edits and account erasure. Transfer-only READ COMMITTED sees child writes that settled while waiting for its locks; general search/membership isolation unchanged. Locked-item owner predicates prevent former-owner tag/identifier writes after waiting.
- Insurance values/revision identity, immutable manual valuation history and real authors, physical grading certificates/quantity/metadata, personal tags and actual private media originals/variants/links are preserved. Existing recipient tags reused without changing spelling; outside collections untouched. Actual duplicate certificate races yield a conflict and full rollback.
- Only needed current/history location ancestors are cloned into the recipient namespace, with fresh IDs/QR tokens; old shared locations remain unchanged. Real move timestamps/authors retained; later original-author erasure redacts identity rather than assigning a fake recipient author.
- Active imports block transfer. Terminal private staging jobs are retired without rewriting their source identity; immutable known-source manifests remain for the actual I/O-locked cleanup worker. No storage I/O under the SQL transaction. This ephemeral-history retirement must be explained in the eventual transfer UI.
- Purchase/custom monetary facts, original units, receipts, generations and authors remain byte/field exact. Internal copy graphs transfer intact; incoming/outgoing external collection provenance blocks transfer. Native COPY endpoint locks fence late inserts and deferred owner coherence prevents raw SQL bypass; existing financial meaning/evidence/sequence rules retained.

## Explicit bounds / deliberate blocked cases

1000 items (including soft-deleted),1000 media assets,1000 copied locations,10000 location history rows,10000 tag links,20 staging jobs,200 total members. Bounded transaction/statement/lock budgets. Oversized operations fail without partial mutation. Files shared with another collection/profile/export/report or processing/cleanup/I/O activity remain controlled blocked cases; this implementation does not silently reassign those private dependencies or claim a shared-file copying workflow.

## Actual evidence to date

- All focused RED/GREEN and fixture diagnostic logs retained in this task workspace. Initial missing-module RED, malformed Unicode, immutable receipt completion, insurance, valuation authorship, both tag/identifier interleavings, private tag copying, grading/duplicate rollback, actual PDF bytes, actual PNG/WebP variants, media advisory locking, location history/erasure, terminal source cleanup, incoming/outgoing money graphs and late COPY/certificate interleavings.
- Latest isolated focused membership34 + existing money store36 =70PASS. Includes raw SQL bypass rejected at commit; financial raw bits/units and total4250 minor units preserved over10 split units.
- Current TypeScript root check and workspace lint PASS. Both retained test DBs applied seven frozen additive migrations030000–036000; no reset/dev migration, prior migration rewrite or production changes.
- Full native87-file suite currently running; whole current regular/build/browser/schema validation not yet claimed. No independent whole-Phase09 review yet (scheduled at plan end per inline skill).

## Completed broad candidate validation

- Full current native CI allowlist:87/87files,982PASS,0skips,163.05s.
- Full regular:1532PASS,852explicit native-disabled skips,127passed/73skipped files,14.63s. Skips are not counted as passes.
- Root TypeScript and workspace lint PASS; complete production workspace build PASS.
- Actual built-browser existing collection/item and protected location-label flows:24PASS in29.4s, one worker, desktop Chromium and Pixel7 emulation, separate guarded browser DB. No physical-device or new collaboration UI claim.
- Relevant new browser UI belongs to later Task7, not this domain foundation. Both retained native/browser databases have the seven frozen forward migrations. Final schema diff/focused plan-closing policy command pending below; task will be recorded only after success.

Final actual schema diff empty. The task-done command passed59membership/policy tests at b3bbd78 and recorded82a1f0f..b3bbd78 in progress.md. No extra independent review or remote CI success claimed.
