# Dashboard history and personal milestones — read-only preparation and proposed plan

> **For agentic workers:** After root adjudication and a fresh scoped source GO, use the established superpowers:subagent-driven-development workflow, one sole mutator at a time. Unchecked implementation steps below are proposals, not completed work or source permission.

**Goal:** Close the actual missing personal-milestone requirement while preserving existing dated valuation history and avoiding invented past inventory, quantities, financial returns or lifetime achievements.

**Architecture:** Phase06 already records and renders append-only manual valuation observations; Task4A already supplies exact current-quantity latest values and strict-prior value changes. The smallest missing feature is an owner-authored dated milestone record with private CRUD and a bounded dashboard list. Collection-development snapshots, inferred threshold achievements and additional historical analytics are optional product expansions, not binding V1 prerequisites discovered in this review.

**Tech stack:** Existing TypeScript/Zod, parameterized Prisma SQL, PostgreSQL17.11, Next.js/next-intl, native Vitest and authenticated Playwright; retain pinned Node24.19.0/pnpm10.17.1.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md` §§16/22; §15.2 consulted specifically to check append-only valuation meaning. Binding root context: `task-4-context.md` P7.16–19 and `task-4-execution-context.md`. Original `task-4-brief.md` was read first. Legacy money M1–M7 and market five-step approved plans remain separate dependencies.

**Evidence BASE:** `33225cfc4f685a965eb210b01359d3db7705f145`. All product source/spec reads used immutable `git show`, `git grep` or `git ls-tree`. Evidence line numbers below refer to that BASE, not mutable files. Task5C/5D/5E remains an existing-DTO consumer and is outside this report's source ownership. This document is the only edited file. No product source/test edits, database/browser/network/generator/index/commit action or subprocess lifecycle operation was performed. No runtime or performance result is claimed.

**Root steering received during preparation:** proposed P7.35 says not to promote optional advanced analytics or intuitive collection development into a mandatory V1 snapshot ledger. This report agrees: no contrary binding requirement was found in the actual spec or Phase07 plan. P7.35 is pending root's formal adjudication, not treated here as issued source GO.

## Global constraints

- Spec §16: “Smart Collections speichern eine Filterdefinition. Sie enthalten keine duplizierten Stücke.” Saved filters describe current selection, not earlier membership.
- Spec §15.2: “Neue Bewertungen überschreiben alte Datenpunkte nicht.” Preserve Phase06 observations; do not seed valuations from purchase, market, milestone or synthetic fixture data.
- Spec §22: “Basiskennzahlen bleiben für Free sinnvoll.” “Erweiterte historische Analysen können Premium sein.” The latter permits possible monetization, not a new required Premium gate, portfolio chart or holdings ledger.
- Fixed OWNED authorization; current dashboard items and parents must both be live/owned. Phase09 sharing and Phase10 relations remain separate.
- Exact integers/denominations/source/basis and explicit current quantity for valuation totals. Missing differs from zero. No FX, profit, return percentages or cross-source grand total.
- Reuse bounded transaction/error/privacy conventions. Reuse actual selection only when evaluating inventory; personal authored milestones do not require an inventory query, AST compiler or per-item loop.
- Each future source submilestone needs a fresh reviewed BASE, exact file brief, meaningful RED→GREEN evidence and independent root review. These are subordinate gates, not additions to the91-task ledger.

## 1. Exact obligation map and completion interpretation

| Obligation | Exact evidence | Actual producer / consumer | Remaining code / proof |
| --- | --- | --- | --- |
| Combinable date-period search and Smart Collections | Spec733–765, especially761/763; Phase07 plan search/saved tasks | Current search selection/compiler and saved filter definitions | No historical membership/time replay requirement. Preserve current selection semantics. |
| Append-only personal value history | Spec706–708 (§15.2) | `Valuation`; `addManualValuation`; `getItemValuationSummary`; existing manual-history UI | Already implemented in source. Reuse the existing flow and relevant frozen regression proof; do not create a competing history API. |
| Own estimates and value change | Spec899/901 | Task4A manual groups, latest observation versus strictly earlier observation, current-quantity weighted exact deltas | Existing implementation substantively covers this minimum. Preserve explicit basis and incomplete coverage. Root should formally decide this closes the historical-value minimum rather than leaving a vague broad-history gate. |
| Personal milestones | Spec910 | No milestone model/producer/DTO/consumer in inspected BASE | Actual missing feature. Finite owner-authored dated CRUD is recommended below. Spec does not define targets, thresholds, achievement rules, badges or lifetime claims. |
| Advanced historical analysis may be Premium | Spec914 | Existing Phase06 and Task4A provide the base | This is permissive. No new bucketed chart, time-series model or entitlement obligation follows from this line alone. |
| Collection development | No `Sammlungsentwicklung` or equivalent required time-bucket feature in §§16/22 or Phase07 plan | Current counts/rankings/recent record additions exist | No contrary binding evidence found. Optional prospective analytics must not become a silent prerequisite for finishing V1. |
| Purchase/market/shared/duplicate/wishlist metrics | Original Task4 brief; P7.19 | Explicit unavailable families in current DTO | Existing money/market/Phase09/10 gates remain open; milestone work does not close them. |

`docs/dashboard/owned-dashboard.md:47–51` and P7.18 use the broader phrase “full historical analysis” as an open integration gate. That implementation note must be reconciled with exact spec §22; it cannot expand the product spec by itself. Suggested root resolution: record that Phase06 append-only dated history plus Task4A strict-prior change satisfies the defined value-history/change minimum, retain meaningful dated milestones as the missing feature, and list advanced collection-development analytics as optional future scope. This is a recommendation, not this worker's unilateral checkoff.

The original Task4 brief (also main Phase07 plan203–205) asks for current metrics. Its implementation list has no historical holdings ledger. Spec §22 includes personal milestones but supplies no milestone thresholds or rules; choosing100/1000 automatically would be an unrequested product decision.

## 2. Evidence: recorded history versus historical inventory

| Fact | Source evidence at BASE | Proven meaning / missing information |
| --- | --- | --- |
| Manual history storage | `packages/db/prisma/schema.prisma:811–829`; `packages/db/prisma/migrations/20261018015303_manual_valuations/migration.sql:5–66` | Item/owner/actor, MANUAL/PER_UNIT, exact integer/currency/stored exponent, observedAt and createdAt. Native UPDATE is forbidden; trusted erasure and parent cascades may DELETE. Retained records are not indelible lifetime evidence. |
| Manual producer | `packages/domain/src/valuations/valuation-service.ts:137–175` | Parent/item locks; true append; max10000 records/item; user may backdate observedAt; actual createdAt cannot precede observedAt. No captured quantity or membership. |
| Existing history query | `valuations/valuation-query.ts:426–432,480–506,553–563`; `packages/contracts/src/valuations.ts:134–150` | Latest plus descending `(observedAt,createdAt,id)` manual page, default20/max100. External source history is already separate. |
| Existing history UI / proof source | `apps/web/src/components/valuations/valuation-page.tsx:118–143`; `apps/web/e2e/valuations.spec.ts:138–241,279–350` | `/[locale]/items/[id]/values` renders manual history and older/newer navigation. Existing authored-zero/backdating/pagination/inactive/private journey test sources should be reused. This worker did not execute them. |
| Task4A own estimate and change | `packages/domain/src/dashboard/dashboard-sql.ts:33–64`; `packages/contracts/src/dashboard.ts:97–124`; `docs/dashboard/owned-dashboard.md:19–27` | Latest before denomination; prior strictly earlier observedAt before denomination comparison; exact `(latest−prior)×current quantity`; explicit exclusions and observed-time spans. No common-period performance is claimed. |
| Item quantity/membership | `schema.prisma:165–218`; `items/item-service.ts:476–522` | Single current quantity/collection/node. Quantity UPDATE discards the prior quantity. AcquisitionDate is mutable user input; createdAt is database record creation; updatedAt is only latest edit time. |
| Split | `items/item-service.ts:559–715`, especially624–653; `valuation-service.ts:137–140` | Source quantity falls; new child gets quantity and copied current metadata. No split-lineage record or valuation copy; manual history remains only on source. New row createdAt need not be a newly acquired object. |
| Lifecycle | `items/item-service.ts:510–555`; `schema.prisma:185–189` | Current dispose/archive/delete timestamps; API has no restore path at BASE. These are not a quantity or complete membership journal. Parent deletion hides children without individual updates. |
| Collections | `collections/collection-service.ts:117–124,155–195`; `schema.prisma:129–145` | Current collection and creation/deletion timestamps. Nodes move within their collection (`collection-service.ts:198–350`); this is not an item transfer history. Erased rows invalidate “first-ever” claims inferred from surviving rows. |
| Retained location events | `schema.prisma:243–260`; `locations/location-service.ts:273–288`; split699–708 | Actual storage from/to events, not physical quantity/collection membership snapshots. |
| Other retained records | Catalog revision/rollback models; `MarketObservation` and sync receipt in `schema.prisma:859–907` | Source/reference facts, not owner holdings. Market source/time/type/denomination cannot establish acquisition, quantity or realized return. |

The inspected writer inventory identifies item create/update/archive/delete/split in `item-service.ts`, location updates in `location-service.ts`, condition writes in `condition-service.ts:169,200`, and collection create/delete in `collection-service.ts`. A timestamp changed by a metadata edit is not a holdings event. Approved money interpretation records also are not a quantity journal.

Therefore:

- A later chart of last estimate before date multiplied by today's quantity would be a **current-cohort/current-quantity reconstruction from retained observations**. Backdating, quantity edits, deletions and today's filter changes can alter it; it is not actual past collection value.
- Running totals of current quantities grouped by createdAt/acquisitionDate are invalid historical inventory. A split is a concrete counterexample.
- A count milestone's exact first/lifetime achievement date cannot be derived from present counts or first retained createdAt. Unknown historical stock and erased evidence stay unknown.
- None of those storage gaps blocks an owner explicitly recording a personal milestone date as their own assertion. No historical backfill or new holdings producer is needed for that feature.

## 3. Product alternatives and recommended scope

**A — Recommended: owner-authored dated milestones.** A private title/date record the owner can create, edit or remove. “Milestone date” is explicitly supplied by the owner; server createdAt/updatedAt show when the record was entered/edited. The system does not verify an achievement, infer inventory, grant a badge or claim first/lifetime status. This is the smallest direct implementation of “persönliche Meilensteine”. One table and existing-style private CRUD/list UI suffice.

**B — Owner-configured observed targets.** The owner explicitly chooses a metric (for example ACTIVE physical units or live collections) and a positive integer target; no fixed100/1000 thresholds. Current progress can use existing count semantics, but a dated “first observed at/above target” requires actual prospective observations. It is a target/observation feature, not proof of first achievement. It needs target revisions, scope identity, explicit observation action or a separately chosen capture schedule, and reset/erasure rules. Higher code and semantics cost than A; keep optional unless root selects it.

**C — Exact event-time milestones or collection development.** Requires new prospective baseline and atomic quantity/lifecycle/membership/change records across every real writer, split transaction grouping, ordering/concurrency/erasure behavior. It cannot recover pre-baseline inventory or create true historical returns. This is substantially larger and has no binding requirement found here. Do not begin it under personal-milestone CRUD approval.

Recommend A only for remaining V1 work. B/C and additional valuation buckets stay outside the source plan below. Reuse existing per-item history and current two-point dashboard change; no new manual-series endpoint, snapshot table, worker, schedule or read-triggered write is recommended.

## 4. Proposed concrete contract for authored milestones

All names/limits in this section are proposed for root adjudication, not existing code.

### Ownership and data meaning

`PersonalMilestone` is private owner content independent of the item filter/lifecycle. Dashboard heading: “Your milestones” / “Deine Meilensteine”; help text explains that dates are entered by the owner. It is not narrowed by active dashboard inventory filters. No item/collection/catalog association is included in v1, avoiding new relation retention/authorization scope. No amount, currency, automatic metric, verified flag, achievement status, first-ever timestamp or Premium marker.

One table: `id UUID PK`, `ownerId TEXT FK User ON DELETE CASCADE`, `title VARCHAR(120)`, `milestoneDate DATE`, `revision INT` initially1, `createdAt TIMESTAMPTZ(3)`, `updatedAt TIMESTAMPTZ(3)`. Index `(ownerId,milestoneDate DESC,createdAt DESC,id DESC)`. Dates must be finite years0001–9999; timestamps finite canonical millisecond UTC, updatedAt>=createdAt; revision1..2147483647. Server derives owner/id/record timestamps. No historical migration/backfill; the table starts empty. No general activity log or immutability claim for editable authored content.

Title: normalize NFC and trim;1..120 Unicode code points, at most480 UTF-8 bytes, no NUL/control/unpaired-surrogate characters. Preserve interior whitespace; render as plain text. Exact duplicate title/date records are allowed because they can represent distinct personal events; do not use them as idempotency keys.

`milestoneDate` is a real ISO date-only string, never derived by browser time-zone conversion. Proposal allows any valid0001–9999 date, including future dates; the label remains a date supplied by the owner, not “achieved on”. This avoids inventing a server-timezone rule for the owner's calendar. Root may instead require past-only recorded events; that would require an explicitly chosen user-date/timezone rule, not browser-local guessing. No date itself proves anything occurred.

Create/update timestamps mean recording/editing time, never historic event time. Editing a date/title preserves createdAt and advances revision/updatedAt. Delete is permanent private-record removal, consistent with simple user-authored content; no trash/restore/history service is added. Account erasure cascades; there is no association to an item whose deletion could leave inferred contribution history.

### Strict DTOs and domain interface

```ts
type PersonalMilestoneDto = {
  id: string; title: string; milestoneDate: string; revision: number;
  dateBasis: 'OWNER_ENTERED'; createdAt: string; updatedAt: string;
};
type PersonalMilestonePage = {
  version: 1; scope: 'OWNED'; selectionBasis: 'ALL_PERSONAL_MILESTONES';
  readAt: string; items: PersonalMilestoneDto[]; total: number;
  nextCursor: string | null;
};
// createPersonalMilestoneService(database) produces:
createMilestone(actor, {title, milestoneDate}): Promise<PersonalMilestoneDto>;
updateMilestone(actor, id, {title, milestoneDate, expectedRevision}): Promise<PersonalMilestoneDto>;
deleteMilestone(actor, id, {expectedRevision}): Promise<{id: string}>;
listMilestones(actor, {limit?: number, cursor?: string}): Promise<PersonalMilestonePage>;
```

Exact allowed input keys only; do not accept ownerId/id/dateBasis/createdAt/verified/metric/amount/scope/filter/lifecycle. Both edit fields are required, simplifying conflict/replacement semantics. Same submitted values still constitute a CAS update and increment revision, matching existing saved-query update conventions. At max revision, return conflict rather than overflow. Missing/foreign ID is the same404; stale expectedRevision is409 only for an owned existing record.

Use a dedicated closed `PersonalMilestoneError` family: `MILESTONE_INVALID`400, `MILESTONE_NOT_FOUND`404, `MILESTONE_CONFLICT`409. Preserve it narrowly in the shared transaction wrapper as SmartCollectionError is preserved today. Dependency/timeout/response-cap uses existing SEARCH_UNAVAILABLE503; malformed retained row/unsafe count uses SEARCH_INVARIANT500. Fresh authentication401, Origin403, oversize body413, query encoding414 use existing API codes. No SQL/input/cause/owner diagnostics in public errors.

### List/window/bucket/cardinality contract

There is intentionally **no analytical window or bucket aggregation**: these are exact authored date records across all retained dates. List order is milestoneDate DESC, createdAt DESC, id DESC. Default20/max50 rows, `limit+1` sentinel; exact safe-integer total in the same snapshot. Dashboard preview requests limit5 and exposes the ordinary next/list path. No array of all milestones, per-year aggregate, zero-filled month or inferred milestone is returned.

Cursor: one narrow version1 milestone-list cursor, bounded2048 base64url characters, strict decoded keys, canonical date/time/id and context hash binding actor+version+limit+order. Use existing bounded cursor JSON mechanics; do not reuse the existing search cursor's two-column payload for the three-column date sort. Parameterized `(milestoneDate,createdAt,id)<(...)` keyset condition, never offset pagination or arbitrary sort. A cursor is not authorization; recheck owner each page. Later pages use a new snapshot; concurrent milestone-date edits may change page membership, so refresh restarts the list. No stable historical pagination promise.

Maximum serialized page64KiB, all title/string/schema checks inside the existing transaction budget. Overflow503, not truncation. SQL counts use safe exact conversion; unexpected unsafe total/incoherent retained row500. Count/page/clock are3 fixed data queries,7 wrapper query calls per attempt before driver transaction controls. No inventory query and no N+1. Target query counts are proposed, not measured.

### Transaction, time and concurrency contract

Reuse `runSearchTransaction`/`runSearchRead`:12s overall, at most3 recognized40001 retries,5s transaction,2s acquisition/statement,500ms lock, shrinking remaining budget; check after await/DTO parsing/serialization and settlement. Preserve one RepeatableRead snapshot for clock/count/page. `readAt` labels this read, not a replay token or historical event time.

Create: validate input/actor before DB; allocate UUID once outside the wrapper retry loop, one INSERT RETURNING using server clock, validate DTO before commit. Update/delete: owner-scoped lookup plus CAS UPDATE/DELETE RETURNING in the same bounded transaction; exact affected-row check; no unconditional last-write-wins. If two edits race, one wins and the other returns conflict after permitted serialization retry. Use server clock after waiting for the relevant write (and monotonic updatedAt>=createdAt), not caller date/time for recording timestamps. No SQL must widen owner scope while checking existence.

Expected data queries: create1; update/delete2; list3. Actual timeout-setting/driver calls must be measured. No global owner lock/storage quota is introduced. List/output/time bounds protect this feature without imposing an arbitrary lifetime milestone cap.

Unknown response outcome is explicit: an interrupted create may have committed. Client does not automatically replay it or infer failure from503 after settlement; it offers reload/inspection and an explicit new submission. Allocating the ID outside internal serialization retries protects that one operation's retries, not arbitrary HTTP duplicate submissions. Do not claim exactly-once create without an idempotency protocol. Delete's later404 means absent, not proof which earlier request deleted it.

### HTTP/UI transport

Proposed routes under existing APIv1:

- `POST /api/v1/dashboard/milestones` creates; body `{title,milestoneDate}`.
- `POST /api/v1/dashboard/milestones/query` reads; body `{limit?,cursor?}`.
- `PATCH /api/v1/dashboard/milestones/[id]` updates; body `{title,milestoneDate,expectedRevision}`.
- `DELETE /api/v1/dashboard/milestones/[id]` removes; body `{expectedRevision}`.

All are body-only same-origin requests with fresh authenticated session, private no-store/request-ID/error conventions.16KiB actual streamed JSON body cap; fatal UTF-8, duplicate decoded root keys, nesting/unknown keys and invalid media type fail closed under existing flat-body conventions. No milestone content in URL/query/log. Existing `/dashboard` GET/POST and DashboardDataV1 remain untouched; new UI calls the milestone list separately so current5C/5D/5E cannot accidentally render unfinished data.

Use existing `read-search-body` flat-body machinery with a narrowly named milestone mode only if its mode-key design supports it cleanly; fresh brief must reconcile that exact file. Otherwise extract its existing bounded flat-object decoding once, preserving all original search tests; do not make a second permissive JSON parser. Reuse `apiRoute`, fresh-session/no-store composition and error mapping patterns from `dashboard-routes.ts`/smart-collection routes.

## 5. Optional observed-target/capture alternative — not a V1 blocker

If root explicitly selects B rather than A, minimum honest semantics are:

- Owner chooses metric `ACTIVE_UNITS` or `LIVE_COLLECTIONS`, an exact positive integer threshold and private title; no hard-coded achievements. Scope is all owned ACTIVE live items plus independent live owned collections, not arbitrary search filters. A changed target creates a new target revision and never borrows old observation completion status.
- Exact trigger is a user action “Check target now”, a separate authenticated POST. Ordinary GET and existing private query POST remain read-only. No scheduler or auto-capture is implied. A scheduled variant would need root to specify cadence, missed runs, retention and operational ownership separately.
- In one bounded transaction, read target revision, use existing `prepareItemSelection(tx,actor,{text:'',filter:null,lifecycle:'ACTIVE'})` plus current dashboard count semantics, and record exact target revision/readAt/count. CAS against edited/deleted target prevents attaching an observation to the wrong definition. No per-item app queries.
- First recorded observation establishes the baseline **now**; unknownBeforeBaseline stays true. No inferred createdAt/acquisitionDate backfill. No observation between user actions means a gap, not an unchanged count or zero. Scope/target revision/readAt/count must be persisted together; no money/provider values are captured.
- UI says “Observed at or above your target at [recorded time]”, not first-ever achievement. A baseline already above target does not date its original achievement. First qualifying recorded observation is not the earliest real crossing; intervening declines/peaks are unknowable.
- This costs target+observation storage, target-version concurrency, retention and new cardinality/output caps; it is materially larger than authored CRUD. Fixed physical-unit counts are exact numeric strings. A future source plan must bound target count, observation page/window and stored retention, then measure actual queries. This report does not present an underspecified optional alternative as implementation-ready.

Exact event-time development would additionally require prospective recording at item create/update/archive/delete/split and collection create/delete (and future restore/move/import), with split transaction identity and erasure semantics. Storage at BASE cannot prove past quantities, membership or lifetime crossings; no migration can guess them. None of that work is required for recommended A.

## 6. Dependency consistency scan

| Interface → consumer | Binding consistency / finding |
| --- | --- |
| Phase06 manual producer → existing item history | `Valuation` observedAt/createdAt/id, stored exponent, append-only semantics, no split-child copy. Existing `/items/[id]/values` is reused; no replacement endpoint or duplicate per-item queries. |
| Task4A latest/prior → dashboard | `dashboard-sql.ts:33–64` and `dashboard.ts:97–124` retain CURRENT_QUANTITY and strict-earlier observation comparison. Authored milestones never become valuation evidence. |
| `runSearchTransaction` → milestone CRUD/list | `search-read.ts:15–83` supplies actual bounds/retry/error behavior. Add only narrow milestone-error preservation and regression tests; no generic transaction redesign. |
| Smart Collection CRUD pattern → milestone CAS | `smart-collection-service.ts:95–187` shows private lookup/list/CAS update/delete; use its conventions without copying filter execution or wrong cursor sort shape. |
| Actual inventory selection → optional target feature only | `search-selection.ts:19–52` returns matchedPredicate/outerPredicate/readAt. Recommended A has no inventory filter. B must reuse the empty ACTIVE owned selection and current count definitions. |
| Legacy money M1–M7 → costs and future history | Approved M6 `prepareLegacyMoneyPredicates(tx,authorizedOuterScope,filter,sort?)` and `readPurchaseCost(tx,authorizedOuterScope,matchedSelection?)` preserve independent outer coverage before matching; currency+unitKey+storedExponent and exact current quantity. A monetary interpretation event is not quantity history. No cost or money milestones in A. |
| Money M7 → transfer snapshot | `captureMoneyExport(tx,authorizedSelection,options)` captures exact interpretation/origin/revocation/current quantity/asOf,1000 items/8MiB. It is not a recurring development store or permission to retain provider facts. |
| Market five-step plan → external totals | `withMarketBatch(context,selectors,use,dependencies,consume)` and `aggregateMarketBatch(context,batch,selectors,basis)` keep full selector identity and separate explicit aggregate rights. No provider activation, snapshot retention right, historical total or money-target grant is added here. |
| Task5C/5D/5E → later UI integration | Fresh reviewed UI BASE and ownership release first. Current DTO rendering remains untouched; milestone panel is a separate private list/form consumer. |
| Phase09/10 → future relations | Initial milestone owner is its only reader/writer. No shared authorship/target relations/duplicate/wishlist achievement inference. Future association changes need their own authority and erasure decisions. |

## 7. Review focus

1. An owner enters an old date today: display the supplied date separately from actual creation time; do not call it a verified historic achievement (H1/H3).
2. Two tabs edit/delete the same milestone: one CAS wins, stale revision conflicts without overwriting the newer record (H1/H2/H3).
3. Create commits but response is lost: no automatic replay or duplicate-success claim; reload makes actual retained records visible (H2/H3).
4. Foreign ID/cursor, session expiry or filter change: no private leak; milestones remain explicitly independent of the inventory filter; stale/foreign response never replaces the current owner's panel (H2/H3).
5. Unicode/date extremes and edits across page boundaries: exact title/date validation, stable tie ordering within one snapshot, bounded page and honest refresh behavior across later snapshots (H1/H2/H3).

## 8. Finite fresh-BASE submilestones for recommendation A

### H1 — personal milestone storage, domain and native proof

**Files:** create `packages/contracts/src/personal-milestones.ts`, `personal-milestones.test.ts`; create `packages/domain/src/dashboard/personal-milestone-service.ts`, `personal-milestone-cursor.ts`, `personal-milestone.integration.test.ts`; modify `packages/db/prisma/schema.prisma`, add one freshly named migration (never amend an applied migration), exact package export maps, and `packages/domain/src/search/search-read.ts` only for narrow typed-error preservation. Reuse existing `search/cursor-json.ts` bounded JSON mechanics after exact fresh-BASE inspection.

**Consumes:** actor from authenticated route; shared bounded transaction; existing UUID/date validation conventions and native User relation. **Produces:** exact §4 service methods/DTO/cursor/CAS behavior. No change to item/collection/valuation/money producers.

- [ ] Write contract tests for strict input/output, title NFC/code-point/byte limits and invalid Unicode/control cases, genuine Gregorian date validation/leap years and date-only preservation, immutable server-owned inputs, max revision/cursor limits.
- [ ] Write meaningful native RED using real service calls: author a dated record and list it; second owner cannot see/edit/delete; old entered date differs from createdAt; equal-date ties; stale update/delete; foreign and absent404; actual DELETE/account cascade; retained malformed row invariants. RED must reach actual assertions, not merely fail environment/module loading.
- [ ] Run regular contract tests and `RUN_DATABASE_INTEGRATION=1 pnpm vitest run --no-file-parallelism packages/domain/src/dashboard/personal-milestone.integration.test.ts` under root-scheduled guarded synthetic PG17.11; preserve RED evidence.
- [ ] Implement empty additive storage, strict private service, three-column keyset and revision CAS with exact actor predicates; no snapshot/history backfill. Add only explicit milestone error recognition to shared wrapper.
- [ ] Run native GREEN: concurrent edit/edit and edit/delete, list count/page snapshot during writes, missing/foreign cursor binding, large retained list limit50+sentinel,64KiB closed cap, dependency/timeout/driver failure, actual wrapper budget after settlement. Assert safe totals and finite dates; capture EXPLAIN ANALYZE/BUFFERS for1/50/500 and large owner-list fixture, ties/old dates; measure fixed query count including timeout setup. No speculative index beyond the one declared sort/owner index without evidence/root ruling.
- [ ] Freeze/report source/evidence SHA and commands/counts for independent root review before H2. This report does not authorize staging/commit operations.

### H2 — private wire routes and closed errors

**Files:** create `apps/web/src/lib/personal-milestone-route-dependencies.ts`, `personal-milestone-routes.ts`, `personal-milestone-routes.test.ts`, `personal-milestone-routes.integration.test.ts`; create API route files at `dashboard/milestones/route.ts`, `dashboard/milestones/query/route.ts`, `dashboard/milestones/[id]/route.ts` under `apps/web/src/app/api/v1/`; modify bounded flat-body decoder only as reconciled in fresh brief. Add new closed public error codes to `packages/contracts/src/errors.ts` only as required by actual current API typing.

**Consumes:** H1 service. **Produces:** §4 four HTTP operations with fresh owner auth, Origin, body, no-store and generic errors; existing dashboard/query API stays unchanged.

- [ ] Write wire/native RED for real author/list/edit/delete lifecycle, foreign/absent ambiguity, stale CAS409, exact body/type/duplicate-key/encoding limits, Origin403/session401, no raw input/SQL/cause leakage and no-store on all results.
- [ ] Run focused route tests to RED; implement thin adapters using existing apiRoute/security/body mechanisms, no alternate owner bypass or DTO synthesis.
- [ ] Run native GREEN through real database service: malformed cursor before query, different actor/limit/order context, cross-owner stale revision, list snapshot consistency, real records persisted on success. Model a lost create response and ensure transport gives no false rollback/exactly-once guarantee.
- [ ] Run existing private-search/dashboard/smart-collection route and bounded-body regressions if their decoder/shared wrapper changed; freeze/report for root review. No inventory or provider queries in milestone endpoints.

### H3 — localized milestone UI, reuse existing history, and acceptance evidence

**Fresh-BASE prerequisite:** Task5C/5D/5E must be reviewed/landed and sole-mutator ownership released. Immutable BASE has no dashboard component tree; root's brief must identify the actual dashboard entrypoint/state conventions then, rather than treating a guessed future file as evidence.

**Create:** `apps/web/src/components/dashboard/personal-milestones.tsx`, `personal-milestone-state.ts`, `personal-milestone-state.test.ts`, `personal-milestone-client.ts`; `apps/web/e2e/personal-milestones.spec.ts`, `apps/web/e2e/support/personal-milestone-fixture.ts`. **Modify after fresh reconciliation:** actual dashboard entrypoint; `apps/web/messages/de.json`, `en.json`; `.github/workflows/ci.yml` native allowlist; `docs/dashboard/owned-dashboard.md` to reconcile the historical-analysis gate with root's formal ruling. Existing item values history remains its existing consumer.

**Consumes:** real H2 APIs; existing item detail/valuation navigation. **Produces:** responsive private title/date authoring/edit/delete/list panel with explicit owner-entered dates, independent scope label, bounded preview/list and honest conflict/unknown/stale/session states.

- [ ] Write state/browser RED for both locales: empty list is an empty personal feature, not fabricated milestones; create old dated title and observe actual persisted dates; edit/remove; revision conflict; date-only rendering; untrusted title plain text; bounded preview/list.
- [ ] Implement accessible controls/forms and mobile list; no automatic create retry on unknown response; confirmation UI for destructive delete follows current app conventions, not an extra global approval flow. Session loss clears private results; aborted/outdated list results cannot replace newer view. Inventory filter/lifecycle changes do not imply milestone filtering.
- [ ] Execute authenticated native-backed browser journeys with actual service/route producers, two-owner denial, CAS conflict, response loss/reload, keyboard/mobile/date/title limits and both locales. Use transport faults only to prove error/race handling; mocked success DTOs are not sole product proof.
- [ ] Reuse relevant Phase06 valuation browser/native regression and Task4 dashboard exact-value/change tests to demonstrate no regression. Do not duplicate the existing per-item history implementation or add buckets/charts merely to generate evidence.
- [ ] Run one frozen regular/schema/types/lint/build/native/browser/CI gate with actual new native allowlist; preserve executed/pass/skipped counts, source SHA and limitations. No duplicate broad run without source change/failure. Root reviews and decides original Task4/§22 gate status; remaining money/market/shared/relations dependencies stay separate.

## 9. Concrete root rulings before source GO

| Ruling | Recommendation | Tradeoff / cost if wrong |
| --- | --- | --- |
| R-H1 / proposed P7.35: historical minimum | Accept Phase06 retained manual history + Task4A strict-prior change as satisfying defined historization/value-change minimum; make broad optional development analytics nonblocking. | Avoids an unsupported ledger/chart prerequisite. If another binding requirement exists, name it before narrowing acceptance. None was found here. |
| R-H2: meaning of personal milestones | Choose explicit owner-authored title/date CRUD (A). Keep owner-configured observed targets (B) optional. No default100/1000 achievements. | Small direct feature; if intended product was automatic goals, A will not supply progress tracking. Resolve now rather than retrofit inferred achievement dates. |
| R-H3: date and association scope | Date-only owner-entered record, no verified/achieved flag and no item/collection association. Accept valid dates without timezone-derived past-only rule. | Honest and compact; future dates may be used for planned personal milestones. If strictly retrospective events are desired, define explicit calendar/timezone semantics before code. Associations would add authorization and deletion semantics. |
| R-H4: lifecycle and concurrency | Private editable records, permanent deletion/account cascade, revision CAS, no automatic replay after unknown create response. | Does not provide audit/restore/exactly-once HTTP creation. Adding those increases storage/protocol/UI scope and is not specified by §22. |
| R-H5: bounded list | All retained dates,20 default/50 max, dashboard preview5,64KiB response,16KiB body, current shared time limits; no analytical buckets. | Large lists need pagination/refresh; concurrent date edits may change later-page membership. No claim of a frozen cross-page history. |

Root can adopt these as one bounded interpretation and issue three fresh source briefs. There is no user reapproval question or source GO in this report. Recommended implementation is one table, one private CRUD/list service, three route locations/four operations and one localized panel. No inventory writer overhaul, scheduled capture or new money/market rights are needed.

## Preparation self-check

Original Task4 brief and P7.16–19 preserved; exact spec minimum distinguished from optional analytics; existing Phase06 history explicitly reused; actual storage/producer gaps evidenced; owner-entered milestone date distinguished from real recordedAt and inferred first/lifetime achievement; no present quantity repackaged as past stock; optional capture trigger/baseline/gaps/scope/atomicity/cost made explicit without claiming implementation readiness; money/market approved interfaces untouched; fixed owned semantics; DTO/query/no-window/no-bucket/cardinality/response/time/error/snapshot contracts specified; concrete native/browser proofs and fresh source boundaries provided. All implementation checkboxes remain unperformed; no runtime result or task checkoff claimed.
