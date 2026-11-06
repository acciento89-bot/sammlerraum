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

## Ruling L1.9 — actual evidence erasure in pre-release tokens

M2 adds required nullable originEvidenceErasedAt to the decoded fact token before any route/persisted token exists. Physical originId, evidence-erasure instant and revocationId are different facts; the original field list could not detect redaction of an existing origin. Why: stale RETAIN must conflict after erasure without forging a revocation or nulling an existing physical origin. Cost: one bounded timestamp field and updated pre-release fixtures; no live token compatibility is claimed. Native erasure/token regression is mandatory.

## Ruling L1.10 — existing transaction/authorization seams

M2 store functions never open nested transactions or force isolation inside existing ReadCommitted writers. One-statement fact/lineage reads give a coherent observed result; actual owner-item/catalog locks protect CAS mutations and parent callers own budgets. Actor erasure takes explicit actor+target and rejects different targets, preserving the no-private-admin-bypass rule. Existing persisted moderator authority remains the canonical mutation seam. Why: this respects actual item/custom/catalog services rather than assuming future wrappers. Cost: M3/M4 must configure/retain real outer bounds and use same-transaction resolved facts; a parsed token/receipt/role string remains no authority. Detailed bindings and first-untracked-baseline semantics are in task-m2-execution-context.md.

## Ruling L1.11 — actual MVCC synchronization and copy destinations

The real concurrent-classification regression found that FOR UPDATE alone does not advance an established RepeatableRead snapshot when metadata merely appends an event. Native metadata insertion now updates only the subject parent's MVCC tuple (`id=id`), so stale waiters serialize/retry rather than racing sequence insertion. Raw purchase writes already change that tuple; BASELINE must not recursively update it from their BEFORE trigger. Custom raw writes update the parent separately. This changes no raw value, generation, domain timestamp or stored interpretation. The same test now produces exactly one winner and a closed conflict. Cost: one parent tuple update per metadata assertion, using existing tables/locks rather than a new lock registry. COPY additionally requires a current raw-only destination; otherwise an unknown source could silently preserve unrelated destination interpretation. These are M2 correctness fixes, not new user features or permission/role infrastructure.

## Ruling L1.12 — closed ReadCommitted origin invalidation

Accept independentM2 P2: a flattened CLASSIFY origin may be erased/revoked after a valid RC refresh but before COPY insertion. The two specific native invalidation checks now signal40001, and the COPY insertion boundary translates recognized serialization into MONEY_CONFLICT. All other23514 errors remain invariant failures; no generic constraint masking or cross-item lock registry. Caller propagates out of its transaction for atomic rollback. Actual interleaved erasure/revocation regressions prove the conflict and zero destination COPY rows. Ordinary completed deletion/as-of behavior remains separately tested; an artificial DELETE-before-resume gate that could not acquire its FK/parent locks is diagnostic only.

## Ruling L1.13 — catalog revision batch meaning replacement

M4's dedicated same-entry/revision-path batch helper may replace an existing catalog interpretation during explicit equal-raw correction/rollback. It resolves actual source/destination maps in the same transaction, checks exact raw/path/token bindings, holds persisted moderator authority and actual direct-origin rows, and appends immutable history. A known source yields a flattened COPY; an unresolved source yields an explicit RAW_WRITE so an old destination interpretation cannot survive accidentally. This does not broaden general personal copyMoneyFact or accept an untrusted receipt as authority. Actorless legacy maintenance can only invalidate meaning with a raw event whose actor is NULL; it cannot author or copy interpretation. Actual conditional authorization, same-raw stale-token denial, direct-origin carry, equal-snapshot invalidation and later-chunk rollback are natively exercised. The maximum10100-path native write takes≈26.5seconds on this Mac; capacity is proven, default5s canonical transaction compatibility is not. Full M4 must close that integration budget explicitly before acceptance. No new table/cache/provider or edits to applied migrations are introduced for this helper.

## Ruling L1.14 — retain correction preconditions across queued approval

An AUTHORED replacement must retain its submitted source equality precondition. The initial M4 stored envelope shape only captured its new receipt, which would lose REPLACE's expectedFactToken before approval. Add optional replacesFactToken to AUTHORED stored paths, populated by the server only for REPLACE; require its presence exactly when the actual base has that money path, and recheck it under the same canonical/origin locks. NEW has no replaced token; new-entry envelopes cannot carry RETAIN/replacement tokens. This is a local unreleased M4 protocol correction, not a rewrite of existing financial events or snapshots. Internal VERIFY checks a retained same-revision fact without appending an event or changing its token. Native capture, same-raw stale correction denial, token-preserving verification and real concurrent evidence erasure are exercised.

## Ruling L1.15 — explicit canonical operator identity and finite capacity budget

LEGACY context may carry an actual actorId for verified moderator maintenance/legacy proposal approval. Omission still authors no unit: it can write raw UNKNOWN; when known meaning must carry into a new revision, fail and atomically roll back rather than fabricate an operator or silently discard meaning. Actual end-user moderation wrappers must supply their authenticated moderator. Money-enabled canonical maintenance uses explicit45s transaction/2s acquisition/5s statement/1s lock bounds after measured10100 native metadata writes took≈26.5s; personal M3 budgets are unchanged. Whole canonical maximum-case capacity and final approval/rollback routes remain acceptance obligations. Stable snapshot bytes/schema remainv1, evidence tables/migrations unchanged.
