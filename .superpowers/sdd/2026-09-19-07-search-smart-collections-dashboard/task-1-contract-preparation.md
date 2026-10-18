# Phase07 Task1 contract preparation — read-only reconciliation

Prepared 2026-10-18 against root-supplied committed `570a9cc`. Task1 brief was read first, followed by preflight, root rulings and progress. This report is the sole written artifact. No source, test, schema, index, generation, DB, network, suite, commit, HEAD mutation or child-agent action was performed. Phase06 final review/CI remains a prerequisite; its final verified exports must be reconciled at a later explicit BASE/GO. This is a proposal for root adjudication, not Task1 implementation or Phase07 completion.

Root L1.1–4 and P7.1 bind this proposal. During preparation root recorded that Phase06 source groups are browsing containers, not semantic market-filter equivalence, approved the separate opaque legacy `unitKey` declaration (exponent0..9/int64 endpoints), and adopted owner-only/stored-visibility/actual-definition semantics and finite preflight budgets. Root subsequently adjudicated year as actual INTEGER semantics including negatives, excluded an invented wishlist leaf, and required market selection relative to each item's exact current mapping. This report reconciles to those rulings; none grants source GO.

## Concrete source reconciliation

| Existing surface | Actual reusable contract / limit | Consequence |
| --- | --- | --- |
| `contracts/items.ts`, `collections.ts` | TradeStatus/Visibility schemas, canonical timestamp; legacy purchase safe-number amount/currency pair, no evidenced exponent | Reuse enum schemas. Do not reuse `PurchaseCurrencySchema`'s runtime ICU set as monetary interpretation authority. |
| `contracts/custom-fields.ts`, domain custom-field service | Ten `CustomFieldType` values; INTEGER safe integer; DECIMAL canonical exact string with <=20 integer / <=18 fractional / <=38 significant storage digits; DATE real YYYY-MM-DD; custom selections expose authored strings | All ten types receive a typed predicate branch. Custom selection operands are authored option strings resolved with existing NFKC/trim/space-collapse/`und` lowercase identity, never invented UUID options. |
| `contracts/catalog.ts`, category-template service | Category/definition UUID; stable option **keys**; canonical value uses same ten types; attributes belong to ENTRY or a particular variant | Catalog selection operands are keys, never translated labels. Definition category and declared type must match. No generic JSON paths. |
| `contracts/condition.ts` | Category+scheme+option identities; normalizedBand 1..5 or null; inactive facts retained | Exact option predicate binds category+option; band comparison is explicit and never inferred from label or position. |
| `contracts/grading.ts` | Provider+authored grade; optional paired comparableValue/scale; certificate, calendar date; record cap100 | Grade comparisons bind provider+authored scale. No cross-provider label conversion; multiple-record predicates bind one record. |
| `items/tag-service.ts` | Owner tag identity = NFKC, trim, whitespace collapse, lowercase; normalized name max100 UTF-16 units | Search the same normalized identity. Unknown valid tag names are allowed, giving zero matches today and dynamic matches later. |
| `contracts/media.ts`, actual MediaLink/DocumentLink | Image/document kinds, READY state, document category; owner-matched links/assets | Presence means a usable linked READY asset; pending/failed/orphaned/cleanup assets do not qualify. A document predicate is distinct from image presence. |
| `contracts/valuations.ts` | `AmountMinorSchema` string0..9223372036854775807; stored exponent0..4; manual PER_UNIT; seven MarketKinds; SourceKey omits sourceMetric/qualifiers | Reuse monetary scalar/enums. Latest manual is selected before monetary range. A market filter requires a new semantic selector; do not alter Phase06 browsing DTOs. |
| domain money exports | `Money={amountMinor:bigint,currency}`; pinned currency table in `money/currencies.ts`; table has no runtime dependencies | Keep Money as internal arithmetic, wire amounts as strings and exponent separately. Existing table remains the only current currency-code authority. Never add a second frozen table to contracts. |
| export maps | No contracts `./search` or domain `./search/filter-ast` yet | Future Task1 needs these explicit package exports in addition to the three brief files. Contracts imports contracts only; domain can import contracts and its own currency module. No Prisma/Node/market provider imports in browser contracts. |
| absent producers | Persisted membership Phase09; DuplicateRelation/WishlistEntry Phase10; legacy interpretation producers unimplemented; bounded market eligibility/filter seam absent | Preserve required Task1 syntax, but deterministic semantic/capability validation rejects the entire request until its producer is wired. Wishlist is not a Task1 leaf and remains a Phase10 search/UI extension. Parser success alone never means executable support. |

