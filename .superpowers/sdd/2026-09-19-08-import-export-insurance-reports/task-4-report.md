# Phase08 Task4 — private CSV/XLSX export producer

Base task-start424be35a79ea8a586e7d395ae4614284a86cb34b; intervening Task3 evidence-only publicationd1a9016d5c321325350a88ac40fad39c665f9677 did not change the application base. Whole reviewed Task4 candidate356e94e29e84a44568314a6a8ee0a8ae8ccefdcc includes captured-source checkpointdb9dceb. Mechanical reviewed index-declaration closurecfa24a6 preserves both exercised migrations unchanged. Root sole source/runtime owner; no production/provider/real data/deployment/main application merge.

## Result

Actual validated owned ALL/COLLECTION/SUBTREE/SEARCH intent, durable dispatcher and cancellable registered export worker. Complete same-bounded-RR source capture reuses real selection and M7 monetary authorities; full-set count/coverage is checked before materializing, not guessed from a search page. Exact monetary raw values and unknown meaning survive. Explicit interpreted mode requires trusted server capability. The frozen source includes core metadata/all bounded identifiers and as-of; notes/location only after explicit opt-in; no document bytes/policy references/arbitrary item serialization.

Real CSV and XLSX bytes are stored as owned DOCUMENT MediaAssets. Every attempt key is reserved first; retry source stays immutable. Token/lease/current-asset fences, actual shared storage lock, nonblocking busy-lock retry, cancellation settlement, final current-source/owner validation and atomic checksum/size/READY publication prevent partial/stale artifacts. Exhausted and permanent over-limit cases close; transient storage/queue failures retain durable retry intent. Normal asset/account deletion cascades the associated job/source.

Named CSV profile uses UTF8 BOM, quoting/newlines and exactly one explicit transport apostrophe per data cell, plus schema/encoding markers. Generic import never silently strips it. XLSX writes literal cells with bounded ZIP32, fixed OOXML parts and ST_Xstring escaping; parser correction decodes once and keeps existing decoded cell/row limits. No added serializer dependency. This does not claim safety after arbitrary third-party spreadsheet edits/re-save or actual Excel/LibreOffice UI validation.

## Actual verification so far

- Full CI native allowlist76files:871PASS,0skip,147.66s.
- Whole regular suite:1523PASS;742native-disabled cases explicitly skipped in that run, not claimed as executed there;11.87s.
- Whole workspace typecheck/lint/build PASS on356e94e. Schema-only closurecfa24a6 separately passed Prisma validation and actual existing test-database index comparison; it does not change generated client query behavior.
- Both retained owned test databases migrated successfully through the two additive Task4 migrations.
- Focused57PASS, then3additional parser boundary casesPASS:17real export DB/lifecycle cases,11serializer cases,23reader cases,2dispatcher cases,6lifecycle cases,1actual production-registration test across the targeted runs. The full suites above include all final cases.
- Independent whole review found one P2 missing Prisma index declaration, fixed once. Original verdict and root closure retained; no second independent final PASS is fabricated.
- Genuine source bug RED→GREEN: multi-row source capture sorted metadata independently of M7 rows; corrected by explicit captured-ID order. Permanent-limit retry and oversized file-cell cases were also genuine REDs and fixed. Busy asset lock now retries instead of waiting indefinitely. Earlier test-harness mistakes (lock wait flag, stale ungenerated Prisma delegate, expected invalid-string error code) are retained as such, not inflated into product defects.

Final22actual-built DE/EN desktop/mobile inventory browser casesPASS,0skip,25.6s. Final task-done28casesPASS,0skip. Root locally accepts Task4:45/91, Phase08fourofseven, nextTask5. Exact published-head CI remains a separate dependency gate; local acceptance is not deployment.

## Remaining integration boundary

Task7 must deliver actual authenticated upload/approval/export/download/status UI and enforce live scope/privacy/expiry on delivery, plus source/artifact expiry. Until then this is an internal producer, not a usable public export endpoint. Insurance records and PDF reports remain Tasks5/6. Existing private-document upload MIME restrictions are unchanged. Wishlist/collaboration models do not exist and were not fabricated. Local generated files/test schemas are owned temporary fixtures, not user documents.
