# New CI gate: stale ItemForm snapshot after archive

Base `fdd1753db409ac3a65386df7094e263505a15209`. This is a newly observed verification defect in the existing core flow; the Phase05 whole-phase review and its ONE consolidated fix wave/scoped rereview already closed I1/I2/M1–M5. Do not reopen that review or deferred M6/M7. Root owns final exact-source CI, phase closure and main-ledger synchronization. Canonical remains34/91, Phase05 integration pending, Phase06 has no implementation GO.

## Actual evidence

Primary exact-fdd CI39085078816/job117549815530: all60catalog and4auth passed, but mobileEN existing collections-items.spec.ts381 saw archived-success text while Save remained enabled5s;15othercore passed. Exact truncated tail retained `logs/phase-ci-fdd1753-primary-failure.log`. Parallel39085075973/job117549807435 fully passed including all browser steps, both Docker images/nativeSharp; retained `logs/phase-ci-fdd1753-secondary-success.log` plus complete job steps JSON. That pass did not erase the primary failure.

Diagnosis used delayed REAL authenticated responses, not mocked persistence/authority. A post-save item GET captured archivedAt:null after saving had already settled. Archive returned200, fresh API and DB showed archivedAt, and UI Save became disabled. Delivering the older GET re-enabled Save while archived-success remained visible; backend stayed archived. Reproduced DE desktop and EN mobile,2 invariant failures. Control delayed a successful tags-PUT acknowledgement after the heading changed: archive persisted and UI remained disabled after release,2passed. Thus merely waiting for save completion is insufficient. Raw `logs/phase-ci-archive-diagnosis-01.log` retained; temporary control-probe code need not remain as diagnostic noise.

## Approved correction and costs

Ruling: acknowledged successful main-item writes invalidate earlier initialization snapshots; guard item-scoped core/metadata, stale errors and finalization. Preserve coherent same-item metadata through an explicit fresh actor-bound GET when necessary. Why: older reads cannot reverse acknowledged lifecycle state. Cost: small read-generation bookkeeping and possibly a fresh GET per acknowledged write. No automatic write retry, generic cache framework, schema/service/permission change or speculative broad serialization.

The newly introduced refresh GET can itself fail. Ruling: retain the known created ID/form and explicitly say changes were saved but details could not refresh; explicit user retry must PATCH the same ID. An acknowledged archive remains archived/read-only despite read failure. Superseded reads cannot report a current failure. Cost: small explicit read-result boundary and two localized DE/EN messages. This follows the established grading acknowledgement/refresh distinction, without changing its code.

## Verification scope

Permanent delayed-old-GET regression covers DE/EN × desktop/mobile, original core assertions retained. Named new refresh-failure journey covers acknowledged create→failed GET→explicit PATCH retry same ID→archive→failed GET in DE desktop/EN mobile, checking actual HTTP, exactly1POST/1PATCH, one persisted item and archived read-only truth. Preserve actual RED/setup-error chronology honestly.

Appropriate local gate: focused6 regressions, web production build/types/lint, one combined actual production auth/core/catalog matrix. No unchanged unit/database suite reruns. If the unchanged auth flow fails before ItemForm with ECONNRESET, retain the full failed result and one focused exact-case rerun; do not label the whole matrix clean from the retry. New exact-source remote CI remains mandatory. No timeout increase, skip, `.first()` workaround, fake successful authority or relaxed privacy/lifecycle assertion.

Review only this new fix range, the implementer's CI archive appendix in `phase-fix-report.md`, and `logs/phase-ci-archive-*`. Inspect changed ItemForm consumers, stale completion/cancellation/error behavior and coherent metadata/known-ID acknowledgement. No broad unchanged branch audit; no suite rerun unless a named doubt has no evidence. Reviewer is read-only except its report, no children or source/index/HEAD/DB mutations. Root-owned contexts/progress/CI logs and Phase06 preparation may remain dirty and must be preserved.
