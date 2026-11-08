# H3 — private authored milestones in the collector UI

Source candidate: **7dfb127720f07afa5c39477774226f5bd1934b4c**, BASE **9238edd313908a2fb879995df9ebfe2a61339e2b** (product-equivalent to reviewed H2 c7becef). H2 dependency workflows42128741219/job127599585836 and42128732803/job127599565546 both succeeded. Independent H3 review returned0Critical/0Important/0Minor, SPEC PASS and QUALITY PASS. Root locally accepts the exact source after its own fresh checks and the individual adjudication below. Exact remote H3 CI follows the feature-branch push; no main merge, deployment or full Phase07 acceptance is claimed.

## Delivered behavior

An independent, read-only dashboard preview shows up to five personal records, with its own scope, read time, loading/error/stale/empty states. Inventory filters do not filter it. The fresh-authenticated `/{locale}/milestones` manager holds one page of twenty records and exposes First, Next and Refresh. Dates remain owner-entered Gregorian date-only values0001–9999, including future dates; recording/edit times are separate UTC millisecond instants. Titles render as text.

The manager uses actual private HTTP operations and fetched revisions, including same-value updates and confirmed permanent deletion. Its one navigation guard protects dirty, pending and uncertain writes. Known acknowledgements remain acknowledged if the following read fails. Lost/malformed/mismatched responses preserve the submitted context and disable automatic replay. Fresh paged inspection and deliberate adoption resolve conflicts without inventing deletion when a record is absent from the current page. Beginning a write cancels pre-write reads, marks the retained list older and disables existing-row actions until a fresh list is available. Session401 permanently closes old channels and clears private editor/list/receipt/modal state; a normal fresh SSR load keys the UI to the current actor.

Existing request, generation, focus, navigation and keyboard helpers are reused. Only an optional milestone response bound and three known milestone error codes are added to the shared private request helper; existing callers retain their default. The warm visual system remains, with a wrapping language header and scoped disabled-control styling. The new browser suite is in both profiles and the existing CI collector step.

## Actual verification and chronology

All commands use pinned Node24.19.0/pnpm10.17.1, the existing private test environment and external npm cache. Database/browser suites run serially against guarded loopback PostgreSQL17.11 `sammlerraum_test`; only synthetic fixtures are created and erased.

- Actual authenticated absent-preview RED occurs after real HTTP201 fixture creation. The initial grep-only no-tests attempt is retained and is not product evidence.
- State/client stubs produce genuine behavior failures before implementation. A separate identity RED prevents a malformed update draft silently becoming creation.
- Actual committed/lost-create response RED exposes an incorrectly fresh old list; pre-write cancellation/invalidation fixes it. Another actual RED exposes enabled old-row actions; they now require fresh reads.
- Initial expanded run:41PASS/7FAIL. Four locator failures counted visible conflict text and its hidden dialog copy; the test now scopes visible content. Two narrow desktop failures isolate actual language-nav overflow (320viewport/403scroll width). The remaining mobile-DE failure concerns automated pointer coordinates after CSS zoom; viewport/zoom measurement and keyboard navigation are separated, restoring zoom before the later navigation.
- Second run:46PASS/2FAIL, actual desktop CSS200percent header overflow (720viewport/818scroll width). The header now wraps independently of media queries; no hidden-overflow workaround. The targeted stale-action/zoom run genuinely fails both cases before these corrections.
- Expanded third run:64PASS0skip in59.6s. Afterwards only scoped disabled-control styling changes; the following final build/regression covers that final source.
- Final combined browser command runs `search-dashboard.spec.ts`, `personal-milestone-api.spec.ts`, `personal-milestones.spec.ts` and `valuations.spec.ts`: **234PASS0skip in4.4min**. This is156existing collector+2actual HTTP+64new milestone UI+12valuation cases in one invocation. Success/conflict/session/actor cases use real BetterAuth, Next and PostgreSQL. Transport interception is confined to explicit faults/races and committed lost/mismatched responses. It is not physical Safari/iPhone/Duo evidence.
- Final affected DB-enabled command: **9files134PASS0skip**, comprising110native cases and24pure client/state cases. Actual files include H1 service13, H2 route6, dashboard service25/routes12, valuation service17/query27/routes10 and client19/state5.
- Final regular suite: **1307PASS/501explicit DB skips**,93passing/43gated files. Whole-workspace typecheck, lint and production build all exit0. Actual Next build ID `1qrKQKpokfZjzK0fyGJKu` (use the private manifest as exact spelling authority). No schema change or migration is introduced by H3.

