# Phase06 Task2 architecture preflight — proposal, not implementation GO

Read-only investigation against BASE `eefd76a1d6d29c1925cc0daccfced22d02885f70`, plus approved Task1 context. Task1 remains sole source/schema/DB mutator. This report is the only file written; no suites, generation, DB operations, provider calls, index/HEAD/branch changes or children. Existing spec §§5.5/15 and Phase06 preflight rulings govern. Root must rule the concrete choices below, then supply fresh verified BASE and explicit GO. Elapsed time is not GO.

## Recommended minimum

Add a small dependency-free `@sammlerraum/market-data` package for transport-independent provider types and an explicit registry; domain owns canonical-money validation, catalog matching, transactions and immutable persistence. One fetch/ingestion batch targets one exact catalog entry, optional variant, and one exact catalog identifier. Keep all seven kinds. Use two native unique indexes for EVENT versus POLL observations. Task2 supplies transaction-scoped ingestion; Task3 owns a small committed-sync receipt and inserts it in the same transaction. No generic ingestion/job/event framework.

Alternatives considered: (1) provider+external product ID uniqueness loses recurring history; reject. (2) observedAt/fetchedAt uniqueness creates new retry identities and confuses day precision; reject. (3) stable event identity or durable poll identity plus explicit source metric, qualifiers and currency is the recommended small design. Cost: a slightly richer request and Task3 receipt table, but no raw provider response store.

## Concrete package/service contracts

`packages/market-data/package.json`: private ESM workspace package, exports `./types` and `./provider-registry`, existing build/lint/typecheck conventions. Domain adds workspace dependency and `./market-data/market-data-service` export. Avoid a circular market-data→domain→market-data dependency: package amount fields are structurally compatible with Task1 Money (`amountMinor: bigint`, `currency: string`), while the domain alone imports the approved canonical validation/exponent helper. No duplicate parser or currency map. Worker adds the package dependency when Task3 consumes it.

Proposed types (names may be adjusted to repository conventions after fresh BASE, semantics fixed):

```ts
type MarketObservationKind =
  | 'LAST_SOLD' | 'SOLD_AVERAGE' | 'SOLD_MEDIAN' | 'ASKING_PRICE'
  | 'PRICE_RANGE' | 'CATALOG_VALUE' | 'DEALER_PRICE';
type SourceQualifiers = Readonly<Record<string, string | boolean>>;
type ObservationTime =
  | { basis: 'SOURCE'; precision: 'SECOND' | 'MILLISECOND'; value: string }
  | { basis: 'SOURCE'; precision: 'DAY'; value: string }
  | { basis: 'FETCH'; precision: 'MILLISECOND' };
type ObservationIdentity =
  | { mode: 'EVENT'; eventId: string }
  | { mode: 'POLL' };
type CatalogMarketTarget = {
  entryId: string; variantId: string | null; revision: number;
  identifierId: string; namespace: string; identifierType: string;
  externalId: string;
};
type MarketFetchRequest = {
  pollId: string; target: CatalogMarketTarget;
};
type ObservationCommon = {
  externalId: string; identity: ObservationIdentity; sourceMetric: string;
  currency: string; qualifiers: SourceQualifiers; time: ObservationTime;
  sourceUrl?: string; sourceReference?: string;
  confidence?: { sourceLabel?: string; sampleSize?: number; methodology?: string };
};
type MarketObservation = ObservationCommon & (
  | { kind: Exclude<MarketObservationKind, 'PRICE_RANGE'>; amountMinor: bigint }
  | { kind: 'PRICE_RANGE'; lowMinor: bigint; highMinor: bigint }
);
interface MarketDataProvider {
  readonly id: string;
  fetch(request: MarketFetchRequest): Promise<MarketObservation[]>;
}
type RecordContext = { request: MarketFetchRequest; fetchedAt: string };
// Both require registry-resolved provider; unknown provider throws.
recordObservations(providerId, observations, context): Promise<RecordResult>;
recordObservationsInTransaction(tx, providerId, observations, context): Promise<RecordResult>;
// Result: bounded stable observation IDs + inserted/reused counts; no raw payload.
```