## Proposed precise v1 surface

`ItemFilterSchema` describes the complete **versioned envelope** below. Also export `ItemFilterNodeSchema` and inferred DTO types, so no consumer confuses a root node with a persisted versioned definition. Omitted/null filter means no filter at the enclosing request level; `{version:1,root:null}` is invalid. Unknown versions are explicit `FILTER_VERSION_UNSUPPORTED`, never auto-upgraded. Every object is strict; no unknown keys are stripped.

```ts
type ItemFilter = { version: 1; root: ItemFilterNode };
type ItemFilterNode =
  | { kind: 'and' | 'or'; children: ItemFilterNode[] } // 1..50
  | { kind: 'not'; child: ItemFilterNode }
  | ItemFilterLeaf;

type FieldSelector =
  | { source: 'CUSTOM'; collectionId: UUID; definitionId: UUID }
  | { source: 'CATALOG'; categoryTemplateId: UUID; definitionId: UUID;
      target: 'ENTRY' | 'SELECTED_VARIANT' };

type Presence = { op: 'present' } | { op: 'missing' };
type SetPredicate<T> = { op: 'eq'; value: T } | { op: 'in'; values: T[] };
type OrderedPredicate<T> = SetPredicate<T>
  | { op: 'lt' | 'lte' | 'gt' | 'gte'; value: T }
  | { op: 'between'; min: T; max: T }; // inclusive; min<=max
type TextPredicate = SetPredicate<string>
  | { op: 'contains' | 'startsWith'; value: string };
type SetMembership = { op: 'hasAny' | 'hasAll'; values: string[] };

// Each line is a distinct strict object branch, not an uncorrelated type/op/value bag.
type TypedFieldPredicate =
  | { valueType: 'SHORT_TEXT' | 'LONG_TEXT'; test: TextPredicate | Presence }
  | { valueType: 'INTEGER'; test: OrderedPredicate<SafeInteger> | Presence }
  | { valueType: 'DECIMAL'; test: OrderedPredicate<ExactDecimalString> | Presence }
  | { valueType: 'DATE'; test: OrderedPredicate<CalendarDate> | Presence }
  | { valueType: 'BOOLEAN'; test: { op:'eq'; value:boolean } | Presence }
  | { valueType: 'SINGLE_SELECT'; test: SetPredicate<string> | Presence }
  | { valueType: 'MULTI_SELECT'; test: SetMembership | Presence }
  | { valueType: 'URL'; test: SetPredicate<CanonicalHttpUrl> | Presence }
  | { valueType: 'MONEY'; test: LegacyMoneyRange | Presence };

type CanonicalMoneyUnit = { currency: Uppercase3; minorUnitExponent: 0|1|2|3|4 };
type LegacyMoneyUnit = { currency: Uppercase3; minorUnitExponent: Integer0To9;
  unitKey: NonemptyOpaqueToken };
type LegacyMoneyRange = { op:'range'; unit:LegacyMoneyUnit;
  minMinor?: AmountMinorString; maxMinor?: AmountMinorString };
type CanonicalMoneyRange = { op:'range'; unit:CanonicalMoneyUnit;
  minMinor?: AmountMinorString; maxMinor?: AmountMinorString };
```

