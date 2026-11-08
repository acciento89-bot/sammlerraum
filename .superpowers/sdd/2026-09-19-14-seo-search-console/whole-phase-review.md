# Whole Phase 14 independent source review — retained findings

Reviewer: /root/sammlerraum_phase14_whole_review (gpt-6-astra/high), read-only whole-range review, one final review only.
Range: 3762e564b3f1416fec02a98267fccfb70e0d6ede..9253e5cdd2c9bdba74e80cc2210be35d12bac4dd.
This record preserves all findings and explicitly declined judgments from the review delivered in the chat; wording below is condensed, not represented as a verbatim transcript. No reviewer ran DB/build/browser/native processes or changed source.

## Strengths and verification
Privacy rules match across discovery and emitted URLs; explicit default-off consent, fresh session/exact-origin/CAS/no-store API, narrow authorized public projections, generic owned UGC OG images, runtime canonical/alternate identities. All 37 referenced whole-source/source-verifier artifact hashes and 18 Lighthouse report hashes independently matched. Retained logs establish 56 focused and compiled groups 4+18+1+4 passing. The 3111 native baseline is correctly historical, preceding final count correction.

## Critical
None.

## Important
1. apps/web/src/components/search/locale-navigation.tsx:47–55 — public collector/profile/collection/item links fall back to localized home. Implement a closed validated collector locale helper; preserve resource identity in both directions and only validated pagination, never arbitrary queries. Add actual compiled navigation tests. Confidence high, direct control flow.
2. public-collector.tsx:72,95 and globals.css:2348–2353 — images lack reserved dimensions/aspect ratio; delayed uncached media shifts following text/links. Reserve deliberate stable area without changing protected media authorization; actual public image fixture and delayed-response position assertions. Confidence high for missing reservation; no CLS runtime measured by reviewer.
3. sitemap-service.ts:59–68 — exact root aggregate counts every eligible item and correlated recursive ancestors, repeating on overflow. Sixteen output rows do not bound examined work; fixed statement2s/transaction5s eventually cause whole index503. Replace exact global counts with threshold/existence or maintained partitions, retain effective-public privacy at discovery, test large hierarchical dataset and query plans/timing. Hardware-dependent production threshold unmeasured. Confidence high.

## Minor
4. CI screenshots/*.png also uploads synthetic authenticated task3 account settings screenshot, contrary to public-page-only whitelist. No demonstrated credential/customer leak. Restrict allowed public filenames; retain account proof locally. Confidence high.

## Required-focus assessment
Private-ancestor child excluded from public metadata/discovery/emitted URLs. Fresh withdrawal removes owned resources from old and new sitemap reads. Authenticated search noindex/stable canonical avoids filter/query traps. UGC OG never fetches private/unlisted media. Stable partition identities and bounded output work; discovery scaling needs correction above.

## Declined to judge / explicitly set aside (all retained)
- Actual deployment/TLS/DNS/Search Console ownership/submission processing/Google-selected canonical: not performed, remain incomplete.
- Final corrected exact-source whole native and remote CI: pending, historical baseline insufficient.
- Precise production sitemap capacity/timeout threshold: not measured; structural issue still reported.
- New profile/item moderation state: only existing comment moderation exists; SEO excludes comments; do not invent publication semantics.
- Interpersonal user blocks as global anonymous publication bans: existing policy does not define that behavior.
- Real UGC photographs in OG: branded fallback explicitly permitted and acceptable.
- Numeric sitemap names: opaque hash-prefix deviation documented and justified, numeric OFFSET not required.
- Overflow503 on an already-discovered segment after concurrent growth: honest fail-closed, distinct from global discovery scaling.
- Production verifier128files/32MiB bound: explicit honest failure rather than partial coverage; larger real deployment needs expanded strategy.
- Noindex/canonicalized old pricing and wrong-language feature aliases: preserves working links without indexing duplicates.
- Missing legal/contact pages: none identified, inventing substantive legal copy not authorized by plan.
- Requests begun before a consent/visibility change: no retroactive cancellation required; fresh reads are supported guarantee.
- All metadata/body/JSON-LD cross-query races: no reviewer concurrency runtime; fresh authorized reads and sequential withdrawal only proven, no globally atomic HTTP snapshot claim.
- Revision exhaustion after roughly two billion writes: schema rejects overflow; not realistic blocker.
- Entire original-media/billing/auth/unrelatedAPI re-audit: integration points inspected; whole old systems outside scope, reused defects affecting this phase not waived.
- Production field Core Web Vitals or exhaustive image layouts: local Lighthouse covers six marketing URLs, PNGs home/coin only; no exhaustive/field claim.

## Assessment
Ready to merge with fixes. Root applies ONE consolidated TDD correction pass, focused verification followed by full exact-source native and required CI. No new reviewer/rereview. Source readiness remains separate from actual deployment and Search Console acceptance.
