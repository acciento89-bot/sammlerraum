# Phase06 Task4 — comparison/API architecture preflight

Design only, 2026-10-18. Inspected committed candidate `02d33f02cbafd8e7445c01955ebab36a24b926a1`; during preparation root supplied Task2 SPEC compliant / QUALITY approved (0 Critical, 0 Important), and its completed review was read. Exact CI/persistence and Task3 implementation are not completed by this report. Task3 root rulings were read. Only this preflight file was written. No suites, generation, DB/provider operations, source edits, branch/index/HEAD changes, push, live actions or children were used.

Future implementation requires verified/persisted Task3 plus explicit root GO and a fresh BASE. Recheck actual Task3 exports at that point; do not implement against partial work. This is a cohesive proposal, not a partial implementation or Task4 checkoff.

## 1. Recommendation

Implement an owner-only `/api/v1/items/[itemId]/valuations` endpoint with summary/history GET and append-manual POST. Move the strict valuation contracts from Task5 into Task4. Give Task5 one usable wire contract, including bigint decimal strings, stored exponents, private manual notes and honest source provenance.

Use one small UTC `ReadCommitted` transaction for each GET: owner discovery, Collection SHARE, item SHARE with lifecycle/collection revalidation, then **one MVCC SELECT** returning all comparison data for that response. The final SELECT reads current catalog state, manual latest/history, source groups/history and currency diversity together. Do not call the existing three separately owning history services and stitch their snapshots. Do not acquire catalog locks after the item lock. POST keeps the already verified `createValuationService(...).addManualValuation` transaction unchanged.

Keep `aggregate: null` for every result, including all-zero and all-same-currency data. No quantity multiplication, exchange conversion, grading conversion or representative blended market number. Source groups are containers of distinct observations; the newest row in a group is not an estimate for all qualifiers/metrics in it.

Recommended default market scope is `CURRENT_MAPPING`: the item's exact entry/variant and a currently active, supported provider identifier with the same namespace/type/value. An older observation revision or a replaced identifier UUID does not erase the fact, but its original provenance and mismatch flags remain visible. A separate explicit `HISTORICAL_MAPPING` scope permits retained observations for the same exact entry/variant and a verified historical identifier snapshot, including retired mappings. It never follows the item's previous catalog links. Root decision R1 below confirms this product choice.

## 2. Existing evidence and consequences

| Existing seam | Inspected evidence | Consequence |
|---|---|---|
| Manual Money | `packages/domain/src/money/money.ts`, `money/currencies.ts` | bigint 0..9223372036854775807; pinned `currencyMinorUnitExponent`; do not introduce ICU or floating-point interpretation. |
| Manual history | `valuations/valuation-service.ts` | Private owner-bound PER_UNIT append; defaults50/max100; `(observedAt,createdAt,id)` DESC; latest uses observed time, not append order; cap10,000 per item. Each method opens its own transaction. |
| Manual ownership/lifecycle | Same file, `lockItem` | Parent SHARE before item SHARE/UPDATE; foreign/deleted item or deleted parent hidden; archived/disposed readable, mutation409. Actor ID is opaque case-sensitive TEXT. |
| Global observations | `market-data/market-data-service.ts`, `market-data/validation.ts`, `packages/market-data/src/types.ts` | Exact entry/optional variant/revision/identifier snapshot. Seven distinct kinds; point/range; qualifiers/confidence; SOURCE/FETCH and precision; immutable history. |
| Current external history API | `createMarketDataService(...).listObservations` | Bounded provider/kind/currency filter, but owns another transaction; no owner authorization, current-mapping filter, display entitlement or summary group directory. It is insufficient alone for this endpoint. |
| Registry | `packages/market-data/src/provider-registry.ts`, README | `get(id)` only; no enumeration; at most100 registrations; registration does not grant display rights. Default empty. Do not invent `.list()` or infer rights from presence. |
| Item link mutation | `items/item-service.ts`, `catalog/item-catalog-locks.ts` | Link/split acquire catalog entry then variant before Collection/item locking. A summary must not lock catalog parents after item SHARE. Existing link read already uses one MVCC statement. |
| Catalog bounds | `packages/contracts/src/catalog.ts` | Valid snapshots max100 variants/max200 identifiers; no entry-retired flag. Variant and identifier active flags matter. Snapshot validation must fail closed if inconsistent. |
| Existing indexes | `packages/db/prisma/schema.prisma`, Task2 migration | Manual index exactly fits item/owner/time keyset. `MarketObservation_history_idx` is entry/variant/provider/kind/currency/time; provider-only index supports later purge. Neither supports efficient semantic-identifier source-group paging directly. |
| Timestamps | Task1/2 service and native guards | UTC transaction-local setting is required by installed Prisma7.10 adapter. Canonical ISO bindings with explicit `::timestamptz`; historical year0001 supported. Market observedAt <= fetchedAt <= createdAt, native precision constraints. |
| Authenticated API | `apps/web/src/lib/grading-routes.ts`, dependencies, thin route | Fresh session with both cache/refresh flags disabled; same-origin POST; bounded fatal UTF8 JSON; `apiRoute`; no-store success and errors. |
| Public projection | `packages/domain/src/items/item-query.ts`, `contracts/items.ts` | Anonymous projection explicitly selects id/title/publicDescription/quantity/tradeStatus and never joins valuations. Preserve it; authenticated owner comparison has a separate DTO. |
| Actual DB test execution | `.github/workflows/ci.yml`, grading-route integration suite | `RUN_DATABASE_INTEGRATION=1`, explicit file allowlist, `--no-file-parallelism`. Ordinary workspace test success with skipped DB tests does not validate this change. |