`fetchedAt` is response-receipt time supplied by the trusted worker immediately after `fetch`; never queue creation time or the provider's sale time. Service authors database `createdAt` and exponent. Provider cannot select actor/owner, internal row ID, exponent, creation time or attachment target: observations echo only exact `externalId`; the server request binds the target. `pollId` is a UUID produced before enqueue and persisted in job.data, never a new UUID/time inside a retry. A poll also exists for event-only responses so Task3 can receipt an empty or already-known result.

A server-only `prepareFetchRequest(providerId, { entryId, variantId, identifierId, pollId })` on the domain service reads one coherent current revision and validates the exact identifier before returning the request. Its short transaction releases all locks before HTTP. Task3 repeats a cheap current-target check immediately before fetching; ingestion revalidates after HTTP. No public ingestion route and no collection actor authority: provider permission is explicit trusted server composition, comparable to catalog maintenance. Application moderator grants do not implicitly grant provider ingestion. No private item ID, ownership, purchase, personal condition, grading or certificate joins/fields are accepted. Category-specific source qualifiers describe a market cohort, never a personal item's condition.

Registry: constructor takes a finite array of explicit `{ provider, identifierNamespace, identifierType }` registrations; validates IDs, rejects duplicates, immutable after construction, `get(id)` throws for unknown IDs. Empty production registry/default-off in Task2. Test providers use the same injection constructor; no production fallback to fake data or automatic HTTP discovery. Task3/6 activation configuration controls whether an explicitly registered real adapter may fetch. Task4 reads need an explicit readable-provider entitlement policy; the existence of rows or credentials never grants public display rights.

## Runtime bounds and precision

- Strict plain objects and discriminated unions; reject unknown fields, wrong scalar types, undefined as a supplied value, NaN/infinite numbers, prototype-bearing maps and arbitrary raw JSON. No number→bigint coercion. Reject excess output rows before DB work.
- One target per batch, 0–100 observations; total canonical serialized DTO bytes <=256 KiB, substituting decimal strings for bigint only for counting/comparison. Empty fetch is valid and Task3 must receipt it. Each row metadata <=4 KiB. No hidden truncation or silent skipping of malformed data.
- Provider ID ASCII `[a-z][a-z0-9_-]{0,63}`; sourceMetric ASCII `[a-z][a-z0-9_.:-]{0,63}`. Exact external/event IDs nonempty, NUL-free, <=256 UTF-8 bytes; preserve case and provider meaning. Native UUIDs normalize; text actor IDs remain case-sensitive and are not part of this model.
- Qualifiers: flat plain object, <=16 keys; each key matches the same bounded metric-key grammar; each value is a source-authored NUL-free string <=128 UTF-8 bytes or boolean; serialized JSONB text <=1024 bytes. Empty `{}` means no qualifier provided. Names are source field identities such as `condition`, `grading.company`, `grading.grade`, `variant`, `flag.firstEdition`; no universal grade/condition conversion. JSONB equality gives stable map identity irrespective of object-key order. Do not collapse missing, empty source value and explicit false. Empty strings can be rejected as malformed instead of treated as absence.
- Source URL optional <=2048 UTF-8 bytes: public HTTPS permalink, no username/password, query or fragment by default. Never persist the API URL/token. Task6 can propose a narrow provider-specific safe query allowlist if required. Reference optional nonempty <=512 UTF-8 bytes. No synthetic URL/reference when license disallows it. No raw HTTP headers/payload/errors in metadata.
- Confidence optional: sourceLabel <=128 bytes, methodology <=512 bytes, sampleSize integer 0..2,147,483,647; at least one field if present. Absence is absent; sampleSize 0 is not a probability. Do not fabricate normalized confidence or add an inferred number.
- Nonnegative bigint <=9,223,372,036,854,775,807. Point requires only amountMinor; range requires both nonnegative endpoints, low<=high, and no point amount. Missing endpoint fails a purported range; absent price yields no observation, never zero. Zero and equal range endpoints are valid authored values. Canonical currency acceptance and stored exponent come from Task1's approved pinned numeric ISO pairs (0/2/3/4); historical readers use persisted exponent. No FX, averaged result or cross-kind blending.
- SOURCE/SECOND or SOURCE/MILLISECOND uses strict canonical 24-character UTC with real calendar validity; SECOND requires `.000` and preserves second precision explicitly. No provider timestamp may be invented or given finer precision than the source. Sub-millisecond source time is unsupported until an exact preservation design exists; do not truncate it silently. SOURCE/DAY uses strict real `YYYY-MM-DD`; store UTC midnight as a sortable representation with `precision=DAY`, and display as date only. FETCH uses the actual supplied response-receipt time and explicitly records retrieval basis. PriceCharting guides therefore use FETCH; Scrydex daily history uses SOURCE/DAY; neither is relabeled a precise sale.
- `fetchedAt`, effective `observedAt`, `createdAt` are finite year0001..9999 timestamptz(3). `observedAt<=fetchedAt<=createdAt`; DAY comparison uses its midnight representation (conservative UTC-day check, future days fail). This deliberately rejects an unsupported/future provider day rather than guessing a timezone. If Task6 establishes source timezone semantics, extend the source-time contract explicitly.
- Incorporate root's confirmed Task1 driver boundary: set transaction-local TimeZone UTC and bind canonical ISO values with explicit `::timestamptz`, including service-authored insertion time captured from DB clock after locks. Do not refactor the global Prisma client. Reuse finalized Task1 approach after fresh BASE, not partial WIP.

