# Legacy money prerequisite — root adjudication, NO SOURCE GO

Root read complete original220-line plan and all later refinement sections of legacy-money-implementation-plan.md, against immutable4b4dce2. The finite seven M1–M7 milestones are subordinate Phase07Task2 prerequisites/integrations; not seven additions to the91-task count. Each gets a fresh scoped source brief, exactBASE, independent review and verification. Current sole source owner remains p07_owned_search. This file approves direction only; no migration, real-data inventory/classification, production rollout or live operation.

## Ruling L1.5 — finite pinned prospective unit policy

Adopt proposed profile `legacy-money-iso-2026-09-17-v1` and unit identities `iso4217-2026-09-17:<CODE>` from the existing165-code numeric-exponent authority/hash. Why one immutable reviewed authority avoids a second ICU table and makes prospective meaning explicit; cost future authority updates require new profile identity and reviewed compatibility, with old artifact preserved. Expose/reuse the existing immutable table, never clone it or change current valuation behavior. Prospective raw/decimal authoring enforces its exact exponent; comma-or-dot/no-grouping grammar remains narrow. No existing raw integer inherits this meaning.

Historical classification can expressly assert the supported current-unit identity with independently evidenced exponent0..9, preserving exact scale and evidence. Unsupported units get the proposed noncomparable assertion-specific key/label and UNIT_UNSUPPORTED; raw structural[A-Z]{3} reads survive without fabricated exponent. Why exponent alone does not identify historical currency meaning; cost unsupported/unknown facts remain ineligible until another evidenced policy exists. Do not infer supported historical units from currentcode equality. Scale outside0..9 is an explicit unsupported operation, never clamp/default/conversion.

## Ruling L1.6 — bounded evidence and privacy erasure

Adopt owner-attestation for owned personal facts; catalog requires persisted moderator/admin authority plus labelled operator-reviewed record reference. An administrator gets no private-owner bypass. References are bounded opaque offline locators, not fetched URLs or machine verification. Reason/reference/category/actualdecisionactor+time are private; do not invent originalauthor/time or add uploads/bulkclassification. Why explicit declarations make known prospective/historical use possible without guessing; cost evidence quality remains the labelled human assertion rather than independently verified historical truth.

Adopt removal of personal events on permanent item/definition/account erasure, retained nonidentifying catalog facts with one-way metadata redaction, and direct origin-revocation/erasure checks on copies. Why append-only financial meaning must coexist with privacy and surviving copies must not mint independent evidence; cost some copied historical values become UNKNOWN after an origin is erased. No legal retention period is asserted. Exact content-transition guards protect financial columns and never use a GUC/newrole bypass; SQL wrapper identity is not end-user authorization. Explicit authorized domain orchestration owns erasure, actual FK actions must pass native tests, database operators remain trusted. Actor-only removal preserves prospective AUTHOR receipt; evidence erasure of CLASSIFY invalidates dependent historical assertions.

## Ruling L1.7 — generations, equal writes and bounded interfaces

Adopt three family-specific sidecars, durable personal subject sequence/absence tombstones, trigger-returned generations and logical untracked baseline sentinel, exact immutable catalog revision/target/definition identities, bounded proposal+rollback envelopes. Native UPDATE OF catches same-pair raw submissions; service reads RETURNING generation before assertion/copy insertion. Why equal raw pairs and delete/re-add cannot identify intent or avoid ABA; cost additive events/joins/CAS/guards and explicit writer integration. New adapter routes stay under `/api/v1` with a distinct money-authoring path and strict profile/envelope/capability handshake, never raw-v1 fallback or duplicate `/api/v2` CRUD. All writer inventory rows must be exercised before canonical enablement.

Add BOTH CatalogProposal.moneyInterpretation and CatalogRollbackAudit.moneyInterpretation in M2's initial new migration, since neither milestone has begun; no later rewrite of committed migration. Equal catalog snapshots still process actual submitted money intent and rollback audit without invented raw revision changes. No snapshot/oldpatch mutation. Minimum privacy-redaction content guards and FK-erasure regression tests are mandatory; no general event-sourcing/polymorphic registry.

## Ruling L1.8 — conservative full-scope money coverage and capture bounds

Use the exact independent owned/live-item/live-parent/lifecycle candidate relation before text/AST/page/cursor for interpretation coverage, matching market preparation. Why unavailable facts cannot hide behind matching/page selection or Boolean rewrites; cost even a text-excluded unresolved owned fact can make the monetary request unavailable. Only after coverage passes may matched-selection counts/totals apply. Missing, zero, unknown and known-ineligible remain distinct; purchase uses currentquantity×perunit, no custom/catalog amount summed as purchase. All arithmetic exact numeric/integer strings; other-unit positives false only after whole-query eligibility succeeds.