Binding spec §§5.5/15 is satisfied by retaining per-unit manual meaning, independent append history and explicit source/time/currency/kind/reference/price or range. Different personal conditions/gradings remain separate items and never automatically select provider qualifiers.

## 3. Concrete HTTP contract

All responses use `cache-control: no-store`, request ID through `apiRoute`, and strict allowlisted projections. No auth/session/provider/owner/actor/poll/event secrets or raw payloads in DTOs. Canonical catalog entry/variant IDs and source identifiers are intentional global reference facts, not personal identifiers.

### GET summary

`GET /api/v1/items/:itemId/valuations`

Allowed parameters only:

```ts
type SummaryQuery = {
  view?: 'summary';                         // default
  scope?: 'CURRENT_MAPPING' | 'HISTORICAL_MAPPING'; // default CURRENT_MAPPING
  manualLimit?: integer;                    // default20, 1..100
  manualCursor?: ManualCursorToken;
  groupLimit?: integer;                     // default4, 1..8
  groupCursor?: GroupCursorToken;
};
```

Response200 `{ summary: ValuationSummaryDto }`. Every summary includes current `manual.latest` independently of `manual.history.cursor`. An older requested manual page never replaces latest. Source groups contain an initial five rows each plus a separate source-history continuation token. Groups themselves have a continuation token, so no all-history include is possible.

### GET one source group's history

Same route, discriminated query:

```ts
type SourceHistoryQuery = {
  view: 'source-history';
  source: SourceSelectorToken;  // emitted by summary; strict structure, not authorization
  limit?: integer;             // default20, 1..100
  cursor?: SourceHistoryCursorToken;
};
```

Response200 `{ sourceHistory: SourceHistoryDto }`. Ownership and current item binding are rechecked on every page. A group is provider + semantic source mapping + kind + currency. Both source selector and continuation contain the expected item/catalog context and scope; clients cannot request unrelated entry/variant data by changing top-level query fields. They are untrusted filters, always intersected with server-authorized state. There is no global observation route and no external POST.

### POST manual

`POST /api/v1/items/:itemId/valuations`, JSON body:

```ts
type ManualValuationInputDto = {
  amountMinor: string;       // canonical unsigned decimal, see below
  currency: string;          // pinned supported uppercase ISO4217 at write time
  observedAt?: string;       // exact YYYY-MM-DDTHH:mm:ss.sssZ, year0001..9999
  note?: string | null;
};
```

No query parameters; unknown fields rejected, including actorUserId/ownerId/itemId, type, basis, exponent, quantity, source or provider. Convert the validated decimal string to bigint exactly once at the adapter boundary, then invoke existing manual service with session.user.id. Response201 `{ valuation: ManualValuationDto }`; no hidden summary reread is needed. The returned row is the inserted history point, which may be backdated and may not be the latest.

### Validation and errors