## Concrete storage and native invariants

New `MarketObservation` table: UUID id; providerId; externalId; identityMode enum(EVENT,POLL); nullable eventId/pollId; sourceMetric; kind enum(all seven); entryId UUID; variantId nullable UUID; catalogRevision int; identifierId UUID plus immutable namespace/type/value snapshot; qualifiers JSONB; currency and minorUnitExponent; nullable amountMinor/lowMinor/highMinor bigint; observedAt/fetchedAt/createdAt timestamptz(3); observedBasis(SOURCE,FETCH); observedPrecision(DAY,SECOND,MILLISECOND); nullable sourceUrl/reference/confidence JSONB. No owner/item/user relation, updatedAt, mutable lastSeenAt or stored aggregate.

Native FKs: entryId→CatalogEntry RESTRICT; (variantId,entryId)→CatalogVariant(id,entryId) RESTRICT; (entryId,catalogRevision)→CatalogRevision(entryId,revision) RESTRICT. Do not FK source identifier: its binding is an immutable revision-backed snapshot; current identifier membership/values can change through catalog maintenance. Index providerId for scoped purge; (entryId,variantId,providerId,kind,currency,observedAt DESC,createdAt DESC,id DESC) for bounded comparison/history. No private joins in indexes or queries.

Native partial unique indexes (not nullable multi-column uniqueness that accidentally permits duplicates):

- EVENT: `(providerId, externalId, eventId, sourceMetric, kind, currency, qualifiers)` WHERE identityMode='EVENT'.
- POLL: `(providerId, pollId, externalId, sourceMetric, kind, currency, qualifiers)` WHERE identityMode='POLL'.

`externalId` is the logical source product/reference, eventId is a stable upstream event identity scoped to that product; do not derive an eventId from a guide product/day unless the endpoint actually documents that identity. `qualifiers` is bounded JSONB directly in the unique index: no collision-prone homegrown hash or caller-supplied qualifier hash that native writes can falsify. Bound every indexed text field by UTF-8 octets (not character count) and qualifiers by JSONB text bytes so full worst-case index tuples stay comfortably below PostgreSQL's B-tree tuple limit. Prisma need not represent these partial indexes as a fake unique selector; raw parameterized insert/lookup is acceptable.

