# Phase06 whole-phase integration review

## Review boundary

Reviewed **BASE `eefd76a1d6d29c1925cc0daccfced22d02885f70` → immutable HEAD `570a9ccb4735a5ae5578251dd8b4a9e5bb293a9c`** against `docs/superpowers/plans/2026-09-19-06-valuations-market-data.md`, binding spec §§5.5/15, and the explicit decisions in `phase-review-context.md` (read first). The Task6 context rulings 1–11, approved Task4 RepeatableRead adjustment, Task5 source-404 correction, and scoped Task6 UTF-8 correction are binding. This is the single broad phase integration review, not a second round of every task audit or a reopening of Phase05.

Read all changed production areas in bounded passes using `phase-production-review-eefd76a..570a9cc.diff`, recovering truncated source portions from the files. The source/test companion and current covering test files supplied targeted integration evidence; task reports and prior scoped reviews supplied the chronology. The full raw-evidence package remains retained. Root-owned tracking files were already modified and were not changed by this reviewer. HEAD was confirmed as the requested immutable SHA.

## Plan and spec compliance

**SPEC: Compliant for the approved Phase06 implementation scope.** All six planned capabilities are present and connected: canonical money/private manual history, immutable external observations, scheduled idempotent ingestion, owner comparison API, localized owner UI, and two default-off production adapter factories. No missing or contradictory implementation requirement was found after applying the approved decisions. M1 below concerns stale integration documentation.

- **Exact money and quantity semantics:** input parses through the pinned currency authority and bigint arithmetic, persistence retains the exponent, DTOs use canonical decimal strings, and UI formatting uses the stored exponent without a Number conversion (`packages/domain/src/money/money.ts:7`; `packages/domain/src/valuations/valuation-service.ts:155`; `packages/contracts/src/valuations.ts:17`; `apps/web/src/components/valuations/valuation-money.ts:14`). Manual values remain private, append-only and PER_UNIT. Actual quantity/split tests retain history only on the source item (`packages/domain/src/valuations/valuation-service.test.ts:224`), satisfying the approved interpretation of §5.5 without copying authorship.
- **Source facts and exact mapping:** all seven kinds, zero/false, ranges, qualifiers, source metrics and time basis/precision survive the ingestion-to-query-to-UI path. Current and historical semantic mappings retain the original identifier/revision audit while preventing entry/variant widening (`packages/domain/src/market-data/validation.ts:154`; `packages/domain/src/valuations/valuation-query.ts:329`; `apps/web/src/components/valuations/market-observation-history.tsx:14`). The approved narrow Scrydex variant and PriceCharting product/category/console selectors replace the plan's broad UPC/query sketch; guide statistics are labelled CATALOG_VALUE rather than fabricated sales.
- **No fabricated aggregate or missing value:** summary aggregate remains null. Currency diversity uses the latest manual value plus every eligible external source in the selected scope, including off-page sources, and applies the same canonical historical validation as visible rows (`packages/domain/src/valuations/valuation-query.ts:474`). The adapters preserve explicit zero and omit absent/null price fields. No FX, blended value or automatic item valuation is introduced.
- **Retry and timing contracts:** durable receipt equality precedes revalidation/fetch; receipt and observations commit atomically after a second receipt check. The adapter reports body receipt before decoding/cooldown, while the handler freezes the accepted time and retains an explicit completion fallback for legacy providers (`apps/worker/src/jobs/sync-market-data.ts:59`; `apps/worker/src/jobs/market-sync-repository.ts:42`; `packages/market-data/src/provider-http.ts:128`). This meets the idempotent-observation requirement without claiming exactly-once network calls before commit.
- **Approved query architecture:** one bounded RepeatableRead view covers ownership, catalog snapshots, groups/history and hidden currency candidates. Parent-before-item locks, specific serialization retries, remaining-work SQL limits, post-await checks and sanitized availability errors are implemented (`packages/domain/src/valuations/valuation-query.ts:193`; `apps/web/src/lib/valuation-routes.ts:50`). No catalog locks span the comparison read, and no fetch is initiated by an owner GET.
- **Privacy and authority:** production display grants are empty independently of ingestion configuration. API DTO projection excludes actor/owner, private purchase/grading data and receipt identities. The owner page uses uncached session/ownership checks; client epochs prevent stale reads from overwriting a write or changed source context. Source 404 invalidates all external facts and derived claims while preserving manual context, whereas owner 404/any 401 clears private state (`apps/web/src/lib/valuation-route-dependencies.ts:10`; `apps/web/src/components/valuations/valuation-state.ts:96`, `:214`).
- **Bounded default-off operation:** both provider flags, policy approval and positive finite budgets are required through validated server configuration; credentials alone do not register adapters. Production composition injects the real factories, one durable service/token permit and the existing Money capabilities. The claim spans physical transport settlement and monotonic cooldown, preserves counters, never expires automatically, and supports only own-attempt clear (`packages/config/src/server.ts:93`; `apps/worker/src/jobs/market-provider-composition.ts:25`; `apps/worker/src/jobs/market-request-permit.ts:63`).

