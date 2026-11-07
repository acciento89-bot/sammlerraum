# Phase 03 Task 7 fix-round-1 scoped rereview

- Reviewed base: `ddcd8e4`; candidate: `22d5b71` (the current later HEAD adds only review/report documentation).
- Scope: the nine findings in `task-7-review.md` and breakage introduced by `review-ddcd8e4..22d5b71.diff`. No prior-phase or whole-branch review, no code changes, and no suite reruns.
- Verdict: **SPEC FAIL / QUALITY FAIL** pending the two open findings below. R1, R2, R3, R5, R6, R8, and R9 are addressed; R4 and R7 are not fully addressed.

## Open findings

### R4 — NOT ADDRESSED (P2): Collection request failures still strand management UI

`apps/web/src/components/items/item-form.tsx:143-179, 188, 389-400, 639-640`: a collection-dependent nodes/custom-fields request failure leaves `optionsCollectionId` empty. The basic fieldset, including the collection selector, remains disabled, and the save guard rejects submissions. There is no retry for those requests; on a new item, changing collections after filling other inputs and encountering a transient failure requires a page reload and loses the draft. In addition, `apps/web/src/components/collections/collection-detail.tsx:56-83, 112-122` catches a rejected initial load but retains `data === undefined` and displays the loading status indefinitely alongside the error. The original R4 expressly required collection loading/mutations not to leave an endless loading indicator. Provide a retry/recovery path and a distinct failed-load state; keep the collection selector available while dependent options are unavailable. The core save catch/finally and `Promise.allSettled` metadata handling at `item-form.tsx:234-306` do address the item mutation and successful-location-baseline portions of R4.

### R7 — NOT ADDRESSED (P3): Saved INTEGER summaries remain unlocalized

`apps/web/src/components/items/item-form-values.ts:87-105` localizes DATE, DECIMAL and MONEY, but INTEGER falls through to `String(value)`. A saved integer 1234567 displays as `1234567` in both DE and EN instead of locale-formatted `1.234.567` and `1,234,567`. `apps/web/src/components/items/item-form.tsx:833-838` supplies the field type and locale, so the missing INTEGER branch is the remaining gap. Canonical design section 25 requires locale-aware numbers. Preserve the exact safe integer while formatting it for display.

## Finding disposition

| Finding | Disposition | Evidence |
| --- | --- | --- |
| R1 nested node reset | **ADDRESSED** | Controlled node state initialized from the loaded item (`item-form.tsx:83, 110-115`), option readiness gate and collection-change reset (`143-179, 188, 389-425`). The delayed-node E2E checks persisted `nodeId` (`collections-items.spec.ts:376-469`). |
| R2 saved currency replacement | **ADDRESSED** | Both selectors use the contract-aligned supported ISO list (`item-form-values.ts:6`; `item-form.tsx:503-510, 785-791`); minor-unit scale comes from currency fraction digits (`item-form-values.ts:8-42`). |
| R3 integer exponent truncation | **ADDRESSED** | Complete `Number(input)` and safe-integer check (`item-form-values.ts:45-49`), used for INTEGER serialization (`item-form.tsx:681-683`). |
| R4 network failure and retry | **NOT ADDRESSED** | Item mutation handling and settled metadata requests improved (`item-form.tsx:234-306`), but collection-dependent errors strand the form and detail initial load remains in loading state, as above. |
| R5 comma-containing tags | **ADDRESSED** | Escaped comma/backslash codec (`item-form-values.ts:51-75`) is used for loading and saving (`item-form.tsx:220, 530-532`). |
| R6 incomplete ARIA tree | **ADDRESSED** | Native nested `ul/li` with native disclosure summary replaces unsupported tree roles (`collection-detail.tsx:378-402, 451-454`). |
| R7 localized saved values | **NOT ADDRESSED** | DATE, DECIMAL and MONEY covered (`item-form-values.ts:77-104`), but INTEGER is not, as above. |
| R8 scanner stream leak | **ADDRESSED** | Synchronous starting guard, generation invalidation, late acquisition disposal and stream stop (`code-scanner.tsx:30-104`). The proposal still requires explicit confirmation (`130-144`). |
| R9 writes before validation | **ADDRESSED** | All custom values are parsed before the core request and metadata PUTs (`item-form.tsx:192-237`); started metadata writes are settled before retry (`256-305`). |

The diff inspection found no separate introduced breakage beyond the incomplete R4/R7 fixes. Existing local evidence is 233 passing unit tests with 20 database-dependent skips and passing lint/typecheck/build. Remote pre-fix browser RED supports R1/R4/R6/R8; the production candidate's full remote browser and controller CI GREEN remain pending. That gate status is separate from the code findings above.