`range` has one or both endpoints, inclusive; both require exact `BigInt(min)<=BigInt(max)`. No null/open endpoint sentinel, exponent inference, negative, float, exponent notation, leading plus, leading zero or Number coercion. Individual endpoints reuse canonical int64 nonnegative integer strings, including `0` and the exact max. Aggregate arithmetic is outside Task1 and must not inherit an int64 sum ceiling. `unitKey` is 1..128 ASCII `[A-Za-z0-9][A-Za-z0-9_.:-]*`, case-sensitive and untrimmed; it is merely a selector that future approved interpretation policy must resolve, never evidence or authority. Declarative exponent0..9 is **not** a supported historical-exponent promise. Unsupported legacy codes/units remain structurally representable and semantically unavailable. Current canonical manual/market uses existing currency+stored exponent, without a forced common unit abstraction/table.

### Closed leaf matrix

In this table braces enumerate **all** fields of that leaf; `test` is one of the strict correlated predicate shapes above. Do not add generic `field`, comparison, JSONPath, SQL/Prisma object, regex, expression or arbitrary sort discriminants.

| `kind` | Exact other fields | Allowed values and meaning |
| --- | --- | --- |
| `category` | `test:SetPredicate<UUID> | Presence` | Personal stored categoryTemplateId, exact UUID only. |
| `manufacturer` | `selector:FieldSelector`, `predicate` | A `TypedFieldPredicate` restricted to SHORT_TEXT/LONG_TEXT/SINGLE_SELECT. An explicitly selected real field; no label/key guessing or universal column. |
| `year` | `selector:FieldSelector`, `predicate` | Actual INTEGER typed predicate including authored negative safe integers plus presence. Explicit actual integer definition; no calendar range reinterpretation or DATE-year extraction. This proposal retains a named branch with exactly the generic INTEGER semantics; root also permits expressing the same capability through the generic typed selector. |
| `condition` | `categoryTemplateId:UUID`, `test:SetPredicate<UUID> | Presence` | Option belongs to given category; retained inactive options remain valid exact facts. Presence means condition within that category, not global condition. |
| `conditionBand` | `test:OrderedPredicate<Integer1To5> | Presence` | Existing authored normalizedBand, independent of display labels; null band is missing. |
| `grading` | `test` | One of the grading branches below; one matching Grading row satisfies a positive test. |
| `purchaseMoney` | `test:LegacyMoneyRange | Presence` | Per-unit purchase pair only; quantity is never silently multiplied into a predicate. Presence is usable without interpreting amount. |
| `manualMoney` | `test:CanonicalMoneyRange | Presence` | Latest manual valuation for item by observedAt/createdAt/id DESC **before** currency/exponent filtering; per-unit. No older same-currency fallback. |
| `marketMoney` | `selector:SemanticMarketSelector`, `test` | Point range or explicit interval relation below. All operators, including presence, require trusted eligibility/rights and the future bounded seam. |
| `tags` | `test:SetMembership | Presence` | Exact actor-owned normalized names; `hasAll` applies to distinct names; presence means >=1 tag. |
| `duplicate` | `value:boolean` | Item participates in an explicit canonical DuplicateRelation with a distinct other item in authorized lifecycle scope. Quantity/title similarity is irrelevant. Whole-query unavailable until Phase10. |
| `tradeStatus` | `test:SetPredicate<TradeStatus>` | Reuse existing enum; always present. |
| `visibility` | `test:SetPredicate<Visibility>` | Explicit stored item setting; never authorization or effective ancestor visibility. |
| `media` | `mediaKind:'IMAGE' | 'DOCUMENT'`, `test:Presence`, optional `documentCategory` | READY usable asset through the appropriate owner-matched link; category only permitted for DOCUMENT, using existing DocumentCategorySchema. No pending-upload/existence leakage. |
| `createdAt` / `updatedAt` | `test:OrderedPredicate<CanonicalUtcInstant>` | Actual persisted item timestamps, always present; inclusive range. |
| `customField` | `selector:{source:'CUSTOM',collectionId,definitionId}`, `predicate:TypedFieldPredicate` | Match only items of that collection; exact resolved definition type. All ten field families retained. |
| `catalogAttribute` | `selector:{source:'CATALOG',categoryTemplateId,definitionId,target}`, `predicate:TypedFieldPredicate` | ENTRY value only or exact currently selected active variant value only, no entry/variant fallback or any-variant search; category/type must match. All ten field families retained. |

