# SDD ledger — plan: docs/superpowers/plans/2026-09-19-03-collections-items-fields-locations.md

Recovered 2026-09-27 from remote feature branch 212a083 and checkpoint reports. Canonical ledger verifies Tasks 1–6 complete. Task 7 implementation exists; review fix round 1 is incomplete, not a new implementation task.

Task 1: complete (canonical ledger evidence)
Task 2: complete (canonical ledger evidence)
Task 3: complete (canonical ledger evidence)
Task 4: complete (canonical ledger evidence)
Task 5: complete (canonical ledger evidence)
Task 6: complete (3dcc973, review and CI clean)
Task 7: fix round 1/5 resumed; 9 findings in task-7-review.md, scalar fixes committed, browser fixes still pending. CI 35545763096 fails two TypeScript errors before browser tests.

## Remaining-plan preflight
| Task/interface | Producer and consumer | Finding |
|---|---|---|
| 7 internally | UI flows consume existing owner APIs, tests cover desktop/mobile | Preserve canonical values, private data, and asynchronous form state; existing nine-finding review is active gate. |
| 8 internally | Label service resolves token, authenticated route exposes authorized view | Token must not grant access; printable names only. |
| 7 / 8 locations | Task 7 creates/assigns locations; Task 8 prints stable label token | Reuse existing owned location model/API; no new public metadata access. |
| 5 / 8 token | Existing cryptographic stable token consumed by QR label | Do not rotate or regenerate token merely to print. |
| 6 / 7 API | Existing thin authorized routes consumed by UI | Keep authoritative policy/privacy boundary on server. |

Ruling: resume the existing dedicated feature-branch checkout as the isolated task workspace — preserves the approved branch and leaves main implementation untouched — cost if wrong: reversible checkout relocation only.

Task 7: complete (remote source ec594525, CI36313332028 success; scoped reviews clean, 0 open findings). Next Task8.

Task 8: implemented (98b832d..dd972b6; remote e6ac0a8); task review and translation scoped rereview PASS. Completion awaits final integration correction and fresh CI.
Phase03 final review: one Important R1 — split portion omits location/identifiers/tags/custom values; consolidated fix dispatched to phase03_final_fixes from dd972b6.
CI candidate e6ac0a8: push 36314581896 exposed profile pre-hydration native GET; PR 36314584251 reached labels and failed dev cache-header assertion. Production label validation and profile hydration correction included in consolidated fix.
Phase03 final review: minor (deferred) M1 — enabled blank INTEGER converts to zero; nonblocking validation/UX correction to prioritize in later item-form work.
Phase03 final review: minor (deferred) M2 — duplicate hierarchy leaf labels lack ancestry context; nonblocking selector usability correction to prioritize in later hierarchy UI work.

Phase03 final fix wave: local7936d58 / remote992fac8d; exact tree c2976704. Targeted10 passed/6 DB skips, workspace TS/format clean. Fresh CI and scoped final rereview pending.

Phase03 scoped final rereview: R1 addressed; R2 new fixture teardown violates existing RESTRICT-history contract.
Ruling: correct R2 with the established fixture-scoped history deletion before owner deletion and verify in normal CI — required to complete the authorized database gate, with no production/schema change or new broad fix wave — cost if wrong: only this fixture's isolated test records can be removed. M1/M2 stay deferred.

R2 teardown corrected in aaa3252 / remote dcf4ec2; controller inspected exact one-line fixture-scoped diff. CI36315633315 real database suite passes (including split metadata and rollback); production label no-store assertions pass. Label browser tests now reveal unset locale preference in fixture at line134; Task8 implementer resumed for narrow setup correction. Production split review remains approved.

Task8 locale fixture: e6c9e0c / remote3a6fda65; explicit locale selection, cookie precedence and anonymous Accept-Language. Narrow independent rereview PASS, all privacy assertions retained; new CI pending.

Task8 production locale follow-up: CI36315959950 proves initial cookie setup alone insufficient. Proxy prefetch reproduction RED showed silent language-cookie overwrite; 3aeca0e / remoteed8ef1a prevents prefetch mutation and disables language-link prefetch. Focused3/3 GREEN, web lint/typecheck pass, narrow independent review PASS. FreshCI pending.

CI36316300580: production QR desktop/mobile now PASS; auth profile hydration regression and save passed, later reauthentication failed. Investigating cross-suite database rate-limit fixture leakage from reordered label suite; production limits remain unchanged.

Task8 final isolation correction:2a55c7e / remoted6a1a5e; narrow reviewPASS, fullCI36316664397SUCCESS.
Task 8: complete (98b832d..d6a1a5e, task reviews clean; phase R1 addressed, fixture R2 corrected and DB verified; two nonblocking UX follow-ups documented).
Phase03: complete8/8. FullCI240unit/static,109integration/22DB,22browser journeys,allbuildgatesPASS. NextPhase04Task1.
