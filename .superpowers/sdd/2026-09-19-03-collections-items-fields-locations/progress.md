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