Grading `test` is the strict union:

```ts
type GradingTest = Presence
  | { op:'authored'; provider:string; grade?:string; certificateNo?:string }
  | { op:'comparable'; provider:string; scale:string;
      value: OrderedPredicate<GradingComparableString> };
```

Provider-only authored matching is allowed. When grade and/or certificate are supplied they are ANDed on the **same** row, not independent existential matches. Provider, grade and scale use existing authored NFC/trim normalization, max120; certificate max160. Equality is exact case-sensitive authored text after normalization. Comparable schema reuses `GradingComparableValueSchema`; comparisons are exact decimal arithmetic. Absent comparable pair is a non-match. There is no provider conversion or inferred certificate authenticity. Presence means any owned grading record, not a numeric value.

All `in`/hasAny/hasAll arrays have1..50 operands and reject duplicates **after** canonicalization, rather than quietly removing clauses. Missing/present have no value keys. Positive comparisons on absent values are false. A stored `false`, numeric0, money0 or authored empty MULTI_SELECT array is present; an empty multi-select value fails nonempty hasAny/hasAll. Scope-specific `missing` (custom/condition/catalog) means “selector applies to this item and its fact is absent”; it does not sweep in every item of other collections/categories. Inapplicable items make both scope-specific present and missing false. Catalog linked absence in the matching personal category is missing; no selected variant is missing for SELECTED_VARIANT. Invalid/dangling definitions are errors, not missing facts.

There is **no wishlist leaf in this v1 union**. Submitted `kind:'wishlist'` is FILTER_INVALID as an unknown discriminant, not an accepted unavailable/no-op placeholder. Root ruled that Task1 mandates duplicate, while actual wishlist search belongs with the Phase10 producer/UI. Phase10 must define entity/fulfilled/free-title/target semantics and add a deliberate compatible language extension or version migration if item-filter integration is required; this report invents no item-to-wishlist relation.

Logical NOT complements that Boolean result **after** availability succeeds: NOT(eq X) includes missing and inapplicable rows inside the independently authorized outer scope. SQL compilation must preserve this two-valued contract with EXISTS/NOT EXISTS or explicit null handling. Builder language must explain that distinction. Unknown/unavailable facts are never converted to false for NOT to invert. Empty AND/OR and contradictory ranges are invalid. No constant TRUE/FALSE nodes are needed.

### Market equivalence is finer than a Phase06 browsing group

```ts
type SemanticMarketSelector = {
  mode:'CURRENT_ITEM_MAPPING';
  providerId:string;identifierNamespace:string;identifierType:string;
  kind:MarketKind;currency:Uppercase3;
  sourceMetric:string;
  qualifiers:Record<string,string|boolean>;
  minorUnitExponent:0|1|2|3|4;
};
type MarketTest =
  | { op:'range'; minMinor?:AmountMinorString; maxMinor?:AmountMinorString }
  | { op:'overlaps'|'containedBy'; minMinor:AmountMinorString;
      maxMinor:AmountMinorString }
  | Presence;
```

