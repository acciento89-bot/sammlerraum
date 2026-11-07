# Phase10 Task8 implemented; whole-phase review pending

BASE cb150ee140c47d65d68294d48c8a0ba53d7308ec. Root executes the frozen Task8 inline. No task completion or independent acceptance yet.

## Implemented
- Public DE/EN profile, collection and item pages with strict @handle routes. Next uses a regular dynamic segment because @ directories denote parallel slots. The built router supplies %40: a real failed compiled request was reproduced by a RED native encoded-prefix test, followed by single decoding + strict validation GREEN. Double encoding/invalid escapes remain rejected.
- Immutable collection-<UUID> slugs, stable across renames and collision-free even for duplicate names/transfers. No applied migration, existing collection writes or canonical money changed.
- Public queries explicitly select only profile display/bio and effectively PUBLIC collection/item fields. Private/unlisted/deleted targets, inaccessible ancestors, mismatched owners and wrong URL parents fail closed. Public lists use bounded keyset pages; no private totals/login email/notes/documents/money.
- Actual follow/favorite/comment/reply mutations create notification receipts in the same transaction, after the source's ordered participant locks. Stable occurrence IDs deduplicate retries; genuine refollows get a new event. Source rollback also removes its receipt. Self/community-block suppression remains central.
- Generic moderation state notices are atomic with private append-only decisions. Author/reporter participants are locked before parent/comment/report locks. Reasons and comment bodies never enter notices. Import completion and worker Export READY produce stable job-key notices atomically; provider I/O remains outside these transactions.
- Current public deep links for notices; import/export references require the actual own current usable job and artifact. Expired/unavailable references are suppressed; no source file name is copied into a notification.
- One fixed dashboard progress query adds real private open/fulfilled wish counts, current owned live explicit duplicate-pair counts, item thresholds and completed nonempty-wishlist candidates. Selection bases are explicit and independent of the current text filter. No invented collection-completion metric, ranking, billing activation or auto-award.

## Observed evidence so far
- RED→GREEN source events: three missing notification assertions failed initially; 22 affected native social/event tests passed after wiring.
- Public read service: 3 native privacy/rename/ancestry tests passed; encoded-prefix RED→GREEN separately retained.
- Completion/dashboard/moderation source tests: 57 native checks passed after real assertion failures; one new fixed query raises config-inclusive calls from15/17 to17/19. Actual query-plan capture now includes community_progress.
- Full regular suite: 1631 PASS, 1032 explicitly native-disabled, 240 files, 61.90s. Counts overlap native suites and are not summed.
- First broad native:1545 PASS/2 failed,139files213.31s. Both failures are the new expiry fixture attempting to update an immutable ExportJob expiration. No production guard weakened. Corrected historical fixture includes immutable source receipt; focused10 export tests now PASS1.43s. Corrected historical expiry fixture includes the actual immutable source manifest/hash/as-of receipt, instead of fabricating an invalid READY row. Final broad clean run pending.
- Initial4 compiled DE/EN desktop/mobile profile journeys PASS6.5s after encoded-prefix correction, including actual anonymous navigation and private404s. Actual screenshots then exposed wrong hero-child grid composition and missing shared shell/nav classes: before images retained, root corrected actual markup and added heading-clipping assertions. Current corrected desktop/mobile images visually inspected: shared shell/nav and wrapped hero are now clean. Final218-case compiled browser regression PASS4.8m, including public-profile, community cookie/UI, collaboration/share, inventory and the full search-dashboard cohort. Heading clipping guards pass. Original0-unread cookie assertion was correctly updated to2 and exact favorite/follow types now that source events are connected. Final broad native clean gate is active.
-18 frozen migration hashes unchanged. No new schema needed inTask8.

## Remaining gate
Final images and all affected compiled browsers, exact broad native clean run, source/types/lint/build confirmation, historical artifact retention, Task8 commit/closing record and ONE independent whole-Phase10 review. No main merge, deployment, real email/provider/payment actions, customer changes, devices/stores or automations.

Final local gates:1547native PASS/139files/0skip211.79s;1631regular PASS/1032explicit native-disabled;218compiled browser PASS4.8m; final root types/lint, worker/web production builds PASS. Both actual guarded database schema diffs empty,18frozen migrations unchanged. Twelve fresh public page screenshots retained; old Phase08/09/Task7 images restored by exact original bytes with current regenerated variants separately retained. Original failed expiry fixture and0-unread witnesses remain in logs. Independent whole-phase review still pending.

Task8 source committed372334a6e59734f927e3a31aaa601befe32e244b. Closing69affected notification/dashboard/public-privacy tests PASS9.30s. Single fresh whole-Phase10 review dispatched read-only against1760cd2..372334a, root owns all runtime; no review verdict or independent credit claimed before returned report and consolidated correction.
