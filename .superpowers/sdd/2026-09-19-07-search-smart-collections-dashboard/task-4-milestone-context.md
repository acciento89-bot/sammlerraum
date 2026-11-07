# Root rulings — historical minimum and personal milestones

Preparation only; no source GO. Root read all238 lines of task-4-history-preparation.md and checked the exact §22 minimum at spec892–916. The finite H1/H2/H3 proposal is adopted with the rulings below. Each needs a fresh source brief, reviewed BASE, sole ownership and independent review. These submilestones add nothing to the91-task count.

## P7.35 — reconcile the actual historical requirement

Phase06 append-only dated manual history and its real item-history consumer, together with Task4A's genuine latest/strictly-earlier observation change, satisfy the defined historization/value-change minimum. §22 lists personal milestones but does not require collection-development buckets, a holdings ledger or a portfolio-return chart. Its advanced-history/Premium sentence is permissive. Earlier implementation notes calling broad historical analysis an open mandatory gate are superseded by this exact-spec interpretation.

Why: the product spec is binding; current quantity/createdAt cannot prove old holdings, especially after split or erasure. Cost if wrong: advanced analysis would need a separately evidenced feature rather than being silently assumed complete. No contrary binding requirement was found. Existing Phase06 history and value-change regressions remain required, and full original Task4 still awaits actual money/market/shared/relations/personal-milestone gates.

## P7.36 — authored private milestones

Choose alternative A: owner-authored title/date records. Use the exact proposed DTO/service semantics in preparation§4: dateBasis OWNER_ENTERED, private owner-only reads/writes, no item/collection association, automatic threshold, monetary metric, verified flag, first-ever achievement or entitlement gate. Title NFC/trim,1..120 Unicode code points/480 UTF8 bytes, no controls/NUL/unpaired surrogates. Date is a real Gregorian date-only0001–9999, including future dates; label it as the owner's supplied date rather than a verified achievement. Recording/edit timestamps remain actual server times.

Why: this directly supplies the unspecified personal-milestone feature without inventing past evidence or calendar/timezone rules. Cost if wrong: automatic goals/progress and associations are not included; they would require explicit target/capture/retention semantics. Optional observed targets and event-time development remain nonblocking future ideas, not source scope.

## P7.37 — revision and deletion semantics

Adopt one empty additive PersonalMilestone table, exact owner/date/createdAt/id index, private mutable title/date, revision1..2147483647 and server UUID/timestamps. Full update/delete requires expectedRevision; equal-value update still advances revision. Missing/foreign IDs are identical404; owned stale/max revision409. Permanent user deletion and account cascade are intentional; no audit/trash/restore feature or inferred historical backfill. Allocate create UUID once outside internal serialization retries, but never claim exactly-once HTTP creation. Unknown create response cannot be replayed automatically or resolved by duplicate title/date matching.

Why: existing CAS conventions protect two-tab editing while authored records remain removable. Cost if wrong: no restore/audit or external idempotency guarantee; those are separate protocol/storage features. No existing user records or production database are affected by this preparation.

## P7.38 — exact finite reads and budgets

Adopt preparation§4: list all retained authored dates ordered milestoneDate DESC/createdAt DESC/id DESC, default20/max50, preview5, limit+1 sentinel and exact safe total in one RepeatableRead. A dedicated canonical three-column cursor binds actor/version/limit/order, maximum2048 base64url characters, using existing bounded byte primitives. Later pages are fresh reads; date edits can change membership, and refresh restarts pagination. Page64KiB; streamed body16KiB. Existing12s overall/3 recognized retries/5s TX/2s acquisition+statement/500ms lock remain unchanged. Clock/count/page target3 data statements/7 queryRaw calls, create1 and update/delete2 data statements; measure actual settings/driver overhead before claiming results.

Why: bounded real records do not require inventory compilation or analytical windows. Cost if wrong: large lists need paging/refresh; no frozen historical pagination. Error/corrupt-row/cap distinctions follow the proposal. Where valid cardinalities/string limits make an oversized valid DTO impossible, prove bounds and the appropriate boundary layer honestly; do not fabricate a valid native64KiB overflow or disable constraints just to claim coverage.

## P7.39 — transport and independent dashboard panel

Adopt four operations at three APIv1 locations: create POST dashboard/milestones; list POST dashboard/milestones/query; PATCH/DELETE dashboard/milestones/[id]. Exact Origin then fresh session then body-only strict wire; no-store/requestId, fatal UTF8/BOM/duplicate decoded root keys and fixed scalar shapes,16KiB streamed cap. Session supplies actor; content never enters URLs/logs/errors. Narrow PersonalMilestoneError400/404/409 is preserved by the existing transaction wrapper; existing closed resource/invariant errors remain503/500. Do not copy transaction/auth/filter frameworks.

Reconcile the current fixed body reader at H2. Reuse its actual bounded lexical primitive with closed milestone scalar shapes, or extract that existing primitive once if naming/coupling requires; preserve search/reference/saved compatibility. No permissive parallel JSON reader, parser dependency or unused future shape.

The later panel consumes its own bounded private list, explicitly ALL_PERSONAL_MILESTONES and independent of inventory query/lifecycle. Current DashboardDataV1/getDashboard metrics and their measured15/17 calls remain unchanged; those historical figures describe that service, not the later whole page plus independent requests. No read-triggered writes, scheduler or capture table.

Why: milestones are personal authored content rather than filtered inventory aggregates. Cost if wrong: the panel has an independent read/refresh state; no cross-panel MVCC promise. Display that scope and do not present a stale list as freshly refreshed.

## P7.40 — source sequence and honest acceptance

Keep the approved5C search →5D saved flows →5E current dashboard sequence. After its reviewed ownership release, issue H1 storage/domain/native, H2 transport/native and H3 real localized panel/browser briefs on fresh BASEs, as proposed in preparation§8. Preserve DE/EN desktop/mobile, CAS/unknown-outcome/privacy/date-only/owned access proofs and prior history/value regressions. Existing money M1–M7, market five-step, Phase09 and Phase10 gates remain separate. H1/H2/H3 close only personal-milestone scope; root decides full Task4 acceptance after the other real producers are integrated.

Why: no parallel source mutators or unfinished shared UI consumers. Cost if wrong: milestone code starts after the current UI milestones, with bounded extra review gates. No source, migration, production action, provider rights, task checkoff or deployment is authorized by this document.
