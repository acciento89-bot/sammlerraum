# Actual exact candidate CI failure and test-only correction

Run42423667733, exactd331efbdd523225a3206c49fa93f81bd4821def2, completed failure. Native step:1236passed/1failed. Sole failure: market-batch.integration.test.ts 500distinct-target measurement exceeded Vitest's default5000ms whole-test deadline. This test includes guarded setup of6500observations, two separately bounded application operations and multiple independent EXPLAIN ANALYZE runs.

Correction: explicit30000ms whole-test deadline for this measurement table only. No application deadlines, query assertions, transaction isolation, schema, immutable guards or production code changed. Local full actual40market cases pass,9.46s suite; slowest wholecase500distinct3497ms. Query counts remain17search/9aggregate and all actual result/plan assertions execute. Retained log task-3-ci-fixture-budget-green.log. Prior exact CI is not success; replacement exact CI must actually pass before acceptance.