* Every query discriminant/object is strict. Reject duplicate query keys before object conversion, unknown keys, empty tokens, unexpected fields for the selected view, `+1`, `1.0`, exponent/whitespace limit syntax, and request query length above8192 bytes. One decimal integer grammar for limits; do not coerce arrays/booleans/empty strings.
* POST max16KiB actual streamed bytes, `application/json`, fatal UTF8 decoding, JSON parse, strict schema; reuse `readBoundedBody`. A 2000-codepoint astral note fits. Note trims as existing domain service does, blank becomes null, NUL rejected, codepoints counted after trim. Do not silently NFC-normalize or use a UTF16 `.max(2000)` rule that disagrees with domain. Reject ill-formed surrogate strings explicitly because PostgreSQL cannot represent them; test escaped lone surrogates as well as invalid UTF8 bytes.
* Money input grammar `^(0|[1-9][0-9]{0,18})$`, then lexical/bigint upper-bound validation <=`9223372036854775807`. Reject number input, sign, leading zeros, decimal point, exponent and whitespace. Zero is valid. Stored response currency uses three uppercase letters and stored exponent; **do not revalidate old DTOs against today's currency membership or recalculate their scale**. New writes still use the pinned domain helper.
* Response scale is a bounded nonnegative stored integer (current native values0..4); no request-supplied scale. Range DTO requires low<=high. Point and range fields are discriminated by kind, never partially populated. Canonical millisecond UTC strings retain source precision separately; DAY is not advertised as a timestamp accurate to milliseconds.
* UUID path validation follows existing hidden404 convention after authentication. Fresh session absent401; wrong/missing POST Origin403 as in grading routes; malformed query/body400; foreign/deleted item or deleted collection404 with the same envelope. Archived/disposed GET200, POST `ITEM_INACTIVE`409. Manual cap `VALUATION_LIMIT_EXCEEDED`409. Future observedAt400, using DB clock after locks rather than request time.
* Valid but stale catalog context in a pagination token -> `VALUATION_CURSOR_STALE`409, refresh summary. Malformed/cross-item token400, unavailable or unentitled source selector404. No success payload reveals an unentitled provider's observation existence/count.
* Timeout/dependency failure -> stable `VALUATION_UNAVAILABLE`503, no SQL/provider body/cause/stack. Internal invariant violation remains sanitized500. Never turn a failed read into empty history or `currencyConflict:false`.

## 4. Exact DTO and query interfaces

Proposed contracts in `packages/contracts/src/valuations.ts` (strict runtime schemas plus these inferred types):

```ts
type MoneyDto = {
  amountMinor: string;
  currency: string;
  minorUnitExponent: number;
};
type ManualValuationDto = MoneyDto & {
  id: string;
  type: 'MANUAL';
  basis: 'PER_UNIT';
  observedAt: string;
  createdAt: string;
  note: string | null;
};
type Page<T> = { records: T[]; nextCursor: string | null };
type SourceKey = {
  providerId: string;
  identifierNamespace: string;
  identifierType: string;
  externalId: string;
  kind: 'LAST_SOLD' | 'SOLD_AVERAGE' | 'SOLD_MEDIAN' | 'ASKING_PRICE'
      | 'PRICE_RANGE' | 'CATALOG_VALUE' | 'DEALER_PRICE';
  currency: string;
};
type MarketObservationDto = {
  id: string;
  source: SourceKey;
  sourceMetric: string;
  qualifiers: Readonly<Record<string, string | boolean>>;
  minorUnitExponent: number;
  price: { type: 'POINT'; amountMinor: string }
       | { type: 'RANGE'; lowMinor: string; highMinor: string };
  observedAt: string;
  observedBasis: 'SOURCE' | 'FETCH';
  observedPrecision: 'DAY' | 'SECOND' | 'MILLISECOND';
  fetchedAt: string;
  recordedAt: string; // observation.createdAt; not a commit timestamp
  sourceUrl: string | null;
  sourceReference: string | null;
  confidence: { sourceLabel?: string; sampleSize?: number; methodology?: string } | null;
  catalogMatch: {
    observedRevision: number;
    currentRevision: number;
    observedIdentifierId: string;
    currentIdentifierId: string | null;
    revisionChanged: boolean;
    identifierRecordChanged: boolean;
    identifierActive: boolean; // exact semantic mapping is active now
    variantActive: boolean;    // true for entry-wide null variant
  };
};
type SourceGroupDto = {
  key: SourceKey;
  source: string; // strict source selector token
  history: Page<MarketObservationDto>; // first5, explicitly partial if cursor nonnull
};
type ValuationSummaryDto = {
  itemId: string;
  quantity: number;
  lifecycle: 'ACTIVE' | 'ARCHIVED' | 'DISPOSED';
  manualBasis: 'PER_UNIT';
  readAt: string; // DB statement timestamp, not a cross-request snapshot guarantee
  catalog: null | {
    entryId: string;
    variantId: string | null;
    revision: number;
    variantActive: boolean;
  };
  manual: { latest: ManualValuationDto | null; history: Page<ManualValuationDto> };
  external: {
    scope: 'CURRENT_MAPPING' | 'HISTORICAL_MAPPING';
    availability: 'AVAILABLE' | 'UNLINKED' | 'INACTIVE_VARIANT'
                | 'NO_SUPPORTED_MAPPING' | 'DISPLAY_DISABLED' | 'NO_OBSERVATIONS';
    groups: SourceGroupDto[];
    nextGroupCursor: string | null;
  };
  aggregate: null;
  currencyConflict: boolean;
  currencyConflictScope: 'LATEST_MANUAL_AND_ALL_ELIGIBLE_EXTERNAL_GROUPS';
};
type SourceHistoryDto = {
  itemId: string;
  readAt: string;
  catalog: NonNullable<ValuationSummaryDto['catalog']>;
  scope: 'CURRENT_MAPPING' | 'HISTORICAL_MAPPING';
  key: SourceKey;
  history: Page<MarketObservationDto>;
};
```