Native CHECKs: EVENT has nonempty eventId and null pollId; POLL has UUID pollId and null eventId; point/range mutual exclusivity and ranges; canonical allowed currency/exponent pairs using Task1 finalized strategy; positive revision; strict string/metadata byte bounds and JSON object shape; finite time/year/order; DAY only SOURCE and exactly midnight UTC; SECOND only SOURCE and exactly whole seconds; FETCH only MILLISECOND and observedAt=fetchedAt; supported time enums. Native BEFORE UPDATE always rejects, including no-op update and FK-driven updates. Trusted DELETE permitted; no trigger-depth escape, no new operator role fiction.

A small BEFORE INSERT validation trigger should acquire the catalog entry SHARE lock, then optional variant SHARE, and check current revision, active variant and exact active identifier membership/namespace/type/value/variant against the request snapshot. Also confirm the corresponding immutable CatalogRevision snapshot contains those exact facts. This makes stale/retired/variant-mismatched direct inserts fail natively, beyond mere relation FKs. Service does the same validation to provide useful error codes. No catalog retirement trigger/update rewrite; later retirement remains allowed and old observation revision provenance survives. Direct privileged SQL can still violate authorization or override triggers with DDL; this is application/native integrity, not an operator-proof ledger.

## Exact matching, locking and batch behavior

Actual catalog has **no entry retirement flag**. Entry absence fails; variant/identifier `active=false` means retired. Existing canonical writers first lock entry FOR UPDATE, then `persistState` toggles/upserts variants and identifiers and writes a new immutable revision. `getCurrentCatalogEntry` reads entry+current revision in one SQL statement. Use that snapshot model, not a sequence of unlocked relation reads. `lockCatalogParents` already expresses entry SHARE→variant SHARE but does not validate revision/identifier; extend locally in the market service, do not weaken/change its item contract.

Exact mapping requires the selected registry namespace/type, requested identifier UUID and exact value in the chosen entry revision, with its variantId equal to the target variantId (including null). Entry-only identifiers never implicitly attach prices to a variant. Response externalId must equal the requested identifier value. Search/title similarity is not an ingestion mapping. Catalog identifiers are not globally unique by namespace/type/value, so never select an arbitrary first global match. Explicit target binding allows legitimate catalog duplicates to remain distinct; correction of a previously recorded EVENT attachment must fail identity conflict, not silently move the historic event.

Pre-fetch preparation uses a short ReadCommitted transaction: UTC local setting; entry SHARE; variant SHARE if needed; read current revision snapshot+exact identifier; release before HTTP. At ingest: validate entire bounded batch first; transaction-local UTC; entry SHARE→variant SHARE; verify expected revision+active exact mapping; capture DB clock; insert in sorted native identity order. On any stale revision, retired variant/identifier, mismatched externalId, bad money/metadata or conflicting duplicate, abort the **entire** batch. A title-only catalog edit still invalidates an in-flight request: conservative and simple, with cost of one discarded/requeued fetch. Never refresh expectedRevision inside a retry and attach results obtained under different semantics. Task3 cancels/skips stale request with a classified terminal outcome, then creates a newly prepared poll if scheduling still calls for it. Rollback restores old facts as a new revision, so old queued revisions remain stale.

For each identity, `INSERT ... ON CONFLICT DO NOTHING RETURNING` then inspect existing row. Same key/same semantic content returns original ID, values and first fetchedAt; same key/changed semantic content throws `MARKET_OBSERVATION_CONFLICT`, aborting all rows. Compare exact canonical fields, not hash alone. Semantic content includes source price/range, target entry/variant and identifier tuple, source time/precision/basis, references, qualifiers, confidence, currency/exponent; excludes id, createdAt, fetchedAt and catalogRevision audit snapshot. For FETCH basis also exclude derived observedAt from comparison, preserving the first committed retrieval time. Excluding catalogRevision allows a genuinely identical upstream event to be seen after an unrelated catalog edit while retaining its original matched revision. New rows still require current expected revision. Ingestion itself always requires a current active match, even for a duplicate; the Task3 committed-receipt fast path is what makes a committed job harmless after later catalog retirement.

