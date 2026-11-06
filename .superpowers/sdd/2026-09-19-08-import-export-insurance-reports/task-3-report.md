# Phase08 Task3 — root local acceptance

Base de2c264d10784e81b0a4a536a42d4302ef5ea11c. Whole candidate dc8d735e53145bbccbe8a49ba37f3b9acd0825df; reviewed-finding closure4da56a02a0958341af0af185b1155ea4ec178146; mechanical notice packaging9d9f207. Root sole source/runtime owner, existing isolated feature worktree only. No main application merge, deployment, provider, real source/inventory, purchase, mail or emulator.

## Implemented

Actual owner/revision-bound decision saving, target preparation tokens, full approval and cancellable background commit. Each source row explicitly selects CREATE, CREATE_SEPARATE, MERGE or SKIP according to its frozen preview. Invalid rows only SKIP. MERGE requires the exact current target snapshot and explicit mapped/nonblank field choices; other metadata survives. Multiple merges into one target are refused rather than guessed into a sum or overwrite sequence.

The existing item and identifier writers and M7 money authorities run inside the same actual transaction. Money replacement persists and rechecks its own target-bound REPLACE preview alongside the original NEW row preview. Historical UNKNOWN raw remains UNKNOWN, including same-raw replacement of previously interpreted money; canonical zero and maximum allowed raw values remain exact. Current identifier conflicts are rechecked across chunks; only the exact original identity of an own-created source duplicate is exempt. Source/approval/decision/receipt guards remain, with additive migrations.

At most10rows commit atomically with item/identifier/money writes, receipts and progress. Job+collection locks serialize concurrent deliveries. Retries validate durable receipts and whole membership before completed success, without recreating items. A real failing receipt trigger rolls back inventory and money in the same transaction. Permanent failures update FAILED only against the observed revision; transient write/failure-recording errors reject with controlled broker text.

## Verification and review

- Final complete native CI allowlist:854PASS in74files,0skip,138.25s. Includes19new actual commit cases.
- Final regular suite:1505PASS/725explicitnative-off,11.40s. Disabled cases are not claimed as executed native checks.
- Whole workspace types/lint/build passed on dc8d735; final shared-base types, changed domain/worker lint and worker build passed after4da56a0. Unchanged web production build remains attributed to the full run. Notice cmp passes, and Dockerfile now explicitly copies it; no local final Docker-image run is claimed.
- Both retained owned test databases migrated forward;22actual-built DE/EN desktop/mobile inventorybrowser cases passed,0skip,25.4s. No import UI was invented.
-24focusedPASS/0skip:19native,4runtime,1registry. Covers all actions,101rows across multiple transactions, concurrent duplicate workers, interrupted receipt rollback, stale/foreign targets, changed identifier on an earlier created item, unmapped defaults, full receipts, exact canonical/UNKNOWN monetary replacement and new money generations.

Independent whole14file review found twoP2s. Genuine native/runtime REDs reproduce them; root fixed both in one pass and ran the complete gates above. Original independentFAIL and root closure remain in task-3-review.md. RulingsT3.1–4 retain why/cost; no second independent final verdict is fabricated. One nonblocking known behavior remains: duplicate delivery of an already-FAILED approved job may consume the finite broker retry allowance, without reopening/writing inventory. Dispatcher policy is a Task7/Phase13 hardening obligation.

Root locally accepts Task3:44/91fulltasks, Phase08now3/7, nextTask4. Publication waits for both exact Task2 workflows42294953390/42294945841 on de2c264. Local Task4 may proceed under the same pipeline rule and must stop affected work on a real parent failure. No upload/API/UI, live deployment or complete Phase08 claim.

Publication dependency resolved: both exact de2c264workflows42294953390(PR)/42294945841(push) completedSUCCESS; full primary step metadata retained in logs/task-2-20261106-ci-success.json. Root may publish the accepted Task3-only commits; new exact Task3 head still needs both workflows.
