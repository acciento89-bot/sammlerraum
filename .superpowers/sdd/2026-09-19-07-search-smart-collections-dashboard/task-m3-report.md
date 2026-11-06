# M3 personal authoring, split provenance and HTTP boundary

Parentfd474022246416e9ef07d95d3535130e4f77b28a; both exactM2 CI runs42153461018 and42153457206 now SUCCESS. Root is the sole mutator/runtime owner. The applied M2 migration is unchanged. Root review closure adds one forward-only M3 correction-audit migration; no production operation or main merge. Count41/91 unchanged.

Implemented approvedM3: strict personal create/update/custom envelopes, six core personal service operations plus private item/bulk/history reads, actual shared transaction-body reuse, native generation-bound AUTHOR, current-token conflict semantics, known/unknown split provenance, bounded private history/historical revocation and eight thin paths/11HTTP operations. Existing public item DTO/legacy raw validation is unchanged; the old custom owner predicate is explicit and the original quantity split atomically carries meaning.

Actual RED evidence: two loadable personal-service stubs failed real create/update expectations; three split failures proved known/custom meaning was lost and injected COPY failure did not affect the old workflow; a loadable history stub failed expected paging; two actual HTTP stubs failed201/fresh-auth/origin expectations after a separately retained fixture syntax failure was corrected. One older simulated per-unit split test needed an explicit simulated legacy fact response for the newly exercised SQL seam; actual COPY correctness and rollback are separately proved with PostgreSQL, not that simulation. An attempted inconsistent item-owner tuple was already rejected by the existing composite FK; that fixture failure is retained separately in the history log and is not called a product defect. The final ownership test asserts the native rejection and an actual legitimate foreign target failure.

Current local evidence on frozen candidate:94focusedPASS/0skip across5files, including competing classify/replace and clear/replace winners, concurrent split/replace raw-receipt coherence, author insertion rollback, custom COPY once per field, clear/readd stale tokens, private historical paging/revocation, fresh HTTP auth/no-store/requestId, origin-before-session, nested duplicate/Unicode/body caps and foreign hiding.1342purePASS/559explicit native skips, whole lintPASS, whole production buildPASS and root tscPASS. Full native regression and independent review still gate acceptance. M4–M7/UI/coverage/captured values and V1 remain open.

## Independent findings and root closure

The single independent `/root/sammlerraum_m3_review` seat reviewed immutablefa828717 and returned0Critical/2Important(P2)/0Minor; SPECFAIL for silently discarded correction audit text and QUALITYFAIL pending that plus a bigint-overflow history cursor. Its original verdict is retained, not relabelled as an independent zero-finding pass.

Root accepts both. Actual regression requests reproduced a successful REPLACE with reasonNULL in purchase/custom history and max+1 history cursor producingHTTP500. Reasons now pass through the strict AUTHOR assertion into private audit metadata. Because M2 SQL was already applied, root added forward-only20261106043000_author_correction_audit, never changed the applied file. AUTHOR reasons are bounded/nonempty; human-note erasure clears actor/reason/time evidence while preserving the pinned receipt and interpreted financial meaning. Existing actor-only AUTHOR erasure with no human note is unchanged. An extra native RED proved that actor-only removal could orphan a new human note; the forward guard now forbids that incomplete transition. Actual catalog UserFK erasure proves reason removal/receipt/raw/exponent retention. Purchase/custom self-erasure proves both remain interpreted with their correct decimals and the actual erasure-state token changes. Cursor and recorded-event sequence validation now reuse the existing signed-bigint-bounded money sequence plus a positive requirement; actualHTTP max200/max+1=400 proves the SQL cast is never reached for overflow.

Corrected local full-native proof:670PASS/58files/0skip (98.95s), including both independent findings' regressions and the native correction privacy case.1342purePASS/561explicit native skips, full lintPASS and whole production buildPASS. Supplemental real-Next browser proof is running separately; root tsc includes the supplemental test. Both M2 exactCI runs42153461018/42153457206 SUCCESS; M3 exactCI remains open until its corrected source is pushed.

