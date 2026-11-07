# Task5B1 — private search/dashboard POST transport

Preparation only. No source GO until root supplies a fresh BASE after Task4 review. This is the first half of Task5B, not completion of original Task5 or Phase07.

## Binding constraints

- Filter definitions are structured, versioned data, not arbitrary SQL or free-form query strings.
- Search never returns items the actor cannot view.
- Smart Collections contain no duplicated item rows.
- Large/complex filters have bounded depth and clause count.
- Dashboard values remain separated by currency/source where aggregation is unsafe.

Read task-5b-context.md rulings P7.28–33 and task-5b-contract-preparation.md sections1–3,8–9. The following narrows their combined proposal to B1. B2 references/catalog modes and all frontend work remain outside this source task.

## Deliverable

Add POST to actual existing `/api/v1/search/items` and `/api/v1/dashboard`, calling their actual existing service once with the same actor and normalized query as GET. Preserve GET compatibility and response DTOs/errors. Search POST accepts only `{text?,f?:string|null,lifecycle?,limit?:number,cursor?}`; dashboard only `{text?,f?:string|null,lifecycle?}`. Defaults: empty text, null filter, ACTIVE, search limit20/no cursor. Limit must be a JSON safe integer1..50. Reject unknown keys, owner/scope/context overrides, raw AST objects, invalid lifecycle, invalid cursor, empty f and string `"null"`. Use actual existing parsers, not approximations; preserve text200codepoints/800UTF8bytes before/after normalization, f16KiB raw/canonical, depth5/leaves50/structural512 and other actual limits.

New browser-safe `contracts/private-search-query.ts` with package subpath: `PRIVATE_SEARCH_MAX_BODY_BYTES=32768`, `parsePrivateItemSearchWire(input):NormalizedItemSearchQuery`, `parsePrivateDashboardWire(input)` returning actual normalized dashboard input. Reconcile actual reviewed Task4 `parseDashboardQuery` and `createDashboardService(...).getDashboard({userId},input)` exports before implementation; do not create parallel dashboard normalization or pagination fields. Raw f must reach `parseItemFilterJson` intact, including valid10001–16384-character strings; outer envelope must not inherit the filter scanner's10000UTF16 string guard or16KiB envelope cap.

New private web `api/read-search-body.ts:readSearchBody(request,shape)` supports only ITEM_QUERY and DASHBOARD_QUERY in B1. Both use actual streamed `readBoundedBody`32KiB, explicit leading BOM rejection before fatal UTF8 decoding hides it, fixed scalar-envelope lexical precheck for decoded root-key duplicates/unknown keys, then JSON.parse. Root must be a plain object, no nested arrays/objects outside opaque quoted f. Recognize escaped equivalent key names and escaped quotes/backslashes; text within f is never interpreted as outer punctuation/keys. Precheck is not a second generic JSON grammar, no new parser dependency or changes to filter scanner. JSON.parse validates full syntax; sanitized errors expose no tokens/body/labels. No unused reference-shape branches. Existing Smart Collection mutation parser is unchanged and receives no claimed duplicate-key fix.

Fixed POST order: exact configured APP_ORIGIN Origin (missing or different403), fresh session (`disableCookieCache:true,disableRefresh:true`, absent401), body-only query validation via actual `readItemSearchQuery(request,[])`, application/json with optional parameters, body/wire parsing, actual service. Actor only from fresh session. Bare `?` remains empty per GET decoder. No query body fields in request URLs/logs/errors. Success and error no-store/requestId. Preserve actual transport413 UPLOAD_TOO_LARGE and414 SEARCH_QUERY_TOO_LARGE; malformed outer body/media-type/UTF8/duplicates=>400 SEARCH_INVALID, inner filter retains its existing closed codes, actual service errors stay unchanged. No auth/error framework or retry-loop copy.

Search GET and POST with the same normalized query share existing real cursor identity; saved-resolution cursors retain their own context and cannot replay. Dashboard POST invokes real aggregate service, never aggregates search page rows. No metric/producers/schema/index/runtime budget changes, no fake availability or truncated success.

## Proof and completion contract

Before implementation capture meaningful behavioral RED (existing route rejecting required POST/actual adapter missing behavior, raw-f duplicate or large-valid-f behavior), not only missing-module startup. Add focused wire/reader tests for literal/escaped duplicates, quoted punctuation in f, prototype-looking/unknown keys, root null/array/nested objects, malformed syntax/numbers/trailing data/control/BOM/fatal UTF8; actual32KiB streaming boundaries independent of declared Content-Length; valid f10001..16384 chars and raw/canonical filter caps, inner duplicates, escaping-induced outer413, depth/leaves/structural bounds. Cover GET f=null remaining invalid and other old GET behavior.

Actual native route/service tests: two actors/live and deleted parents, GET/POST same exact rows/count/pagination/context, cursor crossing method accepted but changed query/actor/saved context rejected; dashboard same selected rows/metric groups/error semantics, unsupported filter whole-tree rejects; fresh-session/Origin order, strict body-only keys, no-store/requestId and privacy-safe errors. Reuse real owned/canonical producers and actual dashboard fixtures, no mocked DB substitute for these proofs. Add only actual new native test paths to CI allowlist. No network/provider calls.

Pinned Node24.19.0/pnpm10.17.1, source ../sammlerraum-test-env.sh; guarded synthetic sammlerraum_test only, sole suite/DB owner after explicit GO. Retain meaningful failures and exact frozen source logs. Final relevant native regression includes search/saved/dashboard touched boundaries; frozen regular/types/lint/build once, repeat only affected gates after actual failure/source changes. No production or main branch actions.

Report task-5b1-report.md: source/evidence commits, exact files and SHA256, behavioral RED/GREEN commands/output, actual native-versus-pure counts/skips, final checks and limitations, actual service/export reconciliation, unchanged GET/cursor/Smart Collection behavior and B2/UI gates. Stage only owned source/report/logs, separate source/evidence commits; no push, root ledger/checkoff or subagents. Root supplies independent SPEC+QUALITY review and remote CI. Never mark original Task5/Phase07/count complete here.