Source fields reuse the relevant `SourceKeySchema` provider/namespace/type grammars and max64 UTF8 byte caps, without trim/case conversion. sourceMetric follows actual admission grammar `[a-z][a-z0-9_.:-]{0,63}`. Qualifiers mirror actual admission: <=16 own entries; keys `[A-Za-z][A-Za-z0-9_.:-]{0,63}`; strings<=128 UTF8 bytes or boolean; controls/unpaired surrogates rejected; canonical JSONB serialized size<=1024 bytes using the admission accounting. Full key/value set equality, preserving key case/string bytes/false-versus-absent; key order is immaterial. Empty `{}` is exact unqualified, not wildcard. Each item supplies its exact current linked entry+nullable selected variant and live provider namespace/type external mapping; that target is never inferred from translated title or supplied as one global product ID. Server-resolved external IDs retain the actual max256 UTF8 byte bound.

`kind!='PRICE_RANGE'` permits range/presence; PRICE_RANGE permits overlaps/containedBy/presence. Intervals are closed: overlaps iff observation.low<=query.max AND observation.high>=query.min; containedBy iff query.min<=observation.low AND observation.high<=query.max. No midpoint/end-point substitution. For each item resolve the exact current target and provider mapping with Phase06-equivalent current identifier/variant/immutable snapshot validation and trusted display grants. Zero eligible mappings/observations is missing after rights capability succeeds. More than one eligible semantic mapping/external product ID for an item makes the **whole query** unavailable; never choose the first/highest mapping or take latest across product IDs. For the unique mapping select latest eligible observation by observedAt/createdAt/id DESC inside the entire provider+resolved external ID+kind+metric+full qualifiers+currency+exponent selector. No fallback to manual/purchase/other metric/other qualifiers. Disabled rights returns generic whole-query unavailable, never existence/count of hidden observations.

Phase06 SourceKey deliberately groups provider/namespace/type/externalId/kind/currency and presents per-observation sourceMetric+qualifiers, with aggregate:null. It can therefore browse several semantic metrics in one group; taking its first row would not implement this selector. Root requires inventory-relative CURRENT_ITEM_MAPPING semantics above, so the same source/metric filter is useful across owned inventory while retaining each item's exact target. A global fixed-target/externalId filter and historical mapping are deferred modes, not accepted keys or silent wildcard behavior. Root agreed to this seam distinction without expanding Phase06. Task2 must supply a bounded snapshot-consistent batch seam, ambiguity handling and rights policy parity tests before accepting even `marketMoney present/missing`; looping paginated item histories is not that seam.

## Structural parser and deterministic validation stages

The pure foundation should expose `validateFilterComplexity(input:unknown):void` (brief interface) and a bounded `parseItemFilter(input:unknown):ItemFilter` used by `ItemFilterSchema` itself. Guard then recursive strict schema; do not expose an unguarded public lazy recursive schema that saved JSON/client code can call directly. A browser-safe `parseItemFilterJson(raw:string)` can perform lexical guard+JSON parse and then the same object parser. HTTP streaming/body/URL byte enforcement belongs to Task2 adapters, not a fictitious Task1 network implementation.

