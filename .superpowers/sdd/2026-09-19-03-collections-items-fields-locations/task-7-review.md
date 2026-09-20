# Phase 03 Task 7 independent SPEC + QUALITY review

- Base: `5180e068028f4b6c6fff9d1c719400c8263eee89`
- Reviewed head: `ddcd8e4d0e10eeab1f36ffc2f20b61cca77554e4`
- Brief/report/diff checkpoint: `f9fc99d68edc5bc4284e684d28f774e50552fcaf`
- Verdict: **SPEC FAIL / QUALITY FAIL**.
- Scope: Task 7 only. No implementation changes, no prior-phase reopening, no full-branch review.

## Evidence and limits

Read the complete 16-file task diff in four consecutive ranges (all added file lengths match their diff headers), the Task 7 brief/report, relevant canonical design sections and prior ledger rulings. Checked the current item/custom-field contracts and layout. Independently verified run 35544063289 has head ddcd8e4 and conclusion SUCCESS, and job 106166749645 has successful normal gates with the formatter diagnostic SKIPPED. The report's detailed test counts are accepted evidence; this review did not rerun browser, database, or workspace suites because the execution environment is offline.

The scalar JavaScript checks below were evaluated in orchestration: `Number.parseInt("1e3", 10) === 1` versus `Number("1e3") === 1000`; joining/splitting `["Washington, D.C."]` yields `["Washington", "D.C."]`. Other findings are source/control-flow review, with targeted regression scenarios specified rather than falsely claimed browser reproductions.

## Must-fix findings

### R1 — P1: Editing an existing nested item can silently move it to the collection root

**Evidence:** `apps/web/src/components/items/item-form.tsx:123-148, 366-373`.

The initial item load clears `loading` before the separate collection-dependent nodes request completes. The form mounts its uncontrolled `select name="nodeId" defaultValue={item?.nodeId ?? ""}` while the only option is the collection root. The requested node is unavailable at mount, so the root is selected. Adding options later does not reinitialize an uncontrolled select's default selection. A subsequent title-only save always includes that selected value as `nodeId: null`.

Keep the selected node in controlled state, or wait for its options before mounting the initialized form. Also prevent saving against stale collection-dependent options when changing collections. Regression: open an existing nested item with the nodes response delayed, edit only its title, and assert its node survives the PATCH and reload. The current E2E edits a nested item but never asserts that node persistence.

### R2 — P2: Valid saved currencies are silently replaced with EUR

**Evidence:** `apps/web/src/components/items/item-form.tsx:453-458, 729-734`; authoritative `packages/contracts/src/items.ts:49-58`.

Both purchase and MONEY field selectors list only EUR/USD/CHF/GBP, while the API accepts supported ISO currencies. An existing JPY (or CAD, etc.) value has no matching default option. The uncontrolled selector falls back to EUR, and a title-only save resubmits the original amount under EUR.

Offer supported currencies, or at minimum preserve every loaded canonical currency as a selectable option. Regression: create an API-valid nonlisted currency purchase and MONEY custom value, open and save an unrelated change, and assert both currency codes remain unchanged.

### R3 — P2: INTEGER fields silently truncate valid exponent-form input

**Evidence:** `apps/web/src/components/items/item-form.tsx:626-627, 739-759`.

The control is `type="number" step="1"`, which accepts exponent syntax for integral values, but serialization uses `Number.parseInt`. Entering `1e3` passes number/step validation and saves 1 rather than 1000. This is an observed JavaScript conversion result, not an inferred server issue.

Parse the complete numeric value and validate safe integer bounds before sending it. Regression: enter 1e3 and assert either explicit validation rejection or canonical 1000, never 1; include a negative exponent spelling that represents an integer.

### R4 — P2: Network failures strand the form and defeat metadata retry

**Evidence:** `apps/web/src/components/items/item-form.tsx:170-210, 260-280`; similar uncaught fetches in collection mutations.

`saving` becomes true before the core fetch, but neither that fetch/JSON read nor metadata `Promise.all` is inside a catch/finally. Any rejected request escapes without resetting the state or displaying a localized failure. Save and all editable fieldsets remain disabled. If one metadata request rejects while the location succeeds, the successful location result is also never processed because Promise.all rejects early.

Handle transport/parse failures and release saving in a finally path. Collect settled metadata outcomes so successful location assignments update their baseline even when another request rejects; retain the already-created ID. Regression: reject a core request and separately reject one metadata request while location succeeds, then prove an enabled retry updates the same item without repeating the successful location assignment. Apply equivalent error handling to collection loading/mutations so a rejected fetch does not leave an endless loading indicator or unhandled action.

