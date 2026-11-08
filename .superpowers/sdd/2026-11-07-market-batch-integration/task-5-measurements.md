# Native market query measurements

Actual synthetic PostgreSQL17 runs. Raw/configuration call counts exclude driver BEGIN/COMMIT. Timings describe these local fixtures only. No schema/index expansion.

| Items | Targets | Observations | Search ms | Aggregate ms | Search calls | Aggregate calls |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 13 | 26.77 | 15.73 | 17 | 9 |
| 1 | 1 | 13 | 23.76 | 15.03 | 17 | 9 |
| 50 | 1 | 13 | 27.44 | 16.25 | 17 | 9 |
| 50 | 50 | 650 | 30.97 | 18.69 | 17 | 9 |
| 500 | 1 | 13 | 143.82 | 28.35 | 17 | 9 |
| 500 | 500 | 6500 | 181.01 | 52.85 | 17 | 9 |

All six fixtures execute three preparation data reads per operation and actual allowed FILTER and CURRENT_QUANTITY aggregation, with zero provider fetches. Plans retained for current/history/whole-scope ambiguity, latest-containing count/page and explicit numeric aggregate. All captured root plan temp-written blocks are zero. Full original plan JSON remains in task-5-actual-plans.log; compact per-query execution/buffer observations in task-5-query-measurements.json.
