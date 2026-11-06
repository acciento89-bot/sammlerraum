# Monetary provenance deployment and recovery

This document describes the additive rollout. It does not authorize or record a production cutover. The M5 source keeps `canonicalConsumers: false`; exact search, saved queries and purchase-cost consumers require M6 acceptance.

## Upgrade order

1. Disable canonical consumers and new monetary authoring before changing live application versions. Preserve existing raw columns, revisions, and evidence.
2. Keep writers disabled through the entire migration sequence, including both catalog guard performance/compatibility migrations; do not resume at an intermediate migration. Apply the additive provenance migrations and install UNKNOWN-capable readers. Existing integers without surviving evidence remain unknown; never infer their scale from the current currency table, locale, title, or a matching value.
3. Drain old catalog mutation/proposal/rollback workers and requests. An old catalog no-op writer can lose retained evidence; database changes alone do not retrofit that old application code.
4. Deploy all personal and canonical writer adapters, exact private history/revocation readers, capability routes and the new UI together. Keep raw legacy personal writers invalidating rather than silently preserving meaning.
5. Enable the single pinned authoring profile only after the exact versioned endpoints and acknowledgments are available. Exercise synthetic creation, preservation, replacement, classification, copying, rollback and revocation, including competing updates and dropped responses. There is no fallback from absent/refused capabilities to raw CRUD.
6. Enable canonical consumers only after M6 complete-scope search/dashboard/saved-query and purchase-cost validation is independently accepted. M5 alone does not enable those features.

## Downgrade

Disable new authoring and canonical consumer capabilities first. Drain current workers before changing application versions. Retain provenance tables, generation columns, audit history and immutable revision envelopes; do not roll back by deleting evidence or by converting unknown integers. Historical personal raw writers must continue to invalidate meaning. Do not resume old catalog workers while expecting provenance preservation.

## User-visible recovery

- An unchanged stored pair is retained with its captured fact token. Explicit replacement uses the pinned decimal profile, acknowledgment and correction reason; a canonical proposal records that reason in its change summary. Clear is a distinct acknowledged action.
- A missing/refused/malformed capability or authoring profile is read-only. Retry uses GET; it does not select an older raw write endpoint.
- A stale token is a conflict. Inspect current state, then explicitly adopt it before a new attempt. Reading alone does not silently replace a pending edit.
- A transport failure or uncertain server outcome is not proof of failure. A malformed successful acknowledgment is also not permission to repeat. Inspect the known item, or review the collection/proposal list for an unknown creation. Start a separate new item/proposal only after explicit reconciliation; never fabricate a server identifier or automatically replay a creation.
- A validated creation acknowledgment also retains the actual item ID in bounded actor/collection memory across locale remounts after partial failure. This handoff is cleared after a complete save or logout, and every reload still authorizes the actual item on the server. An unresolved creation locks the collection selector until explicit reconciliation.
- Exact successful receipts are installed before metadata writes or display refresh. A later metadata/refresh failure does not reauthor the successful monetary operation. Multiple custom fields can partially succeed and are reported separately, not as an atomic form transaction.
- Classification documents meaning without changing raw values. Withdrawal selects the exact historical assertion; copies are withdrawn at their actual origin. Cleared amounts retain a private history entry point. Global evidence mutation requires a fresh persisted moderator grant; public catalog rendering must not expose private notes/references.

## Bounds and private state

Private edit/review context is bounded memory scoped to the authenticated actor and original fact/revision. Explicit logout and observed account mismatch clear it. It is not stored in URLs or browser storage. An optional `x-money-actor` header is only a stale-session precondition; the server independently authenticates every request and authorizes its real subject.

Personal response reads are bounded to 1 MiB, capabilities/error bodies to 4 KiB, and full immutable canonical maps to 32 MiB for the explicit maximum of 10,100 bounded monetary paths. Full maps are validated before exposure; custom batches use at most 50 definitions per request and at most 1,000 active fields. No partial read map is presented as complete.

## Verification records

The milestone context and exact commands/counts live in `.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/task-m5-execution-context.md` and its `logs/` directory. Milestone acceptance, review, source commit and remote CI must be recorded there before claiming cutover readiness. Disposable browser data and private screenshots are synthetic; production data, mail and purchases are outside this validation.

### Statement raw-validator performance closure (2026-11-06)