1. **Transport/raw guard:** decoded filter JSON<=16KiB UTF8; canonical direct-object serialization must also fit16KiB. Entire encoded query<=32KiB and smart mutation body<=24KiB are adjacent adapter proposals requiring root acceptance. Browser/domain code uses TextEncoder, not Buffer. Reject malformed Unicode before byte counting; fatal UTF8 at HTTP boundary. Bracket/string/escape-aware scan rejects >32 simultaneous JSON object/array containers before JSON.parse. JSON syntax is still JSON.parse's job. Reject duplicate JSON member keys after escape decoding, including `kind` versus `\u006bind`; native JSON.parse otherwise silently overwrites. Implement this with the same bounded lexical walker or a tested small duplicate-key scanner, not a reviver that has already lost keys. Bare HTTP Content-Length is not a byte ceiling.
2. **Iterative in-process guard before recursion/stringification:** <=512 total JSON values visited (root, every array/object and primitive property/element value; each own property/array element therefore consumes a visit); <=32 own keys per object; <=50 array elements; property-key length<=128 UTF8 bytes; each scalar string<=10,000 UTF16 units/40,000 UTF8 bytes before tighter type caps; all strings have no NUL/unpaired surrogate. This is the adopted P7.1 cumulative node/property budget, not512 only for logical nodes. Reject unsupported values (undefined/bigint/function/symbol/NaN/infinities), accessors, symbol properties, nonplain objects, sparse/non-index-property arrays and cycles. Use active-path cycle detection; do not skip repeated references via a global “visited” set. Reject repeated container identity as non-JSON tree to avoid DAG counting ambiguity. Copy accepted own data properties into a JSON-only snapshot before later stages; no caller mutation across asynchronous execution. Do not call arbitrary `toJSON`, getters or user functions. Proxy side effects cannot be made safe by JS structural validation; public network input must originate from JSON.parse, and in-process objects are trusted caller objects apart from shape.
3. **AST complexity:** max5 logical ancestors for every leaf, counting AND, OR and NOT equally; leaf-only depth0, five NOTs+leaf valid, six invalid. Depth of JSON selector/value objects does not count as logical depth. Max50 leaf occurrences; count all branches with no simplification or deduplication. AND/OR1..50 children; NOT exactly one `child`, no children/value extras. Same bounds apply even when another branch is statically unavailable. All raw and AST budgets apply simultaneously; <=50 leaves is not a promise that fifty maximum-length leaves fit16KiB. Prefer explicit `FILTER_TOO_COMPLEX` for budget overflow; malformed shape gets `FILTER_INVALID`.
4. **Strict typed parse/canonicalization:** UUID lowercase; no number/string coercion; bounded correlated operators, ranges and type values. Canonical UTC instants reuse ValuationInstantSchema's real year1..9999/ms UTC rule; real date1..9999 is separate. Text operands: NFKC+trim for custom/catalog text, max255 SHORT_TEXT/max10,000 LONG_TEXT; contains/startsWith max200 code points/800 UTF8 bytes and nonempty. Text comparisons are case-sensitive canonical code-point comparisons, literal `%`, `_`, slash and quotes; no locale-dependent fold. URL equality/in uses canonical HTTP(S) URL without credentials, <=2048 UTF16 units, matching existing URL producer. Exact DECIMAL accepts existing producer grammar then canonicalizes sign/leading/trailing zeros with exact string logic and its storage precision; never Number. Lists reject canonical duplicates. Tag operand max100 after existing identity normalization. Selection strings<=200 (catalog keys use CatalogKeySchema max64); root must decide whether the bounded search form deliberately rejects exotic preexisting longer custom option values, or raise selection cap to actual metadata maximum. Current custom metadata max200 so propose200. No locale-generated SQL collation semantics.
5. **Pure definition/capability checks:** consume an immutable server-supplied bounded definition/capability snapshot, never accept it from client as authority. Resolve every referenced collection/category/definition/condition option; compare declared valueType to actual definition.type; validate membership of selection operands. Manufacturer/year use actual selected definitions under their restricted matrix; no semantic mapping guessed from label. Absent and unauthorized definitions yield the same `FILTER_REFERENCE_INVALID`. Wrong resolved type/option/category yields `FILTER_REFERENCE_INVALID` with safe node path, never an ignored leaf. Changes/deletion after save are revalidated on every resolution. Inactive retained option facts remain matchable. Task1 can define/test this pure error contract; fetching/locking/snapshot consistency remains Task2.
6. **Execution prerequisite check in Task2:** collect requirements across the **entire AST before Boolean evaluation**. Reject shared scope before query execution until Phase09; reject duplicate until Phase10; reject canonical legacy monetary comparisons until approved interpretation/unit producers exist; reject market predicates until real batch eligibility+rights seam. Wishlist input already fails the closed structural union. Later legacy enablement performs L1.3 complete coverage over independently authorized outer candidates in the same bounded snapshot before any AST/sort evaluation, including cases wrapped in NOT/OR or an otherwise false AND. Never narrow coverage by sibling AST leaves, current page, selector currency, or a first-source page to make unknown facts disappear. Relevant present facts are purchase pairs or the explicitly selected MONEY definition/target as appropriate; missing facts are distinct from unresolved/ineligible present facts. Timeout/scan budget exhaustion is unavailable, never partial success. A parsed filter must not directly reach SQL; Task2 obtains an internal executable form only after all checks.