### R5 — P2: Unchanged valid tags containing commas are destroyed on save

**Evidence:** `apps/web/src/components/items/item-form.tsx:222-225, 479`; `packages/contracts/src/items.ts:188-198`.

Tags permit commas in the canonical API. The UI serializes the stored array with join(", ") and parses it with split(","). Thus the valid single tag `Washington, D.C.` becomes two tags merely by opening the item and saving its title. The scalar transformation was reproduced in orchestration.

Use separate tag entries or an escaping/parsing representation that round-trips canonical names. Regression: preserve comma-containing tags on an unrelated edit, alongside ordinary multiple tags.

### R6 — P2: ARIA tree semantics are declared without a usable tree keyboard model

**Evidence:** `apps/web/src/components/collections/collection-detail.tsx:373-391`.

RecordTree declares tree/group/treeitem roles and expanded state, but treeitems have no focusability, active descendant, or keyboard handlers. Keyboard users cannot enter and navigate the advertised tree with tree navigation keys. Native details controls inside each item are tabbable, but do not implement the surrounding ARIA tree interaction. Task 7 explicitly requires accessible tree/navigation controls.

Either use nested native lists/details with their native semantics, or implement a complete focus/keyboard model for the ARIA tree. Add a focused keyboard test for the selected approach. Do not retain tree roles solely to support E2E locators.

### R7 — P3: Saved field dates, numbers and money are not localized

**Evidence:** `apps/web/src/components/items/item-form.tsx:769-775, 794-799`; canonical spec section 25.

ItemSummary calls displayValue without locale or field type. It renders dates as raw YYYY-MM-DD, decimals with a dot, and money as e.g. 12.34 EUR in the German UI. The canonical spec expressly requires locale-aware date, number and currency display. Canonical wire values and editable canonical inputs can remain unchanged; the saved read-only summary must format according to locale and field type without sacrificing Decimal/money precision.

Regression: render DATE, DECIMAL and MONEY summaries in DE and EN, assert the appropriate locale differences, and retain exact maximum-safe-cent and high-precision Decimal values.

### R8 — P2: Repeated scanner start can leak a live camera stream

**Evidence:** `apps/web/src/components/items/code-scanner.tsx:43-48, 58-68, 104-112`.

Start remains enabled and `scanning` stays false until getUserMedia and play resolve. Two clicks during that asynchronous interval start two camera requests. Each resolution overwrites the one `stream.current` reference; stop/unmount can stop only the last stream, leaving the earlier stream's tracks live.

Guard the starting phase synchronously, retain and dispose every acquired stream, and invalidate late results on stop/unmount. Regression with deferred getUserMedia promises: invoke start twice before resolution, then stop/unmount, and verify every acquired track is stopped and no second active scan survives.

### R9 — P2: Local custom-field validation returns while earlier writes are still running

**Evidence:** `apps/web/src/components/items/item-form.tsx:200-248`.

The core mutation and identifiers/tags requests start before customValue parsing is complete. Each preceding custom field also starts its PUT immediately. If a later enabled MONEY value throws (for example an empty amount), the catch returns and re-enables Save without awaiting those in-flight writes. A corrected retry can overlap them, so an older request can finish after the corrected request and overwrite it. The UI reports only a field-validation error despite already persisting other edits.

Build and validate the entire client payload before starting any mutation. Once requests start, always await/settle them before enabling retry. Regression: delay an early metadata PUT, make a later MONEY field invalid, and assert no mutation was issued before validation succeeded.

## Accepted implementation and rulings

Authenticated fresh-session page wrappers, DE/EN system copy, private defaults, manual identifier fallback, scanner proposal confirmation, explicit public description/private notes separation, per-unit purchase label, BigInt input conversion and quotient/remainder money display, owner-only API boundary, and the successful-location baseline for ordinary HTTP error responses are present. All ten field controls exist; the findings concern canonical mapping and UI lifecycle rather than missing type enumeration.

The failure-only formatter diagnostic is correctly conditioned on failure() AND the original lint outcome being failure, emits only explicitly allowed Task 7 files, and does not turn a failed lint gate green. It was skipped on the verified green run. No lint-bypass finding.

No finding is raised against prior-phase authorization, protected metadata projection, accepted CI/TDD recovery evidence, or the unrelated intermittent authentication timing behavior. Same-route metadata refresh was considered but is not elevated to a finding without proving whether the provider identity changes on refresh; an explicit refresh is preferable, but that alone is not a must-fix claim here.