## Strengths

- The three boundaries—private manual authoring, global immutable market facts, and licensed display capability—remain distinct across schema, domain, API and UI. Enabling a worker provider cannot accidentally enable owner or public display. Native constraints and explicit DTO projections reinforce this separation.
- Exactness is maintained across the complete production path. Node24 original numeric lexemes feed worker-injected Money functions; PostgreSQL bigint and stored exponent feed string DTOs and exact localized rendering. There is no market-data-to-domain dependency cycle or duplicate currency table (`packages/market-data/src/exact-json.ts:14`; `packages/market-data/src/provider-mapping.ts:33`; `apps/worker/src/jobs/market-provider-composition.ts:14`).
- Migrations are additive and separate value history, observations, successful receipts, dispatch state and operational token gates. Observation/receipt erasure does not cascade into a live request claim. UPDATE protection is explicit; the code and runbook accurately avoid treating it as protection against privileged DELETE.
- The owner UI treats acknowledged saves and uncertain POST outcomes differently. It preserves the draft during scope changes and external rechecks, disables conflicting actions, never automatically retries a POST, and exposes confirmed data when refresh fails (`apps/web/src/components/valuations/valuation-state.ts:239`; `apps/web/src/components/valuations/valuation-page.tsx:84`). The localized labels preserve source type, timestamp precision and per-unit meaning.
- Worker cancellation is a physical-settlement contract, not merely a raced timeout. The permit's merged stop signal reaches the actual adapter transport; cleanup uncertainty remains latched after a handler has left the pending set, and main withholds DB disconnect when market stop fails (`apps/worker/src/jobs/market-request-permit.ts:171`; `apps/worker/src/jobs/market-sync-runtime.ts:62`; `apps/worker/src/main.ts:61`).
- The important seam corrections are covered where their real consumers operate: Task4 captured adapter/acquisition failures and actual SQL cancellation; Task5 populated external seeds/off-page claims during a held failing recheck; Task6 malformed UTF-8 through the actual permit and handler. This avoids accepting a fake boundary that masks different production behavior.
- The operational runbook is explicit about real wire-envelope, sentinel/currency, licensing, shared-token routing, credit controls, fleet drain, replay barrier and recovery limits (`docs/market-provider-operations.md:15`, `:41`). Its admission-lost-ACK and clear-lost-ACK distinctions match the implementation and the binding rulings.

## Issues

### Critical — 0

None found.

### Important — 0

None found.

### Minor — 1 new

**M1 — Reconcile the package README with the completed phase integration.** `packages/market-data/README.md:3` describes the package as performing no HTTP; `:13` calls the API/DTOs future work; `:28`–`:30` says the worker currently timestamps fetch completion and Task6 must still add body-receipt timing; `:56`–`:60` says the real permit/adapters are not implemented. These are now contradicted by the two package factories, `provider-http.ts:107`, the callback consumer in `sync-market-data.ts:70`, actual composition in `market-provider-composition.ts:25`, and the current operations document. The default registry is still empty, but the unqualified wording at README `:19`–`:21` does not explain the available explicit activation composition.

**Impact:** a maintainer using the package entry documentation can mistake integrated safety/timing work for unimplemented work or build against the obsolete fetch-completion description. This is a documentation inconsistency, not a runtime correctness or activation defect.

**Fix:** update the README to describe the current factories, callback/fallback distinction, independent display policy and durable permit/lifecycle composition, and link `docs/market-provider-operations.md`. Preserve default-off status, exact-once-network limitations and all unverified activation gates; describe counters as attempted-call limits rather than monetary spend guarantees. Do not edit historical task reports to erase their chronology. A documentation-only scoped check is sufficient.

## Deferred triage and resolved findings