`recordedAt` deliberately avoids confusion with upstream observation time or Task3 receipt timing. Kind/price invariants enforced at runtime: only PRICE_RANGE permits RANGE. Qualifiers preserve authored false and strings; confidence sampleSize0 is preserved. No automatic qualifier or sourceMetric selection from condition/grade. No `fresh` boolean or TTL claim; display ages from actual observed/fetched times and explicit catalog flags. Provider freshness/licensing policy belongs to later activation.

Currency conflict is true iff latest manual plus all eligible source groups in the selected scope contain at least two currency codes. It is independent of manual history cursor and group pagination; historical manual currencies are not added merely because an old page was requested. In HISTORICAL_MAPPING it intentionally includes retained historical external currency groups. Same currency/different exponent, provider, kind, metric or qualifiers never authorizes aggregation. Currency conflict alone does not describe every comparability problem.

Server-only query export:

```ts
type TrustedValuationActor = { userId: string }; // authored from fresh session only
type ValuationQueryDatabase = {
  $transaction<T>(work: (tx: { $queryRaw<T>(q: TemplateStringsArray, ...v: unknown[]): Promise<T> })
    => Promise<T>, options: { isolationLevel: 'ReadCommitted' }): Promise<T>;
};
type MarketDisplayGrant = {
  providerId: string;
  identifierNamespace: string;
  identifierType: string;
  allowHistorical: boolean;
};
type MarketDisplayPolicy = {
  snapshotForOwner(actorUserId: string): readonly MarketDisplayGrant[];
};
createValuationQuery(database: ValuationQueryDatabase, policy: MarketDisplayPolicy): {
  getItemValuationSummary(itemId: string, actor: TrustedValuationActor,
    options?: SummaryOptions): Promise<ValuationSummaryDto>;
  getItemValuationSourceHistory(itemId: string, actor: TrustedValuationActor,
    options: SourceHistoryOptions): Promise<SourceHistoryDto>;
};
```

`SummaryOptions` and `SourceHistoryOptions` are parsed versions of the query types, with decoded cursors. The exported boundary still validates runtime inputs before DB acquisition. No arbitrary Prisma `where`, callback, SQL fragments or actor facts from client JSON. The query owns a response DTO because this is a read projection; persistence/domain Money remains bigint. Keep POST conversion in an explicit `toManualValuationDto` allowlist function reused by summary, never object spread of the stored private row.

## 5. Pagination, matching and bounded SQL

### Cursor grammar

Versioned canonical UTF8 JSON encoded base64url without padding; strict decode/roundtrip, no unknown keys and no permissive Buffer decoding. Manual token <=512 encoded bytes; group/source/history tokens <=2048 encoded bytes; decoded JSON <=1536 bytes. Source strings retain Task2 bounds: provider/namespace/type <=64, externalId <=256 UTF8 bytes. The query's overall8192-byte bound remains authoritative.

