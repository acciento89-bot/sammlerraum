# Single whole-phase static review

Reviewer: premium_billing_whole_phase_review (fresh context, read-only, no runtime or delegation).
Range: 8957121f7698067415c8271514c6aff09be89c64..e1b58103d789381aab4dc1b45c00adaca252a16b.

## Strengths

Clear local ownership and session boundaries; closed checkout inputs and no entitlement from redirects/metadata. Durable receipts, leases, canonical reconciliation and recovery dispatch address duplicates/reordering/interruption. Quota fences cover actual writes, collaborators, restores/transfers and uploads; immutable AI admission separates consumption from retention. Explicit policy/provider namespaces and SDK source prices avoid production defaults and test entitlement bypasses. Free content is preserved honestly.

## Critical

None found.

## Important

1. packages/billing/src/stripe-sync.ts:212. Full refunds use invoice.period_end. The installed SDK defines this as invoice-item association time and directs consumers to line-item service periods. At issuance it may equal currentPeriodStart; entitlement currentPeriodStart >= riskThrough then leaves refunded Premium active. Resolve matching subscription invoice lines with bounded pagination. Witness adapter to entitlement when association time equals start and purchased line ends later; retain historical-refund/new-paid-period witness.

2. packages/domain/src/items/item-service.ts:525; imports/import-commit-service.ts:56. PLAN_LIMIT_REACHED is BillingError, not recognized as permanent in approved import commits. Worker leaves COMMITTING; dispatcher repeatedly selects it and UI remains stuck. Handle plan rejection via existing revision protection, retain earlier batches, stop blind dispatch and show actionable stopped outcome. Distinguish dependency/config failures. Test within-batch excess and a later batch after committed work.

3. packages/domain/src/search/search-selection.ts:70; exports/export-service.ts:201. Advanced-filter entitlement applies in source selection but not job admission; Free creates jobs/assets then worker treats BillingError as retryable until exhaustion. It also breaks previously admitted Premium jobs after expiry, contradicting preserved completion. Check before enqueue. Preserve verified admission while ownership/source/freshness remain checked. Test Free rejection with zero jobs/artifacts and completion after downgrade.

4. packages/domain/src/billing/admission.ts:63; billing-overview.ts:48; apps/worker/src/jobs/private-artifact-repository.ts:107. Every MediaAsset is counted, but worker creates generated CSV/XLSX/PDFs and retry attempts there. A Free export can consume the first photo slot/bytes, outside the quota fence, contradicting original-upload policy/copy. Use a consistent uploaded-original definition excluding generated artifacts while retaining pending/failed uploads. Build an artifact and verify actual usage/remaining upload capacity.

## Minor

None separately identified.

## Declined to judge

- Exact prices/limits are deployment configuration, not invented.
- Past-due downgrade and persistent dispute/fraud holds are recorded policy.
- Checkout reservation/cutoff and config conflicts are intentional purchase safeguards.
- Unsupported denominations deliberately unavailable.
- Full account erasure endpoint absent; external cancellation remains release gate.
- Alternative operator invoice/split arrangements outside specified hosted flow; no external config inspected.
- Dashboard discarded aggregates: no demonstrated availability issue warranting optimization.
- Accepted licensing/AI phases examined only at new integration boundaries, not reopened.
- Runtime results/screenshots/exact CI not independently run; root gate remains.

## Assessment

Not ready: fix the four Important findings. Core boundaries strong; refund semantics and asynchronous integration have observable defects. Add focused witnesses, consolidated green suite and exact remote CI.

Root disposition is separately recorded in whole-review-disposition.md. No rereview requested.