- **Task1 timezone proof Minor: resolved.** The final manual and market tests capture before/inside/after backend PIDs and assert the non-UTC baseline is restored (`packages/domain/src/valuations/valuation-service.test.ts:295`; `packages/domain/src/market-data/market-data-service.test.ts:513`). It is not carried as an open finding.
- **Task2 provider-wide chronological-list index Minor: remains explicitly deferred, not newly load-bearing.** The unconsumed `listObservations` optional-filter path can require a sort (`packages/domain/src/market-data/market-data-service.ts:246`). The production comparison uses its own exact semantic-source index and query-proven seek path. This phase does not add a new consumer of the deferred method.
- **Task4 I1/I2: remain closed.** Known acquisition/adapter failures map to sanitized 503, actual remaining acquisition/retry time constrains SQL, and both successful response paths check post-processing budget. Targeted native tests and the approved fix review support closure.
- **Task5 I1: remains closed.** `externalInvalidated` gates seeds, groups, availability, derived currency conflict and paging throughout a failed owner recheck. **Task5 M1 runner color warnings remain explicitly deferred** to shared harness/Phase13 cleanup; original logs are retained.
- **Task6 I1: remains closed.** Fatal UTF-8 is translated to terminal INVALID_RESPONSE inside the permit callback before the permit's generic transport sanitizer (`packages/market-data/src/provider-http.ts:130`). The real-permit regression verifies terminal acknowledgment and no receipt/commit.
- **Existing dependency/build/evidence-noise baseline:** Task2's carried evidence-noise note and the worker/maintenance bundle warnings remain Phase13 follow-ups. They are not a newly introduced phase defect and are not silently treated as clean output or a separate newly counted finding.
- **Legacy L1: still load-bearing for later work.** Canonical legacy purchase/custom/catalog ranges/totals, exports/insurance and release remain gated in Phases07/08/13. The catalog display repair preserves the existing legacy interpretation; it does not supply historical exponent/provenance or authorize rescaling/backfill.

**Count accounting:** new whole-phase findings are **0 Critical / 0 Important / 1 Minor**. The two previously accepted Phase06 functional/harness Minor follow-ups (Task2 optional history index and Task5 color policy) remain open separately, giving **3 open Phase06 Minor items including M1**. The inherited bundle/dependency evidence-noise baseline is disclosed above rather than counted again as a new phase ticket. There are no reopened Critical/Important findings.

## Covering evidence and verification limits

The following are inspected recorded results and covering test implementations, not suites rerun by this reviewer:

| Integration risk | Evidence inspected |
| --- | --- |
| Adapter → real permit → registry/handler → DB receipt, exact zero/unsafe integer and pre-cooldown time | `apps/worker/src/jobs/production-market.integration.test.ts:107`; original `logs/task-6-native-final-first.log`: 48 passed across four real PostgreSQL/queue files, exit 0 |
| Committed retry skips HTTP, transient retry consumes another permit, persisted error redaction | `production-market.integration.test.ts:143`; same native result |
| Durable admission, first-row races, independent clients, actual spacing, ambiguous ACK, carry/clock/ownership | `apps/worker/src/jobs/market-request-permit.integration.test.ts:53`, `:209`, `:231`, `:336`, `:350`; final native run executed all 15 gate cases, including hour-only carry |
| Earlier completed cleanup failure still prevents DB disconnect; standalone stop reaches adapter body | `production-market.integration.test.ts:259`, `:320`; same native result |
| UTF-8 terminal classification through actual permit and handler | `apps/worker/src/jobs/market-provider-failure.test.ts:47`, `:64`; `logs/task-6-fix1-green.log`: 65 passed / four files / exit 0; prior genuine two-failure RED retained |
| Hidden/off-page currency claims, exact target isolation, one MVCC view, privacy and empty display policy | `packages/domain/src/valuations/valuation-query.test.ts:114`, `:277`, `:317`, `:412`, `:449`; root-level `logs/task-4-fix-native.log`: 37 passed across query/routes; actual 8,008-row plans and 1,419,287-byte response measurement retained |
| Acquisition/remaining budget and actual SQL settlement | `valuation-query.test.ts:698`, `:736`; `apps/web/src/lib/valuation-routes.integration.test.ts:352`, `:394`; same recorded Task4 native result |
| Source rejection clears external facts while preserving manual data/draft | `apps/web/src/components/valuations/valuation-state.test.ts:286`; `apps/web/e2e/valuations.spec.ts:534`; `logs/task-5-fix-state-green.log`: 16 passed; `logs/task-5-fix-browser-green.log`: four DE/EN desktop/mobile external transport cases passed |
| Production owner/manual/default-off journey and save/session/race behavior | `apps/web/e2e/valuations.spec.ts:141`, `:768`, `:847`; `logs/task-5-browser-recovery.log`: 12 passed; external licensed-display cases are explicitly query-generated GET transport, not a production HTTP grant |
| Default-off composition and disabled/zero-policy no admission/send | `apps/worker/src/jobs/market-provider-composition.test.ts:10`, `:69`; actual server config and run.ts composition inspected |
| Workspace compatibility | `logs/task-6-workspace-test-corrected.log`: 621 passed / 253 expected DB-gated skips, exit 0; final corrected lint/typecheck/build logs end exit 0; Task6 fix-specific lint/types/worker build are separately retained in its approved scoped report |