Duplicate keys within one supplied batch are canonicalized/deduplicated if content matches; divergent same-key entries fail before DB work. Return counts clearly distinguish unique inserted/reused rows from redundant identical inputs. Concurrent equal batches yield one persisted point; divergent equal-key batches produce one winner and one whole-batch conflict. Sorting prevents opposite row insertion order deadlocks; do not hold collection/item locks or HTTP calls in these transactions.

## Task3 committed-sync receipt seam — implement there, not Task2

Task2 exports `recordObservationsInTransaction(tx,...)` accepting a narrow Prisma transaction capability and performs no nested begin/commit. Convenience wrapper owns a ReadCommitted transaction. No callback-based arbitrary workflow plugin. Task3 can use the same tx for its receipt. Proposed Task3-only additive `MarketSyncReceipt`: composite PK(providerId,pollId), immutable bounded request JSON (target+revision+identifier; no secrets), fetchedAt, committedAt and observationCount. It contains only successful completion; no STARTED state required. Zero-result successes also get receipts. Do not FK observations to receipts: upstream events may be reused across multiple polls, and license purge must remain simple.

Exact worker sequence:

1. Parse strict persisted payload `{ providerId, pollId, target }` and check provider activation/entitlement. Read receipt; same key with unequal stored request is a job-identity conflict, equal committed receipt returns before catalog recheck or HTTP.
2. Validate still-current target, obtain distributed provider/token permission where required, call adapter with bounded retries/response/pages; capture actual fetchedAt. No DB/catalog lock across HTTP.
3. Begin ReadCommitted tx, set local UTC; take a transaction advisory lock scoped to provider+pollId (hash collision merely serializes, not identity equality). Re-read receipt under that serialization. If equal committed receipt exists, return before ingestion; a competing committed response wins without rewriting timestamps/content. Otherwise call Task2 ingestion, then insert receipt in that same tx and commit. Failure before/inside commit leaves neither new observations nor receipt. An ACK failure retries step1 and makes no provider request.

An unlocked step1 can race another uncommitted worker, so duplicate HTTP calls can happen before the first commit; the receipt guarantees committed-work skip and atomic data, not universal exactly-once I/O. Task3 can use its persisted queue exclusion plus distributed limiter to bound concurrency; do not claim a DB receipt alone prevents paid fetch races. Retry before any successful commit may observe a newer live response, and that is acceptable: there was no committed point yet. Retry after commit returns the first committed result. Future poll uses a new persisted pollId, preserving unchanged guide values as a new retrieval point. Fetch-completed but transaction-failed response need not be durably staged; cost is another permitted bounded fetch. No fresh timestamp-derived identity.

Actual integration: `QueueRuntime` invokes `registration.handle(job.data)` and `JobHandler<T>` receives no job ID. `PgBossQueue` singleton suppression applies to active jobs and can reuse a singleton key after terminal completion; it is not an observation identity. Put pollId in payload now; do not change queue handler signatures just to recover it. Task3 composes provider registry, domain service and handler in `apps/worker/src/run.ts` before queue startup. A bounded default-off producer gets `start()/stop()` lifecycle hooks through `main.ts` alongside imageDispatcher/mediaCleanup; stop producer before stopping queue/disconnecting DB. Task6 supplies real adapters and distributed PriceCharting token limiting; task3 readiness must not be claimed from a handler file alone.

## Retention/license boundary

Task2 append-only prohibits UPDATE, not privileged deletion. No normal service or HTTP delete method. A future explicitly authorized maintenance runner uses providerId-scoped bounded DELETE batches after disabling ingestion and source reads; the provider index and absence of blocking observation→receipt FKs make this possible without disabling immutability. Tests may use fixture-scoped direct DELETE. No actual production retention operation is authorized here.

Before live activation, the operational procedure must: revoke provider read/fetch entitlement; stop/drain/cancel queued provider work and in-flight fetches; delete acquired observations, relevant receipts/request metadata and derived/provider caches; verify zero surviving provider-derived data; only then finish termination. Restoring entitlement must not replay pre-purge queued polls; either completely drain/purge that work or introduce an explicit generation token in Task3 activation control. Task4 has no derived aggregate cache by default; any later cache must be keyed/invalidateable by provider. Licensing gates must also cover public source URLs/reference/qualifiers, not just amounts. Task2 deliberately does not invent retention durations or a live license table. Phase13 must verify the real runbook and permissions before activation.

