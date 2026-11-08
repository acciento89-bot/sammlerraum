# Narrow CI saved-status repair review

Verdict: **PASS — no new Critical or Important findings.** The authorized test-only repair satisfies the scoped regression and quality requirements. Fresh exact-current-source remote CI remains a root-owned gate before phase closure.

Reviewed base `9a1f0c5a1b8d2be1974a75e2b980f2057e6a07fa` through head `fdd1753db409ac3a65386df7094e263505a15209` (also current HEAD), the supplied 45,135-byte `review-9a1f0c5..fdd1753.diff`, CI integration appendix, actual retained CI failure tails, and local RED/GREEN/build/typecheck/lint evidence. This review covers only the new CI verification repair; it does not reopen the closed I1/I2/M1–M5 findings or deferred M6/M7.

## Spec and test quality

- Both original CI failures identify the same strict locator ambiguity at former line 644: legitimate loading and category-saved statuses coexist. The retained runs report 1 failed / 59 passed and 2 failed / 58 passed respectively. Product `ConditionEditor` independently manages scheme loading and save status, consistent with that diagnosis.
- `apps/web/e2e/catalog-grading.spec.ts:639` onward installs the narrowly matched new-category scheme route before the category-save click. It fetches the real response, requires HTTP 200, signals that the actual fetch completed, holds delivery, then forwards that response with `route.fulfill({ response })`. It does not invent scheme contents, authentication, mutation success, or application authority.
- While held, the journey requires two statuses and exact localized loading and saved text, a disabled condition selector, and a real API read proving the new category and cleared prior condition. Thus successful persistence and pending enrichment are independently evidenced rather than inferred from status text alone.
- Release is explicit. Waiting route removal precedes assertions that loading disappeared, only the exact saved status remains, the empty condition selector is enabled, and both unchanged save controls are disabled. The subsequent real condition save requires the exact success text, settled selected value/disabled save control, and persisted category/option via the real API. The grading success check is strengthened from substring to complete exact text.
- Existing explicit-clear protection, retained/inactive condition, authored grading, archive facts and foreign-owner privacy checks remain intact. No `.first()`, new skip, timeout increase, reduced role check, or alternate authority path was introduced. The gate is also released in `finally`, and route removal waits for handlers before contexts and fixtures are cleaned up.
- The actual commit range changes one browser journey plus report/evidence only. Production source, contracts, migrations, workflow configuration, Playwright configuration and browser-server/TLS SMTP support are unchanged.

## Verification evidence

The retained RED log has all four DE/EN × desktop/mobile journeys fail at the original ambiguous assertion, after both independent exact-status assertions succeeded. Targeted GREEN records 4 passed; the final registered matrix records 60 passed, including all four repaired journeys and no skipped cases. The web build log shows successful compilation, TypeScript and page generation; explicit typecheck and formatting/lint logs show successful completion. The appendix describes the production harness and command environment, consistent with the unchanged configuration and observed matrix.

I performed read-only diff/source/log inspection and a scoped whitespace check (passed), without rerunning already-passed suites or touching source, index, HEAD, database, root-owned dirty files, or external systems. Only this review file was written. These local evidence checks do not substitute for fresh exact-source remote CI at the reviewed head.