```ts
type ItemContext = { itemId: string; entryId: string; variantId: string | null; revision: number };
type Scope = 'CURRENT_MAPPING' | 'HISTORICAL_MAPPING';
type TimeKey = { observedAt: string; createdAt: string; id: string };
type ManualCursor = { v: 1; itemId: string; after: TimeKey };
type SourceSelector = { v: 1; context: ItemContext; scope: Scope; key: SourceKey };
type GroupCursor = { v: 1; context: ItemContext; scope: Scope; after: SourceKey };
type SourceHistoryCursor = SourceSelector & { after: TimeKey };
```

Date grammar and native UUID semantics match Task1/2, including year0001 and observedAt<=createdAt. Cursors need no signature for authorization: even a correctly shaped edited cursor only narrows the already authorized exact item/provider/mapping query. Never trust a cursor to supply ownership or entitlement. Group continuation and source selector use the same deterministic SQL group ordering; enum kind follows the declared PostgreSQL enum order, not incidental JS string ordering. Currency, metric and historical scale are not normalized.

### Selection

1. Query owner and nondeleted parent/item; lock/revalidate as below. Select the item's own current catalogEntryId/catalogVariantId. Null entry -> UNLINKED; no automatic identifier/title search. Entry-only means variantId IS NULL, never all variants. A nonnull variant only matches that UUID and entry; entry-wide observations never silently fall through.
2. Obtain current immutable revision snapshot and live entry/variant/identifier state within the final SQL snapshot. Validate shape/coherence. Supported current identifiers must be in the current snapshot **and** active live rows, match exact variant, and match a display grant namespace/type. Do not choose the first identifier; all eligible exact mappings remain distinguishable by SourceKey.
3. CURRENT_MAPPING permits old observation revisions only when its stored semantic namespace/type/externalId is still exactly active and supported for this exact target. Original observation revision/identifier UUID survive. Identifier retired and re-added with the same semantic value: usable with identifierRecordChanged=true. Changed value: old rows excluded from default comparison. Revision mismatch always explicit; it does not claim the old source fact was re-evaluated against revised catalog attributes.
4. HISTORICAL_MAPPING selects original exact entry/variant and validates historical revision snapshot identity against the stored identifier UUID/namespace/type/value, with a grant explicitly allowing historical display. Retired variants/mappings may appear with false active flags. Unsupported or incoherent historical bindings fail closed, never guess. Deleted/relinked personal items do not grant access to old item bindings through a token.
5. No current supported mapping produces a truthful empty CURRENT_MAPPING response. If authorized, explicit historical scope can show retained historical bindings; it is a separate assertion, not a fallback attached to current data. Task3 receipts, zero successful batch counts and last scheduler run do not create observations or freshness.

### Concrete bounded reads

* Manual latest: independent `ORDER BY observedAt DESC, createdAt DESC,id DESC LIMIT1`. History uses the same owner/item filter, strict tuple `< cursor`, `LIMIT manualLimit+1`.
* Group key is `(providerId,identifierNamespace,identifierType,externalId,kind,currency)`. Use index-supported **loose keyset group seeks**: first eligible key after cursor, then seek strictly greater than the previous complete group key, up to groupLimit+1. A recursive/lateral SQL CTE can do these at most9 group probes in the one snapshot. Do not use unbounded `array_agg`, all-row JS grouping, OFFSET, or a DISTINCT+LIMIT presented as proof of bounded scan work.
* For each of at most8 returned groups, lateral exact-key history reads `LIMIT6`, yielding five rows and a cursor. Group history uses exact key and time tuple, `LIMIT limit+1`; different metrics/qualifiers remain individual rows. No count-all query and no pretense that one newest qualifier represents the group. If the UI wants another metric/qualifier, it pages distinct source rows; a qualifier-conversion/search framework is out of scope.
* Currency diversity is computed in the same SQL snapshot from all eligible groups, independent of page: identify a baseline (latest manual currency, else any eligible external currency), then ask whether an eligible external row has a different currency. Do not derive false from a truncated group page. Probe currency-leading index ranges within permitted semantic mappings; stop at first different currency. If this cannot finish within the query budget, return503, not a misleading false.
* Source query and group query can use parameterized branches for variant null/non-null so the planner can use direct IS NULL/equality prefixes; don't assume a nullable `IS NOT DISTINCT FROM` parameter always yields the intended index plan.