Approve M7's finite1000selecteditem/8MiB totalserialized snapshot cap within existingbudget, complete-selection precheck and closed no-partial limit error. Why bounded private capture supplies a useful transfer contract without an unbounded materializer; cost larger Phase08 job capture needs its own actual bounded/snapshot design, not implicit truncation. Pinned event/origin/revocation/quantity/asof survives later interpretation changes; actual CSV/XLSX/PDF/import jobs remain Phase08. Canonical consumers stay disabled until complete M1–M6 writer/coverage/UI proofs and actual saved-query/dashboard integration, not from schema/parser tests alone.

## Submilestone dependency consistency scan

| Pair | Produced interface/shared surface → consumer | Finding/adjudication |
|---|---|---|
| M1/M2 | strict facts/tokens/policy → resolver/native persisted shape | Exact bounded schemas; no historical default; native invariants in M2 |
| M1/M3 | authoring/CAS → personal wrapped transaction | New APIv1 authoring paths, raw-v1 compatibility preserved |
| M1/M4 | historical schemas/receipts → catalog immutable paths | Separate reads from prospective validation; captured queued receipt never reparse |
| M1/M5 | profile/intent/view → forms/capabilities | Explicit acknowledged replacement, omitted unchanged amount, no fallback |
| M1/M6 | unit/scale/integer bounds → SQL coverage/ranges | Same pinned unit identity, exact cross-exponent arithmetic |
| M1/M7 | authoring/profile → transfer rows | Source kind/version pinned, no cell-format inference |
| M2/M3 | generation/tombstone/events → personal+split | Actual returned generation, atomic event+raw, stable absenceCAS |
| M2/M4 | proposal/rollback columns/catalog events → all canonical writers | Both nullable envelopes in first new M2 migration; no amendment later |
| M2/M5 | view/revocation/redaction → review UI | No public evidence; actor-only AUTHOR and historical erasure distinct |
| M2/M6 | latest/event/origin/revocation → bounded SQL resolver | Same MVCC, flat originjoin, no peritem network call |
| M2/M7 | exact immutable identities → private captured facts | Pin IDs/erasure state in asof selection, never reuse current meaning later |
| M3/M4 | shared fact/intent protocol across personal and catalog | Family-specific auth/locks; no personal owner authority over catalog |
| M3/M5 | personal authoring/classify/history routes → editor | Newpath handshake, CAS conflict and partialform outcomes explicit |
| M3/M6 | raw/copy invalidation → search/quantity cost | No valuation copy/seed, current perunit purchase only |
| M3/M7 | authoring receipt/CAS → future import commit | Phase08 owns durable row idempotency, not this adapter |
| M4/M5 | exact revision/path envelope → proposal/current/history UI | Before/after cannot borrow current interpretation; retained paths use tokens |
| M4/M6 | current retained exact path+metadata → catalog amount predicate | Missing removed path, no historic fallback; metadata mismatch invariant |
| M4/M7 | immutable catalog path/receipt → export/captured import | Old snapshots unchanged, actualqueuedprofile retained |
| M5/M6 | capability false→true → canonical consumer activation | No enablement until all writer/UI/coverage gates, including actualsaved/dashboard integration |
| M5/M7 | reviewed profile/explicit modes → later transfer UI | Phase08 owns UI/artifact implementation, not inferred from capability |
| M6/M7 | coverage+matchedselection+exact groups → snapshot/report adapter | Beforetext coverage, matchedtotals distinct, bounded entirecapture or noresult |

| Milestone | Self-consistency check | Result |
|---|---|---|
| M1 | moneyprofile/parser tests vs changed read/write validators | Historical codes are read/copy compatible, no widening prospective authority or valuation behavior |
| M2 | insertion immutability vs FK/redaction/trigger tests | Explicit insertion-only origin checks and one-way deletion allowances; prove actual PG actions |
| M3 | wrapped service/API tests vs raw generation triggers | Same transaction/hooks; no double transaction or wholeform atomicity claim |
| M4 | equal raw snapshot vs metadata intent/audit tests | Process metadata even on raw no-op; M2 auditcolumn included; rawrevision bytes unchanged |
| M5 | capability guard vs locale/dirty/unknown-network UI cases | No raw fallback/automatic retry/classification from ordinary save |
| M6 | outer coverage vs matchedtotal/native NOT/OR tests | Exact independent outer gate beforetext, then exact matchedselection; no amountsort expansion |
| M7 | captured rows/bytes vs Phase08/fullreport claims | Exact1000/8MiB boundaries, no truncation; real largerjobs/artifacts not claimed |