The preflight's512 budget is made explicit above without raising the adopted limit. Fifty simple category/trade leaves can fit; fifty verbose typed-field/market leaves may exceed512 or16KiB and correctly reject. This is an intentional simultaneous bound, not truncation or guaranteed support for every combination below50 leaves. Empty logical trees are invalid, not budget errors. Cycles are `FILTER_INVALID`; huge/deep/wide/cumulative budgets are `FILTER_TOO_COMPLEX`. Unsupported version, malformed input, complexity, references and unavailable capability must remain distinguishable.

## Error and availability contract

Propose one serializable domain error algebra: `{code,reason?,path?}`. Codes: `FILTER_INVALID`, `FILTER_TOO_COMPLEX`, `FILTER_VERSION_UNSUPPORTED`, `FILTER_REFERENCE_INVALID`, `FILTER_UNAVAILABLE`. Paths are bounded arrays of **known schema property names**/indices0..49, max32 segments; unknown submitted keys use the enclosing known path, never echo the submitted name. Errors never echo input values, definition labels, raw protected observations or foreign ownership. HTTP mappings are Task2: invalid/complex/version400, reference400 (saved-resolution invalidity may map409), unavailable422, raw-byte overflow413. Fixed reason enum: `SHARED_SCOPE_NOT_IMPLEMENTED`, `DUPLICATE_NOT_IMPLEMENTED`, `LEGACY_MONEY_INTERPRETATION_UNAVAILABLE`, `LEGACY_UNIT_UNSUPPORTED`, `MARKET_FILTER_SEAM_UNAVAILABLE`, `MARKET_DISPLAY_DISABLED`, `MARKET_MAPPING_AMBIGUOUS`, `CAPABILITY_SNAPSHOT_LIMIT`. Return one error deterministically in preorder after structural/reference checks; do not let async fetch order choose it. Client UI availability hints are advisory only; server validates again.

Schema parse may accept a duplicate/legacy/market leaf as a valid **language value**. `validateFilterComplexity` likewise only proves bounded structure. Neither promises query execution. Current semantic validation rejects unavailable capabilities as a whole before compiling anything, preserving the leaf in saved-load error displays instead of dropping it. No accepted-executable no-op placeholder is permitted. Save/create policy should reject unavailable definitions until root explicitly permits saving currently non-executable syntax; loaded historical/unavailable definitions fail visibly rather than broadening their membership.

## Proposed focused future Task1 evidence

No tests were run in preparation. Future RED/GREEN work uses only pinned runtime `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm ...` after source GO. Meaningful pure tests in the brief test file should cover:

