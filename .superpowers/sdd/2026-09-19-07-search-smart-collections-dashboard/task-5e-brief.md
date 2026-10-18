# Task5E — localized owned dashboard and collector browser proof

Preparation only. Source GO requires reviewed5C/5D and fresh root-supplied BASE/exports. Read original task-5-brief.md, task-5-ui-preparation.md sections1–2 and5–10, task-5-context.md/P7.19, and current reviewed dashboard contracts/docs. Reconcile actual current DTO names. Existing dashboard source91ae759 and private POST transport are reviewed foundations.

## Global constraints

- Filter definitions are structured, versioned data, not arbitrary SQL or free-form query strings.
- Search never returns items the actor cannot view.
- Smart Collections contain no duplicated item rows.
- Large/complex filters have bounded depth and clause count.
- Dashboard values remain separated by currency/source where aggregation is unsafe.

## Deliverable

Implement authenticated DE/EN dashboard route, state, metrics and exact formatter with shared applied query/builder, opaque tokens and collector navigation. Keep the existing warm visual system. Fetch one complete real dashboard response; never aggregate search pages or make per-item valuation calls. No chart framework, invented historical chart or milestone model. Original full Task4/5/Phase07 producer/history gates remain open where real contracts declare unavailable.

Present matched rows, physical units and matched collections separately from all live owned collections including empty ones; text/lifecycle do not filter that last count. Label current selection on lists/distributions. Manual groups retain source/basis/currency/stored exponent and contributor rows/units, coverage, missing and other denominations. Partial subtotal, no estimates, empty, unavailable and real zero differ. No cross-currency/source total. Latest-versus-previous change uses the comparable subset, current quantity, actual observation spans and NO_ESTIMATE/INSUFFICIENT_HISTORY/NONCOMPARABLE_DENOMINATION exclusions. Do not label it profit, percentage or common-period return.

A narrow formatter handles canonical signed integer strings up to78 digits with BigInt and the stored exponent. Use actual DE/EN grouping, decimal and minus symbols; preserve negative fractional signs and zero. Never pass values through Number, parseFloat, an int64 record schema or an inferred Intl currency scale. Unit counts remain exact. Pure proofs cover >2^53, >int64, negative fractions, zero and exponents0/3/4. Exponent4 is a formatter capacity proof where current native producers do not emit it; do not fabricate native currency data or weaken service validation. Existing single-record formatter stays unchanged.

Top10 items stay separate by denomination/source and link to real items with own-estimate wording. Collections rank selected units with item counts; recent additions use inventory createdAt. Respect eligibleCount/hasMore. Conditions retain exact category/option, real localized labels and retirement; grading distinguishes records from items and overlapping groups. Keep four trade buckets and actual ready semantics. Missing-data counters overlap; grading is optional. Use labelled tables/lists or simple CSS bars with real denominators. Unavailable purchase/market/duplicates/wishlist/shared/history/milestones never become numeric zero, even for empty inventory; known purchase presence differs from unavailable cost totals.

Reuse generation/abort, private token/tab storage and identity clearing. Query changes clear the prior DTO; same-query refresh failure can retain it only with explicit stale/read-time labeling. No empty-card fallback on errors. Search/dashboard transfer the same query through a new view token without private values in URLs/hrefs. Prove actual Next keys, Back/Forward, locale, reload and unavailable copied token behavior. Preserve shared drawer/dialog focus, keyboard access,320px/200%zoom and long-value wrapping; all states are translated.

## Required proof

Capture meaningful actual authenticated production-browser RED. Guarded real producers supply same-selection search/dashboard counts, valid mixed currencies, >safe/int64 totals, current quantities, actual zero/missing/negative/equal change, insufficient history and genuine denomination switches. Include empty live collection, retired conditions, multiple gradings, READY/PENDING/cleanup media and overlapping missing facts. Success payloads stay real; controlled delay/failure is only for error/race cases. Assert no mixed-currency grand total, unavailable numeric zero or invented history chart. No source-authority changes.

Complete the remaining original search-dashboard.spec.ts matrix in DE/EN on both configured desktop/mobile projects. Preserve5D real dynamic-tag saved0→1→0. Cover token/privacy/Next push-replace-popstate/locale/reload/item Back/search-dashboard/blocked storage/copied-evicted state/auth switch; stale responses after query change, dashboard/selector retry and pending/stale differences; keyboard drawer/dialog focus and narrow/zoom overflow. Use a compact pairwise browser matrix plus exhaustive pure formatter/state/builder checks. Capture actual pending/empty/success/error screenshots with synthetic data.

After iterations run one frozen relevant pure/enabled production-browser/types/lint/build set. Native backend checks require actual server changes. Sole source/DB/browser owner uses pinned Node24.19/pnpm10.17.1 and guarded sammlerraum_test, records build/server provenance and cleans only owned ports/processes. Preserve failures, exact commands/output/counts/skips and limitations. Report task-5e-report.md with workspace logs/task-5e-*, hashes and screenshots. Separate explicit source/evidence commits; no push, root-ledger/checkoff, agents, main merge or deployment. Root review, CI and whole-phase gates decide completion; partial unavailable cards do not complete §22/V1.
