# Owned dashboard

`GET /api/v1/dashboard` and `createDashboardService(database).getDashboard(actor, input)` provide the available owned dashboard milestone. They share the actual search selection preparation and bounded RepeatableRead transaction with item search and saved queries.

## Request

GET accepts only `text`, raw JSON `f`, and `lifecycle`. The service accepts `text`, parsed `filter` (omitted/null means none), and `lifecycle`. Defaults are empty text, no filter, ACTIVE. Scope is always OWNED. Pagination, caller owner/scope, metric and sort overrides are invalid. There is no dashboard cursor.

The existing search parser validates filters, references, availability and retained facts. Query encoding is limited to 32KiB including `?`; duplicate/unknown keys and malformed encoding fail closed. Raw/canonical filter limits remain 16KiB, logical depth five and 50 leaves. Text remains at most 200 code points/800 UTF-8 bytes before and after NFKC/trim. GET `f=null` is invalid. Broad text uses deterministic PostgreSQL `und-x-icu`; typed comparisons use `C` and existing producer identity normalization.

ACTIVE excludes archive/dispose timestamps; ARCHIVED has archive but no dispose timestamp; DISPOSED has a dispose timestamp even if archived; ALL includes all three. Every selection excludes deleted items and deleted parents and requires the actor to own both. Public foreign inventory and role enums grant no access.

## Counts and lists

`selection.itemCount` counts matching inventory rows. `unitCount` is their summed current quantity as an exact decimal string. `matchedCollectionCount` counts collections represented in those matches. `collections.ownedLiveCount` separately includes every live owned collection, including empty collections, independently of item text/filter/lifecycle. The UI must preserve these distinct labels.

Largest collections rank by selected units, selected rows and ID, descending; recent additions rank by inventory createdAt then ID descending. Both list at most ten entries and expose eligibleCount/hasMore. Empty collections are counted but do not occur in a ranking of matched inventory. Recent additions do not claim acquisition time.

## Own estimates and change

The latest actual MANUAL/PER_UNIT Valuation is selected by observedAt, createdAt and ID descending before checking denomination. Groups preserve currency, stored minor-unit exponent, source and basis. Each total is the exact sum of per-unit estimate times current item quantity. Monetary and quantity sums are decimal strings, never JavaScript numbers or bigint JSON. No FX or combined currency total is supplied.

Manual value states are EMPTY (no matches), NO_ESTIMATES (matches but no values), PARTIAL or COMPLETE. Missing values remain missing, while authored zero contributes zero. COMPLETE describes coverage by all denomination groups together; each group includes contributors and other-denomination counts, not an assertion that its currency values every item. Partial groups are known-estimate subtotals. Observation time spans accompany groups. Top ten valued items are ranked within each denomination by current-quantity value then ID, with source/basis inherited explicitly from that group.

Change is LATEST_VS_PREVIOUS_OBSERVATION. The previous point is the latest record with strictly earlier observedAt. Same-observedAt revisions do not create elapsed-time evidence. Select the prior point before denomination comparison: a different immediate prior currency/exponent is NONCOMPARABLE_DENOMINATION; do not search farther back for a preferred currency. NO_ESTIMATE and INSUFFICIENT_HISTORY are separate exclusions.

Comparable deltas use `(latest - prior) × current quantity`. EMPTY, INSUFFICIENT_DATA, PARTIAL and COMPLETE states describe coverage. Real equal points can produce zero; absent or incomparable points cannot. Groups carry both time spans. This is change in estimates for the current selected cohort with current quantity held constant, not common-period portfolio performance, acquisition profit, historical inventory or percentage return.

## Distributions and missing facts

Trade buckets preserve NOT_FOR_TRADE, OPEN_TO_TRADE, FOR_SALE and RESERVED. Trade-ready means OPEN_TO_TRADE plus FOR_SALE; RESERVED is separate. Every bucket reports rows and units.

Condition groups retain exact category/option identity and retired options. Null condition is missing. Grading counts distinguish distinct graded items from grading records. Groups preserve exact providerKey/grade, recordCount and distinct itemCount; one item can appear in several buckets. They do not claim certificate verification or comparable cross-provider grade scales.

Missing-data counters overlap: category, condition, acquisition date, purchase amount pair, own estimate, grading, catalog entry link, image and document. Entry-only catalog links are valid; missing variant is not missing catalog linkage. Grading absence is an optional-data hint. A usable image/document requires its correct-kind same-owner asset to be READY and not cleanup-started. A mere link or pending/failed asset does not qualify. Purchase presence does not establish monetary interpretation.

