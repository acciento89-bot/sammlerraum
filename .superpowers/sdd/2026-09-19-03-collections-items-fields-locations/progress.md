# SDD ledger — plan: docs/superpowers/plans/2026-09-19-03-collections-items-fields-locations.md

Recovered from canonical GitHub ledger after runtime restart. Phase preflight and rulings were completed before Task1; canonical rulings remain in docs/superpowers/SAMMLERRAUM-V1-LEDGER.md.

Task 1: complete (hierarchy f1ef9fe, regression-fixed da33045, completion509c104, review clean, CI35528856401).
Task 2: complete (code62139df, completion92e9f70, review clean, CI35530315747).
Task 3: RED87b3e99 proven in CI35531276807/job106132190916; implementation312b53e1, formatterf5fea02. Fresh review spec PASS, quality five findings. Fix round1 in progress with original implementer p03_t03_implement; reviewer p03_t03_review. BASE92e9f70; reviewedHEADf5fea02.

Ruling: focused exact task commands already executed in CI with RED and GREEN evidence; remove redundant permanent focused and items CI steps while retaining full suite and real PostgreSQL invocation — satisfies requested checks without triplicate runs; cost if wrong: restore explicit CI steps.

User explicitly requested main ledger checkoff. Main58ca601 and feature3187384 have identical ledger blob2a2cb6f; 15 completed checkboxes, Task3 open. Synchronize canonical ledger on both branches after each future completion. Code remains feature branch only.

Open review findings: canonical tag row acquisition order and concurrent reversed-list PostgreSQL coverage; NUL validation and collision-proof identifier keys; rename exported ItemTag DTO; remove redundant CI runs; fixture cleanup protected from setup start.

Task 3: fix round 1/5 (5 addressed, 1 new ordering finding; commit897ebe6).
Task 3: fix round 2/5 (ordering finding addressed, 0 open; commit64768d5).
Task 3: complete (code64768d5, completion759af32, review clean, fullCI35532984136/job106136853293;154unit52integration15actualDB4browser allbuilds).
Mainledger67de51f and feature759af32 verified identical blobf8a392e7,16checkedtasks.
Task 4: in progress (BASE759af32; fresh implementer p03_t04_implement; brief task-4-brief.md).

Task 4: fix round 1/5 (2 addressed,0open; code8c3aac8).
Task 4: complete (implementation8de56cd, tested8c3aac8, completionf255436; reviewclean, fullCI35534527758/job106141041269;189unit88integration16actualDB4browser allbuilds).
Mainledger095508a and featuref255436 verified identical blobff3ab572,17checkedtasks. Approvedreport checkpointc20b7fc.
Task 5: in progress (BASEf255436; freshimplementer p03_t05_implement; brief task-5-brief.md).

Task 5: fix round1/5 (3addressed,0open; code971cec1).
Task 5: complete (implementatione3e463e, tested971cec1, completiona3ccc67; reviewclean; fullCI35536014090/job106145057618,203unit105integration19actualDB4browser allbuilds).
Mainledgerda78cef and featurea3ccc67 verified identical blob6b3a7e14,18checkedtasks. Approvedreportcheckpointdd30a011.
Ruling: Task6 missingCRUDdomain interfaces receive minimumreads/updates/reversibledeletedAt support, no harddelete; normal/publicreads exclude deletedresources and ancestors; Phase09 audit/restore reusesthisstate. Canonicalledger recordswhy/cost.
Task 6: in progress (BASEa3ccc67; freshimplementer p03_t06_implement, exactbrief task-6-brief.md).

Task 6: candidate d744045 saved on GitHub; initial full CI35537471423/job106148958190 passed (213 unit,106 integration including20 actual DB,4 browser,all builds). Fresh reviewer p03_t06_review: SPEC/QUALITY FAIL with two P2 findings (Decimal canonical roundtrip; NUL request validation). Fix round1/5 dispatched to original implementer p03_t06_implement. No task checkoff until fixes reviewed and final CI passes. Main ledger verified18/91,blob6b3a7e14.