Recommended additive index after future GO, subject to R2:

```text
MarketObservation_source_history_idx
  (entryId,variantId,providerId,identifierNamespace,identifierType,externalId,
   kind,currency,observedAt DESC,createdAt DESC,id DESC)
```

This is deliberately not a uniqueness rule and includes no qualifiers/large JSONB/source URLs. Existing indexes remain. The proposed index directly supports semantic-source group seeks and history. Currency diversity can probe the seven known kinds per permitted mapping using its kind/currency suffix; exact equal prefixes plus currency range avoid a whole-history aggregate. Because valid snapshots contain <=200 identifiers and display policy is capped at8 providers, current-scope mapping fanout is finite; do not multiply history materialization by every mapping. Historical group seeks use the same index and per-candidate historical snapshot checks.

For currency diversity use explicit lower/upper currency ranges around the baseline, rather than assuming `currency <> baseline` will seek efficiently. Historical scope can span more than200 mappings across revisions; do not claim the per-snapshot identifier cap bounds all retained history. Its diversity probe may instead use the existing entry/variant/provider/kind/currency index with historical-policy filters and the same statement budget. It must return503 on exhaustion rather than cap candidates and invent false.

Task2's newly reviewed Minor is carried explicitly: its unfiltered `listObservations` default chronological read cannot obtain its ordering from an index with optional kind/currency before timestamps. This proposal's actual source-history consumer always fixes kind/currency **and** semantic mapping, so the recommended semantic-source index addresses this consumer without pretending to fix the other method. Do not add a provider-wide chronological index solely to erase the review note when this API has no provider-wide chronological view. If root instead chooses that view, justify the additional `(entryId,variantId,providerId,observedAt DESC,createdAt DESC,id DESC)` index in the future additive migration. No index is changed now.

The result/round-trip bounds are exact; index access is not a mathematical fixed disk-read bound. Selective historical snapshot/current-identifier checks may discard candidates, and concurrent retention or very large histories can add work. Require transaction-local statement/lock timeouts (proposed 2s SELECT /500ms lock, transaction max5s at actual Prisma composition), inspect representative real PostgreSQL EXPLAIN plans before accepting this index/design, and return controlled unavailability on budget exhaustion. Never claim LIMIT alone caps all query work. No persistent group/materialized-latest table is justified now; if plans show repeated scans despite this index, raise concrete evidence rather than quietly adding a summary subsystem.

Response hard ceiling2MiB encoded UTF8, enforced after explicit projection and before returning. Manual100+latest (notes max2000 codepoints), external8*5 or one source page100 with Task2's4KiB metadata cap fit below this with fixed DTO overhead; test actual worst-case JSON escaping and astral/control text. Each normal page still obeys requested row counts. An invariant violation/oversized stored result fails sanitized500 rather than truncating provenance or faking pagination. No arbitrary user-controlled page-size multiplier.

## 6. Consistency, lock order and timestamp handling

GET transaction sequence:

1. Validate actor and input before acquiring DB connection; take a trusted bounded display-policy snapshot, default empty. Configure transaction-local UTC, lock/statement timeouts through fixed trusted settings.
2. Discover owner item and parent using opaque actor TEXT and UUID item, both nondeleted. Lock Collection SHARE with owner/deleted checks. Lock item SHARE with discovered collection/owner/deleted checks; select lifecycle, quantity and binding. If moved while waiting, retry the complete transaction up to3 times or return a bounded conflict; never lock an unexpected second parent from beneath an item lock.
3. Read everything catalog/manual/market for the response in **one final SQL statement**, including final current revision, currency-diversity result and page sentinel rows. No catalog SHARE/UPDATE locks at all in this read transaction. This avoids existing link/split entry-before-item lock inversion and allows concurrent catalog/ingestion writers. Collection/item are stable during the read; canonical data/observations use one statement snapshot. Manual append blocks on item UPDATE and therefore cannot split latest from its history within this response.
4. Assemble/strictly validate explicit DTO, release transaction, emit no-store response. Actual readAt is final statement DB time; it is not a promise that another page shares the same MVCC snapshot.