## Limits, privacy and failures

There are three preparation data queries, optionally one exact URL manifest query, and four dashboard data queries. Including wrapper settings queries this is 15 or 17 query calls per attempt, before driver transaction-control calls. No application query loops per item or provider fetches occur. Statement limits do not imply bounded scan work; large/skewed inventories can still return unavailable.

The shared wrapper bounds total work at 12 seconds, at most three recognized serialization attempts, each transaction at five seconds, acquisition/statement at two seconds and lock wait at 500ms, shrinking to remaining time. SQL, manifest validation, DTO parsing and serialization share that budget. Every response uses one MVCC snapshot; readAt is its transaction timestamp, not a user-selected historical-as-of cutoff. The next request sees later committed changes.

Complete groups are capped at 256 manual denominations, 128 conditions and 128 grading identities. The database checks group cap sentinels before transferring arrays. Top lists are explicitly limited to ten. Numeric strings allow at most 78 digits (excluding delta sign). Final response JSON is at most 1MiB. Oversize results fail closed; no complete aggregate is silently truncated. Count values must be safe nonnegative integers.

Responses omit private notes, valuation notes/authors, certificate numbers, document bodies and asset storage paths. Auth is refreshed for each request, with no-store and request IDs. Invalid input is 400; authentication 401; invalid references/unavailable requested filters 422; query encoding too large 414; dependency/time/cap exhaustion 503; malformed retained data/output or unsafe counts 500. Existing closed search error codes are reused; raw input, SQL, causes and internal unavailable reasons are not exposed.

## Remaining integration gates

This milestone does not complete the original Phase07 dashboard requirement. Purchase totals, market reference totals, duplicates and wishlist are explicit UNAVAILABLE/null metric states, including for empty inventory. A requested unsupported filter rejects the whole request under NOT/OR or with no matches.

Purchase totals await the approved legacy-money provenance and complete-coverage reader. Its independent owned/lifecycle coverage precedes text/filter matching; selected totals apply only after that gate. Market values await the approved bounded exact-selector preparation and separate detail/aggregation rights, with source/metric/qualifier/kind/denomination/basis kept distinct. Display/filter rights do not grant aggregation. Duplicate/wishlist counts require their real Phase10 relations; shared dashboards require Phase09 bulk authorization. Full historical analysis, meaningful dated milestones and localized dashboard UI remain later integration gates. There are no heuristic duplicate counts, fabricated shared zeros, provider activations or synthetic historical charts here.

## Private query POST transport (Task5B1)

The same endpoint also accepts a body-only POST with an exact configured APP_ORIGIN Origin and a fresh session. Search accepts only `{text?, f?: string | null, lifecycle?, limit?: number, cursor?}`; dashboard accepts only `{text?, f?: string | null, lifecycle?}`. Omitted text/filter/lifecycle retain empty/no-filter/ACTIVE defaults; item limit defaults to 20 and must be a JSON safe integer from 1 through 50. The actual existing service and response DTO are shared with GET. Dashboard has no pagination fields.

The body must be application/json (optional parameters), a flat object, and at most 32KiB of actual streamed bytes, independently of Content-Length. Fatal UTF-8, leading BOM, unknown or duplicate decoded root keys (including escape-equivalent keys), nested objects/arrays and malformed JSON fail closed with SEARCH_INVALID400. The opaque raw `f` string reaches the existing filter parser intact, including valid 10001–16384-character filters. Raw/canonical filter, complexity, text and cursor limits remain unchanged. JSON null or omission means no filter; empty `f` and string `"null"` remain invalid. Inner filter duplicates retain the existing filter error codes. Escaping can make a legal raw filter exceed the outer body cap; this intentionally returns UPLOAD_TOO_LARGE413.

POST checks Origin, fresh authentication, the existing body-only URL query decoder, media type/body, then invokes the service once. Missing/different Origin is FORBIDDEN403; missing session is UNAUTHORIZED401; nonempty URL query keys are invalid, while a bare `?` is empty. The existing encoded-query cap retains SEARCH_QUERY_TOO_LARGE414. Responses and errors remain no-store with request IDs and closed messages; body query data belongs outside URLs and logs.

Equivalent normalized GET and POST item queries share cursor identity, including actor/query/lifecycle/limit binding. Saved-resolution cursors retain their distinct trusted context. GET behavior (including invalid GET `f=null`) and Smart Collection mutation parsing are unchanged; this duplicate-key boundary applies only to these two private query POST bodies. This is B1 only: reference/catalog APIs, frontend integration and the remaining original Task5/Phase07 gates are separate work.