## Real RED/native/PG evidence required after GO

- Pure failing provider/registry contracts and service behavior: all seven kinds preserved, especially SOLD_MEDIAN versus ASKING_PRICE; range shape, zero/missing, integer precision, ISO0/2/3/4, bounds and no probability invention. Unknown provider/field/private-payload rejection, byte limits and invalid UTC/day grammar.
- Real maintenance-created category/entry/variant/identifier fixtures; real PG insert/read shows provenance, qualifier separation and exact bigint values. Fail first on absent seam or concrete behavior; do not call a preloaded expected-output stub a DB test. Preserve honest RED versus migration scaffold chronology.
- Direct native insert tests bypass service: invalid amount/range/currency-exponent/time, wrong variant-parent relation, nonexistent revision, inactive/mismatched identifier and invalid snapshot membership; native duplicate indexes and UPDATE rejection; fixture DELETE works.
- Event equal retry/different content; same event after harmless new current revision retains original revision; recurring product different poll persists twice; same poll equal retry preserves first fetchedAt/FETCH observedAt; same poll changed content conflicts; same-ID multiple metrics/kinds/currencies/qualifiers stay distinct. Identical JSON qualifier maps with reordered keys deduplicate natively. Test empty batch and complete rollback when one of several rows is invalid/conflicting.
- Real concurrent PG transactions: equal/different same identity; two batches reverse input order; catalog writer held entry lock, ingestion waits then rejects changed revision; ingestion held entry SHARE, variant retirement waits then historical row survives with old revision. No sleeps as proof of lock acquisition; use controlled transaction barriers and bounded timeouts.
- Transaction seam test: call ingestion inside caller-owned transaction, deliberately fail caller, verify no observation persisted. Task3 must prove atomic receipt rollback, empty-success receipt, pre-fetch skip after committed retry and catalog retirement, persisted pollId and actual run.ts/main.ts composition separately.
- Use Task1 finalized transaction-local UTC workaround and explicitly test non-UTC session plus year0001 roundtrip. Only additive migration generated after actual Task1 final latest migration/current UTC; no reset or edited applied migration. Add market DB suite to `.github/workflows/ci.yml` dedicated `RUN_DATABASE_INTEGRATION=1 ... --no-file-parallelism` allowlist; package-only pnpm test does not run the DB-gated suite. No local Docker.

## Producer/consumer and task boundaries

| Producer | Consumer | Contract / owner |
|---|---|---|
| Task1 Money, pinned ISO metadata | Task2 validation/native scale | Reuse finalized helper/pairs; stored exponent, bigint; no Task1/purchase refactor |
| Phase05 catalog maintenance/revision reader | Task2 preparation/ingestion | Exact selected identifier and revision snapshot; entry→variant locking; active variants/identifiers |
| Task2 market-data types/registry | Task3 handler and Task6 adapters | One global exact target, persisted pollId, seven kinds, source precision and explicit qualifiers |
| Task2 transactional ingestion | Task3 committed receipt | Same tx observation+receipt commit; Task3 owns its new receipt migration/worker skip |
| Existing queue client/runtime | Task3 producer/handler | Payload carries pollId; singleton is scheduling exclusion only |
| Task2 immutable rows | Task4 owner-bound comparison, Task5 UI | Source/kind/currency/qualifier-separated reads; bounded paging, string bigint DTO + exponent + timestamp basis/precision |
| Task6 endpoint mapping | Task2 accepted observations | Exact numeric lexemes and source semantics, no guessed grade or sale timestamp; fake HTTP first |
| Task3/6 activation policy | Task4 readable-source filter; Phase13 retention | Disabled by default, license/public-display entitlement, provider-scoped purge/drain/cache invalidation |

## Named source evidence