Paths beginning `logs/task-5-*` or `logs/task-6-*` in this table are relative to this report's directory. Task4 root-level logs are explicitly identified. Earlier broad successful runs are not represented as rerun after the narrow UTF-8 fix; exact-current-source remote CI remains the final integration gate.

No additional execution was needed to resolve a concrete remaining code doubt. No suite, browser, provider call, database operation, generation, source edit, index/HEAD mutation, source push, purge or child review was performed. Only this authorized report was authored. No general unchanged-platform audit was needed; prior named unchanged-seam checks remain in the individual review record.

## Recommendations

1. Make the narrow README correction in one consolidated documentation fix, then perform the scoped re-review requested by root. No implementation redesign or repeated native/browser suite is indicated by M1.
2. Root should finish and retain both exact-source CI results for `570a9cc` (`39101603958` and `39101601035` at dispatch), and apply its exact-source verification/persistence rules to any superseding correction. This review does not assert either CI result or task/phase checkoff.
3. Carry the explicitly accepted index/harness/baseline items and L1 into their stated consumers/phases. Keep both adapters and production display default off until the documented activation evidence exists.

## Declined to judge

- Live Scrydex/PriceCharting authentication, subscriptions, actual single-card envelope, zero/sentinel meaning and purchased-guide currency: fake contract/native tests cannot establish these facts; explicit activation gates, no paid probe authorized.
- Legal storage/retention/display/history/link entitlement: requires current provider/operator evidence and is independently gated; this source review grants no rights.
- Exclusive token routing, real runtime/driver cancellation bounds, fleet-wide stop/drain, replay barrier and claim recovery: local composition and separate-client tests establish code behavior, not deployed operational proof.
- Actual destructive provider purge, absence verification and reactivation: only the source/runbook compatibility is assessed; no live purge/recovery runner or authorized destructive operation is in this phase scope.
- Universal exactly-once HTTP and whole-HTTP deadline: explicitly not promised; concurrent precommit delivery may fetch more than once, and auth/response transfer/rollback settlement lie outside the domain processing budget.
- Legacy purchase/custom/catalog monetary interpretation, backfill, canonical totals/exports/insurance: L1 remains a binding later-phase gate; the small numerical display repair cannot establish historical denomination.
- General Phase05/platform correctness and unrelated auth/proxy/dependency hardening: outside this phase range; no newly load-bearing integration issue justified reopening them.
- Provider-wide optional-filter chronological-list optimization and shared runner/bundle baseline cleanup: explicit accepted deferrals; the production comparison uses a separate proven path and no new consumer changes their triage.
- Independent fresh visual inspection: root's recorded synthetic visual review and real browser evidence are retained; this integration review makes no additional screenshot/visual-approval claim.
- Exact remote CI success, backup persistence, merge/deployment and canonical task/phase completion: owned by root and not yet certified by this review. At dispatch both corrected exact CI runs were pending.

## Assessment

**Plan/spec verdict: Compliant for approved Phase06 scope.**

**Code quality verdict: Approved with one new nonblocking Minor documentation finding. New counts: 0 Critical / 0 Important / 1 Minor.**

**Ready to merge? With fixes/gates.** Correct the contradictory package documentation and let root complete the exact-source CI/persistence gate. The integrated default-off source has no identified blocking implementation defect; this report does not declare Phase06 complete or authorize provider activation/release.

**Reasoning:** The completed paths preserve privacy, exact money, semantic mapping, immutable history, receipt atomicity and honest cancellation/limit semantics across the task boundaries, with substantive native and browser coverage. The remaining new issue is stale documentation, while operational activation and later legacy-money requirements remain explicit and unproven rather than being inferred from passing synthetic tests.