A wide typed recordset or explicitly projected JSONB can be used for the single SELECT. If SQL JSONB is chosen, every monetary bigint must be `::text` **before JSON construction**, including range bounds; a PostgreSQL numeric JSON value has already lost precision by ordinary JS JSON decoding. Timestamp JSON projection must explicitly format UTC canonical millisecond strings including year0001, rather than trust adapter/JSON offset normalization. No `SELECT *`/`to_jsonb(stored_row)` returned to callers. Decode with the strict response schema. Raw native bigint rows may instead be assembled in TS with `.toString()`, but only if the one-statement snapshot is preserved.

ReadCommitted with several market SELECTs would not provide the promised single-response snapshot even with item locks: provider ingestion and catalog edits do not wait on that item. Therefore the implementation either retains the one final SQL statement or brings root a concrete alternative (e.g. bounded RepeatableRead with serialization retry); it must not silently weaken consistency. No extraction of the manual service's write transaction API is necessary.

Between HTTP pages, histories are live, not frozen: new/backdated observations may fall before or after the cursor, and retention may remove rows. Keyset prevents OFFSET shifts and ties are resolved by immutable UUID, but it does not promise a complete historical export under concurrent insertion/purge. Refresh starts a new traversal. Catalog revision/link changes invalidate source/group cursors with409; manual cursor survives quantity/catalog changes because item history remains the same. Latest manual always refreshes. An owner quantity edit/split neither rescales history nor copies it to the new item; quantity is contextual and manualBasis remains PER_UNIT.

No provider fetch, queue enqueue, scheduling, catalog mutation or HTTP request occurs on GET. The query never obtains a catalog lock and no lock crosses network I/O.

## 7. Display entitlement and Task3/6 activation boundary

Introduce a narrow trusted **MarketDisplayPolicy** dependency at the server composition/query boundary, not a billing/license subsystem. Its production implementation returns `[]`. Explicit approved grants provide providerId+namespace+type+allowHistorical, max8, copied/validated/frozen per request. Trusted composition verifies each grant against `registry.get(providerId)` and the exact registered namespace/type, without invoking fetch; duplicate/inconsistent grants fail configuration closed. A registration or successful sync receipt never manufactures a grant. Test fixtures inject grants and fake stored provider facts; production remains off even if rows exist.

At the future Task3 verified BASE, reuse its shared provider-disable policy if one exists. If it only controls fetch dispatch, add read/display as a separate explicit capability at this boundary; do not couple read enablement to scheduler's enabled flag or invent a permissive fallback. All source queries, histories, group existence and currency-diversity probes must apply the same grants. Disabled/unknown providers produce no rows/metadata. Public display is not granted by this owner-only policy.

Before a real provider is enabled, Task6/Phase13 must verify contract rights for authenticated comparison, historical display/retention, source links/reference/qualifier disclosure, and freshness UI. Task3's root-approved drain-before-purge/reactivation prerequisite remains binding: disable reads/fetch on all replicas, stop/drain queued/redrive/in-flight/replay work, then authorized purge of observations/receipts/caches, and verify before reactivation. A policy snapshot cannot cancel a response already in flight; the runbook must drain in-flight read requests too. No cross-request valuation response cache is introduced here. Registry default-off or receipt existence alone proves none of these operational gates. No live activation/purge/runbook execution is in Task4.

## 8. Requirements, files and validation after future GO