Each declined behavior was independently adjudicated by root:

1. Separate raw/AUTHOR commits: no; both remain in the one actual outer transaction, with injected AUTHOR failure proving raw-item rollback.
2. Facts crossing adapters: no; one actual transaction adapter is reused; M2 rejects another adapter/transaction identity.
3. Assumed generation: no; actual native persisted generation is read before assertion.
4. Equal REPLACE retaining generation: no; explicit raw columns trigger rotation, stale token regression passes.
5. RETAIN/omission invalidation: no; monetary column names are omitted, title-only token remains stable.
6. Intl overriding pinned profile: no; strict explicit paths use the pinned receipt; legacy wrappers retain their existing prospective validators.
7. Unknown split becoming known: no; raw-only destination remains UNKNOWN; no invented assertion.
8. COPY failure committing split: no; injected native COPY error proves quantity/child rollback.
9. Split minting evidence: no; flattened source/origin lineage and accepted invalidation guards are retained.
10. Changed per-unit price/copied valuations: no; exact total40 survives3+7 split and valuation history is not copied by the existing workflow.
11. Cursor granting history authority: no; actual owner/live parents/customMONEY scope precedes decode and is repeated in the page query.
12. Revocation only for current generation: no; older named assertion preconditions remain usable after raw replacement.
13. COPY revocation tokens: no; only original AUTHOR/CLASSIFY entries receive them.
14. Unbounded history/offsets: no; default20/max50, limit+1 sequence/id keysets, bounded projections and1MiB cap. The independently found numeric overflow is now separately fixed, not set aside.
15. Foreign Origin reaching session: no; actual test checks zero session reads on rejection.
16. Browser GET requiring Origin: no; absence is allowed for GET; explicit foreign Origin rejected.
17. Stale cookie authentication: no; fresh dependency query disables cookie cache and refresh.
18. Nested duplicates/UTF8/body excess reaching writes: no; existing bounded scanner/copier and fatal stream boundary are reused; real requests reject before mutation.
19. Thin route wrong subject: no; all eight files forward the correct item/field and operation; supplemental actual-Next journey exercises all operations.
20. Public evidence expansion: no; public DTO whitelist is unchanged, private endpoints require session and actual owner.
21. Inconsistent-owner old exploit: no; native composite FK already rejects the synthetic tuple. Explicit query hardening is not misreported as an exploited old state.
22. M4–M7/UI/canonical consumers: accepted out-of-scope; all remain open, no completion credit inferred.
23. Applied M2 SQL changed: no; unchanged hash/checksum is required. Root's needed audit extension is an explicit separate forward migration with its own native proof, not an edit or silent bypass.

M3 is not finally accepted until the corrected browser/type evidence and root source verification are recorded; no production deployment or full financial cutover is claimed. Count41/91 unchanged.

## Root local acceptance on corrected source

Supplemental actual Next production-browser proof26PASS/0skip (26.3s) on desktop+mobile: existing collector CRUD plus cookie-authenticated creation/read/update/customPUT, both classification/history paths, both revocation paths, historical revocation after replacement, correction reason persistence, current receipt retention and logged-out denial. Root tsc after adding that testPASS. Whole corrected buildPASS; native670PASS/58files/0skip; pure1342PASS/561explicit native skips; lintPASS. Both owned-test migration checksum records match exact source; original appliedM2 file unchanged. Root manually compared the forward trigger to M2: only declaration and the three intended AUTHOR-note insertion/erasure conditions differ. Independent original2P2 findings are closed by root with actual RED/GREEN evidence; original reviewer verdict is retained above. No second review seat or blind rerun. M3 is locally accepted; exact corrected-head remoteCI remains the next gate. M4–M7 and broader V1 stay open; count41/91 unchanged. No production or main merge.