Logs retain every failed attempt and final command output under `logs/task-h3-20261106-*`. Forty actual final H3 screenshots and their SHA256 manifest are private under `Artifacts/SammlerraumStatus-20261105/h3-frozen-screenshots/`. The immutable21-file source/build/check fingerprint is `personal-milestones-ui-source-manifest.json` in the same private status folder. Earlier failed browser traces are separately retained privately; no real credentials or production records are used.

## Remaining acceptance

This closes only authored-milestone UI after independent review and root adjudication. Exact new H3 CI still follows the authorized feature-branch push. Full Task4/5/Phase07 and V1 retain actual money M1–M7, market eligibility/rights, sharing and relations integration gates. Count41/91 is unchanged. No automatic goal/achievement, holdings-history ledger, provider activation, main merge, productive deployment or old automation restart is included.

## Independent review and root adjudication

One required independent read-only reviewer inspected all21 changed files and relevant actual helpers, with no source/runtime mutation. Root accepts the0C/0I/0M verdict. Every explicitly set-aside behavior is adjudicated here:

1. Separate management route: accepted P7.41 architecture, not a missing embedded editor.
2. Independent snapshots: actual scope/read-time labels are truthful; no shared MVCC promise.
3. Refresh/paging during editing: preserves protected editor state; list/inspection alone changes.
4. Same editor after definite rejection: retains real CAS, with conflict/not-found disabled; another existing selection requires a fresh list.
5. Clean/empty navigation: no actual content loss; busy/unknown protect independently.
6. Clean same-value adoption: explicit user action discards no changed input; dirty/unknown still confirm.
7. Delete cancellation: retained target performs no mutation and is replaced on deliberate later selection.
8. Unknown-delete inspection: settled dialog Cancel closes only the dialog; protected unknown remains and main inspection is then accessible. This satisfies single-modal recovery.
9. Unknown-create matching: never inferred resolved from a similar row; a new operation requires deliberate discard.
10. Known acknowledgement/read failure: receipt remains separate and truthful.
11. Superseded/pre-write reads: cancellation plus generation check and actual fault/race proof retain freshness semantics.
12. Session/actor: channels permanently close and visible private context clears; fresh actor-keyed SSR is proven. A new cross-tab identity synchronization framework remains deliberately outside this change, not claimed implemented.
13. Title maxlength240UTF16: permits all valid120-code-point titles; exact NFC/code-point/byte contract remains authoritative before network.
14. Dates/instants: date-only values and separate UTC millisecond instants retain their different meanings.
15. Response cap:64KiB is an acceptance check after the existing helper reads text, not a new streaming/memory-allocation guarantee. Existing callers are unchanged; no unsupported hard client-memory bound is claimed.
16. Deferred get-one/trash/audit/goals/relations/value/sharing/market features: retain their actual original gates; no scope-based full-V1 waiver.
17. Browser/device/exact CI: both configured Chromium profiles are proven; physical Safari/iPhone/Duo is not claimed, and exact new H3 CI remains a separate gate.

Root releases H3 source ownership on immutable7dfb127 or the following evidence-only product-equivalent head. Under P7.14 the next explicitly scoped M1 contracts/parser work may proceed while exact H3 CI runs; hold its dependent push/completion and stop affected work on any H3 CI failure. No extra91-task count is created.