| Requirement | Proposed files / smallest change | Required evidence |
|---|---|---|
| Strict bigint wire input/output, timestamps, Unicode, cursor/page bounds | New `packages/contracts/src/valuations.ts`, `.test.ts`; contracts `package.json` export | Pure tests max bigint, zero, >MAX, numeric/decimal/scientific rejection, currencies/exponents, range, source provenance, unknown keys, token bounds, astral note2000/2001 and escaped NUL/surrogates. |
| Owner summary and source-specific paging | New `packages/domain/src/valuations/valuation-query.ts`, `.test.ts`; domain export | Real PG owner/foreign/deleted parent, archived/disposed read, exact variant/null isolation, no condition auto-match, latest independent of manual cursor, stable tie paging, same/mixed currency and off-page conflict, zero/missing. |
| Current/historical provenance | Same query/tests | Revision-only edit, identifier retirement/re-add same value, changed value, retired variant, unchanged old rows; current scope empty vs explicit historical; unsupported mapping excluded; forged selector never accesses other binding. |
| Correct read projection/UTC/concurrency | Same query/tests | year0001 and max money through real SQL JSON if used, non-UTC session baseline restored after transaction; controlled lock barriers for parent deletion/manual append/link/quantity edits, coherent final-statement catalog/market snapshot; no elapsed sleep as lock proof. |
| Owner POST through existing manual write service | New `apps/web/src/lib/valuation-routes.ts`, `valuation-route-dependencies.ts`, thin `apps/web/src/app/api/v1/items/[itemId]/valuations/route.ts` | POST201 actual DB append, backdated point, inactive409, cap409, no actor override, fresh uncached session, origin and body errors. Existing service behavior remains authoritative. |
| Real route wiring/strict errors | New `apps/web/src/lib/valuation-routes.integration.test.ts` and small pure route/token tests only where useful | Construct actual dependencies with real PG + auth stub as grading tests do; don't substitute a fake summary DTO for domain query. Thin Next exports use these dependencies; no-store every status; stable hidden404; unsigned selector edit cannot bypass scope. |
| Bounded indexed source reads | Proposed additive schema index + new timestamped additive migration only after R2/GO | Existing Task1/2 migrations untouched; real plans/index presence on populated fixtures, no all-history include; cursor sentinels/size extremes/timeout sanitization. No migration is created or applied in preflight. |
| Provider display default off | Narrow server-only policy file/composition (or reuse actual Task3 seam) | Empty grants => zero source facts/count leakage even with observations; disabled source history404; grants are independent of registry/sync receipts; no provider.fetch call on GET. |
| Private/public separation | Existing item-query/public contract unchanged; regression assertions in route/domain tests | Public/other-user reads never contain manual amounts/notes, purchase/private grading or comparison payload. Owner private route alone sees notes. Existing purchase safe-number DTO unaffected. |
| Native execution actually runs | `.github/workflows/ci.yml` explicit list | Register `packages/domain/src/valuations/valuation-query.test.ts` and `apps/web/src/lib/valuation-routes.integration.test.ts` in existing RUN_DATABASE_INTEGRATION serial allowlist; register a separate index migration suite only if one is added. Pure contracts tests run normally. |

Use existing `createTestDatabaseClient`, PostgreSQL17/_test safeguards and scoped fixture erasure; do not reset DB or modify applied history. Task4 introduces no new mutable data model or write native guards; existing append guards are exercised by real POST. Later root exact-source CI remains required. Task5 consumes these types/API and stored exponent, formats source/qualifier/time distinctions, and offers paging; it does not reintroduce a numeric money DTO or blend sources.

## 9. Costs and only unresolved root decisions

Recommended choices and costs: one composite SQL read is more involved than service composition but avoids incoherent snapshots and lock inversion; a narrow owner-query DTO keeps private fields explicit; separate group/history paging adds one GET discriminant but bounds results; semantic source keys and one index add storage/write cost while retaining exact mappings; historical scope adds explicit metadata/UI work rather than hiding old facts or calling them current; production display policy stays empty until real rights are reviewed.

**R1 — historical selection policy:** approve recommended CURRENT_MAPPING semantic equality across older revisions with explicit revision/identifier flags, and explicit HISTORICAL_MAPPING for retired bindings of the item's still-current exact entry/variant. Alternative strict currentRevision-only default is simpler conceptually but makes a title/translation edit hide all values until a new successful poll, and gives no retained history access without another API. Historical rows must never become an automatic current-mapping fallback. This is the substantive product decision, not a request to wake the user.

**R2 — source query index/file expansion:** approve a new additive `MarketObservation_source_history_idx` migration/schema entry and the supporting strict contract/route/dependency/tests/CI files, beyond the plan's original three-file sketch. Task4 cannot meet real POST, exact JSON, entitlement and bounded semantic-source reads with only that sketch. Verify representative plans at implementation before applying the final index definition; if the existing index is demonstrably sufficient for the chosen bounded design, omit the additional index rather than add speculative storage.

Everything else above is a recommended implementation choice within the established requirements. Any Task2 review correction or Task3 final shared-disable/export change must be incorporated before fresh Task4 GO. No unresolved provider purchase/license/account question should trigger live work in this source-only phase.
