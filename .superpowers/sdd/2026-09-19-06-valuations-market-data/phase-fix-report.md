# Phase06 consolidated documentation fix

Base: `570a9ccb4735a5ae5578251dd8b4a9e5bb293a9c`. Scope: the whole-phase review's single new Minor M1; earlier explicitly deferred items remain unchanged.

Updated `packages/market-data/README.md` to describe the integrated Scrydex/PriceCharting factories, empty registry constructor and actual explicit default-off worker composition. Replaced obsolete future API/DTO, Task3 receipt, fetch-completion-only and unimplemented permit/adapter claims with the current contracts. The README now distinguishes actual body-receipt callback from legacy completion fallback, ingestion from the independently empty display policy, receipt idempotency from exactly-once network delivery, and attempted-call/carry budgets from spending guarantees. It describes durable token scope, non-expiring ownership, physical settlement/cooldown, lifecycle uncertainty and the admission/clear acknowledgement distinction.

The runbook link resolves from the package README to `../../docs/market-provider-operations.md`. Live response shape, zero/sentinel/currency, entitlement, credit/overage, exclusive routing, real driver bounds and authorized fleet drain/replay/purge/recovery gates remain explicitly unverified. Historical task reports were not edited.

Validation: read the full M1 finding, existing README and current operations document; reviewed the complete amended README and diff. Pinned Node24.19.0/pnpm10.17.1 Prettier explicitly checked Markdown with `--ignore-path /dev/null`; final format, relative-link existence and source diff checks passed, with exact evidence in `logs/phase-fix-readme-check.log`. The initial successful formatting check is retained separately in `logs/phase-fix-readme-format.log`.

Documentation only: no production/test/schema changes, generation, suite, DB, provider request, activation, purge, push or child work. Root/reviewer/context/ledger/Phase07 artifacts are excluded. Root owns the single scoped re-review and exact-source CI/persistence gates.
