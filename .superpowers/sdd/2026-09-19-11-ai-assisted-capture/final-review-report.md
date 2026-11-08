# One fresh whole-phase review — source77b69f9..27b51c8

Reviewer /root/sammlerraum_ai_capture_final_review, gpt-6-astra xhigh, read-only, no runtimes/changes/subagents. Verdict **With fixes**,0Critical,1Important,3Minor. Root's consolidated disposition follows; no rereview will be dispatched.

## Report

1. Important — analysis-review.tsx:183, with131–148: Poll can receiveREADY while cancel is in flight, starting a review request. A later cancellation acknowledgment also returnsREADY, increments generation and discards that one review response; unchanged ID/status means no replacement effect. Ready status but no controls/retry until reload. Preserve stale guards and explicitly restart ready-review loading; deterministic held-response browser witness.
2. Minor — suggestion-apply-service.ts:326: parseItemIdentifiers rejects combined array length>100 before deduplication. At100existing, accepting a duplicate addition fails although final unique cardinality stays100, rolls back accompanying metadata, and unmapped IdentifierServiceError yieldsHTTP500. Deduplicate before final cardinality and map selection errors.
3. Minor — analysis-review.tsx:218: Initial captureGET failure leaves capture/job null; retry action requiresREADYjob. No in-page recovery after connectivity resumes. Add owned capture reload/resume action.
4. Minor — ai-analysis-service.ts:296: Pre-analysis personal title is sole catalog retrieval condition. Generic/nickname/translated titles yieldno candidates even with visible identifiers. Consider bounded local retrieval from extracted identifiers/proposed metadata and disclose limitations.

Strengths: immutable advisory proposals separate from explicit personal mutations; ownership/source snapshot/processed-image checks before send and commit; real canonical transaction/audit composition; bounded tokens/attempts/retries/immutable decisions/nullable late usage.

Declined to judge: live model quality/compatible configured model/pricing/paid activation/deployment/exactCI; impossible recall of already transmitted bytes; hypothetical abort-ignoring-forever provider (not demonstrated in actual official/native transport); quota retention after physical item/collection erasure (no exposed permanent erasure quota-bypass path found; needs ruling before billable enforcement); old shared-search/older phases except changed-helper regressions. No test runs claimed by reviewer.

## Root severity and correction rulings before edits

1. Important accepted. The user can lose all ready-review controls through a normal completion/cancel race. Correct in this ONE consolidated pass with a deterministic held-review/late-cancel browser test RED→GREEN.
2. Regrade Important: a valid duplicate confirmation at a supported boundary returns500 and prevents the rest of an otherwise valid atomic selection, not merely cosmetic behavior. Canonicalize/deduplicate existing/additions separately, enforce actual resulting cardinality, retain original identifiers, and map canonical identifier errors toAI_INVALID_SELECTION. Native100-existing duplicate+title and malformedvisible-identifier rollback witnesses RED→GREEN.
3. Regrade Important: one normal initial transport failure makes the entire capture/recovery entry point unusable in-page, including an existing pending job. Existing application journeys explicitly support recovery; add a bounded manual reload that restores latest-job progress without automatic resubmission or permission changes. Actual503→realGET recovery witness RED→GREEN.
4. Regrade Important: matching is a named photo-capture capability, but the normal new/unidentified-item path cannot use even an exact recognized catalog identifier when its personal title differs. Add bounded local advisory retrieval from immutable extracted identifiers/proposed title, separately tagged from model candidates. Do not invent model confidence, provider UUIDs or automatically link. Derived review choices must be baseline-bound/current-reference validated and separately explicitly selected; preserve immutable provider result/schema and no additional photo/provider I/O. Placeholder-title + exact-visible-code actual-native witness RED→GREEN, typed ambiguity bounded, existing fields untouched until selection.

All four now enter the same consolidated correction pass; no genuine Minor remains deferred. These are final root effect-based grades, not a request for another review.

## Declined-to-judge rulings

- Ruling: live quality/model selection/activation/pricing/deploy remain outside source authorization. Require explicit compatible config; do not claim live acceptance. Cost if wrong: a future incompatible model can fail safely, and operator must validate before activation. ExactCI will be real and separately recorded.
- Ruling: already transmitted bytes cannot be recalled. Preserve fresh checks immediately before sending and reject stale publication; cancellation does not promise reversal of external processing or free usage. Cost if wrong: privacy promises would overstate what cancellation can achieve; current text makes no recall promise.
- Ruling: continue awaiting actual settlement rather than detaching an ignored abort and freeing a live call. Current official SDK/native transport has bounded timeout/signal behavior; any future provider must demonstrate settlement conformance. Cost if wrong: a broken future transport could retain a claimed job/worker and require operation recovery, rather than silently allowing overlapping paid work.
- Ruling: current per-request counts are job-backed and erasure is not an exposed present bypass. Before Phase12 enforcement, preserve owner/period admissions independently of physical item/result deletion; never bill from nullable result rows. Cost if wrong: an eventual hard-delete feature could reset a cost quota. This is explicitly carried into billing preflight, not claimed resolved by this phase.
- Ruling: do not reopen accepted shared/older plans; run full regression on changed helpers and retain immutable historical proof. Cost if wrong: a genuine introduced regression must still be fixed here; old independent scope is not silently re-audited.

## Pre-correction verification

Source27b51c8:1689regularPASS/1203explicit native-disabled;2892nativePASS/zero skips,262files266.75s; roottypes, entireworkspace formatting, worker+web optimized buildPASS; dedicated24compiled AI journeys28.8s; final46AI+adjacent inventory journeys52s. These are baseline gates, not post-correction acceptance or remoteCI. Existing69migrationfiles byte-identical (68SQL+lockfile). Two newly generated old report variants retained under this phase, exact original bytes restored. Seven obsolete own ai-fixtures in guarded disposable browserDB cleaned; no customer data/files affected.

## Final consolidated disposition

Final: fixed READY/cancel review-generation race — deterministic held-review/late-cancel browser witness RED→GREEN; corrected compiled AI32/32, native2899/2899.
Final: fixed100-existing duplicate identifier false overflow and unmapped malformed selection500 — actual boundary/title and invalid-code rollback witnesses RED→GREEN; corrected native2899/2899, no skips.
Final: fixed initial capture failure no-recovery — real503→in-page reload/latest pending job browser witness RED→GREEN; corrected compiled AI32/32.
Final: fixed photo catalog matching with placeholder personal title — exact extracted identifier/proposed title native witnesses RED→GREEN; bounded derived choices/current-reference retirement/actual2000-entry index regression PASS; corrected native2899/2899.
Final consolidated gate: regular1689PASS/1210explicit native-disabled, native2899PASS/zeroSkip/262files262.55s; roottypes/workspaceformatting/workerbuild/optimizedwebbuild PASS. Corrected compiled32AI journeysPASS36.2s; preceding46AI+adjacent inventoryPASS52s. All69prior migration bytes unchanged; one additive exact-title index. One reviewer, one correction pass, no rereview, no deferred minors. Full report and local receipt retained; source-only, no provider activation/deploy. Canonical67/91 until exact candidate remoteCI success.
