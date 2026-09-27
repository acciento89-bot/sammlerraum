# Task 7 narrow test-correction rereview

- Scope: `review-86be72d..5ebd1b3.diff` and the updated resume report. No production code changed, no suites rerun, and prior source findings were not reopened.
- **Verdict: test correction accepted; scoped SPEC PASS / QUALITY PASS unchanged.** No new breakage identified in this diff. The remote GREEN result for this final test tree is pending.

At `apps/web/e2e/collections-items.spec.ts:510-545`, the options test keeps the nodes request failing through the observed error, disabled Save, and enabled collection selector. It then releases the route only for the explicit retry, verifies the request count increased, Save is enabled, and the entered title remains. This still proves failure recovery and draft preservation; it removes only the brittle assumption that development effect replay produces exactly one initial GET.

At `apps/web/e2e/collections-items.spec.ts:548-581`, the detail test likewise holds failure until after the alert and absence of loading status are verified. It then clicks retry and checks both a new request and the recovered collection heading. Allowing more than two total GETs does not weaken those behavioral assertions.

The resume report distinguishes the round-two source CI result (the original 12 browser cases passed; four new cases failed on one-shot routing/count assumptions) from the pending final test-correction CI. No production behavior was altered by `5ebd1b3`.