The additive `20261106135500_catalog_money_statement_raw_guard` migration installs the catalog AFTER INSERT transition-table validator before replacing the older row function. Thus an intermediate installation state retains both checks; no state omits raw validation. Every non-REVOKE event is still checked against its exact immutable entry/revision/target/definition/raw pair, with the same duplicate/shape/amount rules. Each distinct snapshot is loaded and materialized once per statement, not once per row. Exceptions abort the entire statement; surrounding batch transactions still roll back earlier chunks. Personal, actor, sequence, MVCC, audit/redaction, COPY lineage and revocation checks remain in the row guard. There is no session flag, application assertion or persistent validation cache. Keep the documented writer-drain and consumer-disabled rollout boundary; no production deployment is performed by local verification.

### Canonical query and purchase-cost rollout

After the complete M1–M6 writer, UI, coverage, saved-query and dashboard gates pass, `MONEY_CANONICAL_CONSUMERS_ENABLED=true` enables canonical amount consumers. It defaults to false and is independent of `MONEY_AUTHORING_ENABLED`; neither user input nor a cached client flag grants authority. The same validated server setting drives private capabilities, actual search/saved/dashboard services and range controls. Old deployments remain explicitly unavailable, without raw fallback. Cursors bind the consumer policy and must be refreshed after this setting changes.

Enabled consumers recheck all owned/live/lifecycle candidates before text/AST/page matching in the same bounded RepeatableRead operation. Unresolved/ineligible prices outside a visible match deliberately make the amount query unavailable. Current missing paths are not historical fallbacks. Purchase cost reports separate outer coverage from the matched selection and distinguish empty, no-price, unavailable, partial and complete states. Partial groups are known-price subtotals; missing prices are never zero. Currency, declared unit and stored exponent remain separate; there is no FX or valuation substitution.

Operational enablement is a separate configured rollout; local conformance and a feature-branch push do not deploy or enable production. On downgrade, disable consumers first and refresh queries/cursors, preserving all raw and append-only evidence history.

## Phase08 pinned monetary transfer adapters

`captureMoneyExport` accepts a server-owned selection descriptor in the caller's existing bounded RepeatableRead transaction. It independently rechecks the authenticated owner and live item/parent before materializing metadata. The complete selected count must fit 1,000 items; the entire UTF-8 JSON snapshot, including envelope, quantities, coverage, provenance identifiers and totals, must fit 8,388,608 bytes. Exactly those boundaries are allowed. Every candidate row is sized before append, and all failures return no snapshot. A later artifact writer must wait for the entire capture before publishing bytes; it must not expose a partial stream. Larger worker captures require a separately reviewed design.

Explicit axes select purchase prices, owned custom fields, or current catalogue entry/selected-variant fields. Complete interpreted exports gate the whole authorized outer scope before narrower matching and refuse missing, unknown or unsupported selected prices. Purchase totals come from the same-snapshot canonical cost service, with exact quantity multiplication and separate currency/unit/stored-exponent groups. Custom/catalogue values never become purchase-cost totals. RAW and explicitly selected unresolved-list exports have no decimal fields or totals. Unknown historical codes remain integer/code/status facts without guessed scale.

The returned deeply frozen snapshot pins the read time, item titles/current quantities, exact subjects/raw pairs, generations, sequences and effective-event/origin/erasure/revocation identifiers. It excludes actors, reasons, evidence references/categories, private notes, locations, policies and document bytes. Later revocation or item changes affect a new capture; they do not mutate an existing snapshot.

`validateMoneyImportRow` pins a strict source row, profile, canonical receipt and SHA-256 source digest in preview. Commit validation must receive the server-persisted expected preview; changing its row identity, source, profile, precondition or receipt is a conflict. A digest is an integrity comparison, not authentication. DECIMAL uses the pinned authoring grammar. RAW canonical input additionally requires the explicit `CANONICAL_MINOR_UNITS_V1` source contract. Explicit `LEGACY_UNKNOWN_RAW_V1` input has no profile/receipt/scale and stays unknown. REPLACE requires an expected fact token; actual writer CAS and authorization still apply at commit.

These are transfer interfaces, not completed CSV/XLSX/PDF exports or import jobs. Phase08 must implement durable job/row idempotency, source-file limits, mapping/overwrite decisions, actual writer calls, protected immutable artifacts and worker progress before those features can be accepted. Large exact monetary values must be string cells in XLSX, never floating-point cells. No new route or production enablement is introduced by this adapter.