- Binding `docs/superpowers/specs/2026-09-19-sammlerraum-design.md` §§5.5,15.1–15.4: separate personal facts, preserve history/source/time/kind/range; no invented aggregate precision.
- BASE `packages/db/prisma/schema.prisma`, CatalogEntry/Variant/ExternalIdentifier/Revision: entry revision and immutable history identity; optional variant relation uses native composite parent key; variants/identifiers active; no entry retiredAt or global identifier uniqueness.
- `packages/domain/src/catalog/catalog-service.ts`: `mutate` entry FOR UPDATE and revision CAS; `persistState` retires then upserts stable IDs; maintenance wrappers own ReadCommitted transactions; no user canonical-write route.
- `packages/domain/src/catalog/catalog-read-service.ts#getCurrentCatalogEntry`: single-statement current-revision snapshot; `packages/domain/src/catalog/item-catalog-locks.ts`: existing entry SHARE→variant SHARE order.
- `packages/contracts/src/catalog.ts`: strict canonical-only schemas and explicit sources, not personal condition/grading DTOs; `packages/db/prisma/migrations/20261017225200_catalog_revision_guard/migration.sql`: native UPDATE rejection with fixture/operator DELETE allowed.
- `packages/queue/src/types.ts`, `runtime.ts`, `pg-boss-queue.ts`: only job.data reaches handlers, persisted exclusive policy and active singleton suppression. `apps/worker/src/run.ts` owns real composition; `main.ts` owns lifecycle shutdown ordering.
- `.github/workflows/ci.yml`: PostgreSQL17 migration deploy and explicit DB-gated serial suite list. `packages/domain/src/catalog/catalog-service.integration.test.ts`: actual maintenance fixture and scoped cleanup precedent.
- Approved `task-1-context.md`: exact Money/exponent/native currency pairs and actor-ID rules. Root's additional confirmed driver evidence delivered during this preflight: `@prisma/adapter-pg`7.10 timezone/year0001 defect and approved transaction-local UTC/explicit timestamptz workaround; not inferred from WIP.
- `provider-preflight.md` primary evidence already supplied by root: [PriceCharting official API](https://www.pricecharting.com/api-documentation): current guides, product IDs, no historical sales, integer pennies, one request/second, termination purge/commercial-use gate. [Scrydex prices](https://scrydex.com/docs/getting-started/prices) and [Pokémon history](https://scrydex.com/docs/pokemon/price-history): explicit prices opt-in, varied qualifiers/currencies, day-precision history. [Scrydex caching](https://scrydex.com/docs/getting-started/best-practices) does not independently establish redistribution rights. No fresh external lookup/API call was made by this preflight; Task6 must recheck exact endpoint mapping and licensing.

## Concrete root rulings requested before implementation

1. Approve one exact catalog target/identifier per 0–100-row batch; strict revision invalidation for even unrelated edits; entry-level mapping never silently binds a variant; native INSERT guard validates current match while old rows survive later retirement. Cost: a changed catalog can discard one already-fetched response.
2. Approve native EVENT/POLL partial identities including explicit sourceMetric/kind/currency/bounded JSONB qualifiers; semantic equal retries preserve first fetchedAt, exclude audit matched revision from equality; changed same-key data conflicts, never updates. Cost: a provider correction to a stable upstream event requires a future explicit correction policy rather than silently replacing the original.
3. Approve FETCH-basis fallback and SOURCE/DAY precision, plus conservative future-day rejection, and one response-receipt fetchedAt per batch. Cost: unsupported/coarse/timezone-ambiguous data can be rejected instead of guessed.
4. Approve Task2 transaction-scoped ingestion + wrapper now, Task3-owned minimal committed receipt/table/advisory serialization and persisted pollId next; no receipt model in Task2 migration. Cost: Task2 alone cannot prove pre-fetch committed-job skip; Task3 is mandatory before scheduled sync is complete.
5. Approve provider-scoped privileged DELETE compatibility and explicitly defer live activation/read entitlement + actual purge runner/runbook to the stated later tasks; no operator-proof retention claim or deletion action now. Byte bounds and conservative public URL policy above are recommended implementation defaults, with no broader product decision needed.