- Logical leaf0 / exactly5 /6; all NOT, mixed AND/OR/NOT and unbalanced deepest branch; exactly50 /51 leaves; NOT counts; a wide branch cannot hide leaves; invalid empty logical nodes and unknown keys.
- JSON nesting32 /33, UTF8 16KiB boundary including multibyte chars, raw duplicate/escaped-duplicate keys, malformed strings/escapes and bad UTF8 at later route boundary; direct objects receive equivalent caps without recursive stringify first.
- Raw-value512 /513, object-key32 /33, array50 /51, pathological unknown-property subtrees, cycles and shared container references, getters without invocation, sparse arrays, Date/Map, nonfinite numbers, bigint/undefined, invalid Unicode and unknown versions. Fifty simple leaves accepted, fifty verbose leaves can correctly fail cumulative512. Ensure exceptions are stable domain errors rather than RangeError.
- Every leaf/type/operator matrix row has acceptance and at least one rejected incompatible value/operator; unknown and extra discriminants never strip. Presence forbids amount/values. Single- versus multi-select, URL versus text, DATE versus timestamp, safe-number INTEGER versus exact DECIMAL string, booleans without coercion, exact money0/max/max+1 and reversed intervals.
- Definition snapshot wrong collection/category/type, deleted definition, unknown/foreign indistinguishable, selected variant versus ENTRY, inactive retained condition option, exact catalog keys versus translated labels/custom authored values. Manufacturer/year require selectors and allowed real types. No magic `manufacturer`, `year` or translated-label column fallback.
- Tag/selection normalization, duplicate canonical operands, exact decimal comparison (`2<10`, close38-digit values, negative/zero canonicalization), literal wildcard characters. Empty authored multi-select is present but hasAny false. Scoped missing versus NOT semantics documented with pure truth-table cases; SQL parity remains Task2.
- Unavailable duplicate/legacy/market beneath NOT, true OR sibling and false AND sibling rejects whole query. Wishlist discriminant is FILTER_INVALID under every wrapper. Capability/reference error order deterministic; missing/false/zero never stands in for unavailable. Pure tests prove stage contracts only, not DB coverage or permissions.
- Market selector requires CURRENT_ITEM_MAPPING/sourceMetric/full qualifiers/exponent; qualifier order equal, false distinct from absent, different metric/grade distinct, provider token limits and qualifier admission caps; range kind/operator coupling and overlap boundaries. Bare Phase06 SourceSelector and global fixed target/externalId keys are rejected as this filter. Pure prerequisite snapshots with >1 eligible semantic mapping reject whole query; actual per-item mapping/DB parity remains Task2.
- Browser-safe import/typecheck via existing tooling after focused tests; no DB, server-only import or contracts→domain cycle. Package exports included. Currency table not cloned, runtime ICU not invoked for canonical interpretation, existing Money and Phase06 schemas remain compatible.

## Root decisions still required before source GO

1. Approve remaining envelope/node field names, exact leaf/operator branches and finer scalar/key caps within P7.1's adopted budgets; additional pure parser/definition/error exports and two package export-map edits exceed the brief's literal three-file list and must be recorded in its executable scope.
2. P7.1 has settled stored visibility, owner-only initial authorization, actual definition selectors, complete structural language/separate availability and finite preflight limits. Keep those explicit current limitations without checking off shared/runtime producer requirements. This report does not reopen them.
3. Root settled year as actual selected INTEGER semantics including negative safe integers, with no date extraction/calendar reinterpretation. Confirm only the remaining manufacturer text/select matrix and whether named year/manufacturer branches add useful wire identity beyond typed selectors; no universal authored mapping producer is implied.
4. Root excluded wishlist from v1: unknown leaf is invalid; Phase10 owns real wishlist search/UI/entity semantics and a deliberate extension if needed. Duplicate counterpart lifecycle/scope still needs Phase10 acceptance and duplicate execution remains unavailable today.
5. Root settled useful inventory-relative CURRENT_ITEM_MAPPING with fixed semantic source fields and whole-query rejection for per-item ambiguous mappings; a fixed global target mode is deferred. Actual bounded eligibility/rights producer, inference permission and DB parity remain acceptance blockers. Display grants alone do not establish aggregation permission. No generic market total or cross-source metric is added.
6. Keep actual legacy metadata/evidence/unit policy as an independently reviewed prerequisite; this declarative language does not authorize sidecars, migration, backfill or data classification. Legacy comparison unavailability remains a real Task2 acceptance gap and full Phase07/08/13 gate, not a passed feature.

Task1 can be a complete pure language/complexity foundation after these rulings. Task2 must implement every **executable** accepted branch, prove DB/authorization/count/NOT semantics, and retain exact producer gaps. A structurally complete language with deliberate availability errors is not proof of full Phase07 delivery. No source GO or phase checkoff follows from this artifact.
