# Phase 06 Task 1 — canonical money and manual valuation history

Status: implemented and locally verified; independent review, exact-source CI, push, and canonical checkoff remain root-owned. Only Task 1 is implemented. Base: `eefd76a1d6d29c1925cc0daccfced22d02885f70` on `work/sammlerraum-v1`. Work performed 2026-10-18 approximately 01:50–02:01 UTC, well before the approved cutoff. No children, provider requests, Docker runs, resets, pushes, production writes, or live credentials.

## Governing constraints

Money is stored as integer minor units plus ISO 4217 currency. Manual estimates and external market observations are distinct. New values append history; they do not silently overwrite prior points. Offer prices, sold prices, medians, and catalog values retain their type. No external provider is scraped unless terms/licensing explicitly permit it.

Read the task brief first, approved task context second, and progress/preflight rulings third. Inspected actual item purchase contracts/parser and item/grading/collection service seams. Existing purchase money, its safe-number boundary, public projections, and unrelated grading logic were not refactored. No UI, REST contract/route, external observation, market provider, scheduler, FX calculation, or shared audit framework is included.

## Interfaces and semantics

- `@sammlerraum/domain/money/money` exports `Money { amountMinor: bigint; currency: string }`, `parseLocalizedMoney(input, locale: "de" | "en", currency)` and `MAX_AMOUNT_MINOR`.
- The parser checks raw length <=80 UTF-16 units before trimming. It accepts ASCII ungrouped integers, including leading zeros; or locale grouping with first 1–3 nonzero-leading digits and subsequent exact 3-digit groups. An integer is required. Currency is an exact uppercase accepted ISO code. Optional fractions have 1 through the ISO exponent digits; exponent zero forbids a decimal separator. Signs, currency symbols, whitespace inside a number, non-ASCII digits, malformed/mixed grouping, exponent notation, nonfinite forms, and excess precision including excess zeros are rejected. Arithmetic never converts amounts to Number. Allowed amount range is 0..9223372036854775807n.
- Both exact task examples pass: DE `1.234,56` EUR and EN `1,234.56` EUR each produce `123456n`. Tests also cover 0/2/3/4 exponents, leading-zero normalization, zero, exact amounts beyond MAX_SAFE_INTEGER, the PostgreSQL maximum, and maximum+1 rejection.
- `@sammlerraum/domain/valuations/valuation-service` exports `createValuationService(database, actorUserId)`, `ValuationDatabase`, `ManualValuation`, cursor/page types, and `ValuationServiceError`. Actor binding is strict: the existing case-sensitive text User.id is preserved exactly, including mixed-case non-UUID fixture IDs. Only actual UUID item/cursor fields normalize to lowercase.
- Service methods: `addManualValuation(itemId, { amountMinor: bigint, currency, observedAt?: canonical UTC string, note?: string|null })`; `listManualValuations(itemId, { limit?: 1..100, cursor?: { observedAt, createdAt, id } })`; `latestManualValuation(itemId)`. Unknown input fields and caller-provided owner, actor, type, exponent, or basis are rejected. Pagination defaults to 50 and fetches at most limit+1; no history returns latest null. Error codes are `VALUATION_INVALID`, `ITEM_NOT_FOUND`, `ITEM_INACTIVE`, and `VALUATION_LIMIT_EXCEEDED`.
- Every row has native type MANUAL and explicit basis PER_UNIT. Adding a value always inserts a new UUID row. Quantity edits preserve per-unit history; an actual quantity split retains history only on the source, and the new item has no authored valuation. No estimate or personal authorship is fabricated on split.
- The internal record retains bigint and Date objects plus persisted `minorUnitExponent`. Future JSON DTOs must serialize the amount as a decimal string and retain the stored exponent. This service is not a JSON boundary.
- Notes trim ECMAScript Unicode whitespace; empty notes become null, NUL is rejected, and the trimmed value is bounded to 2000 Unicode code points, matching PostgreSQL varchar length semantics.
- observedAt input is exactly the 24-character `YYYY-MM-DDTHH:mm:ss.sssZ` form with year 0001..9999 and calendar round-trip validation. Future observations are rejected against actual database clock captured after locks. Omitted observedAt is exactly the same millisecond as createdAt. Reads sort observedAt DESC, createdAt DESC, UUID DESC. Backdated additions do not displace a newer observed time; UUID order breaks complete timestamp ties deterministically rather than claiming insertion chronology. Cursors retain exact millisecond UTC strings. Separate pages see the ordinary committed append history; there is no cross-request snapshot promise.

## ISO metadata and storage

Pinned authoritative source: SIX ISO4217 List One, published 2026-09-17, 47,491 bytes, SHA256 `33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff`, supplied outside the repo at `../iso4217-list-one.xml`. Its hash and exactly 165 numeric-exponent codes were checked before deriving the literal source map and SQL accepted pairs. No runtime metadata fetch or ICU scale fallback exists. Source URL/provenance and deliberate update policy are documented in `currencies.ts` and the migration.

The explicit map includes UYI=0 and CLF/UYW=4; N.A. codes, unknown and retired currencies are rejected for new values. AFN is ISO exponent 2 while installed Node 24.19.0 ICU display reports zero; a real parser test asserts AFN `1.00` is 100n. The ICU probe is recorded. Future metadata updates must deliberately update new-input acceptance while retaining historical native pairs; readers interpret old rows using their stored exponent.

Additive migration `20261018015303_manual_valuations` follows the actual latest applied migration `20261017225206_item_catalog_links` and actual UTC time. It adds only ValuationType, Valuation, two indexes, its owner-bound item and actor FKs, checks and update-immutability trigger. Migration diff from the guarded test database supplied the additive scaffold; custom checks/trigger were added before its first application. No applied migration was rewritten and no reset occurred. Final migrate status reports all 22 migrations current; final introspection diff is empty. Native custom CHECK/trigger behavior is separately tested because Prisma diff does not prove those constraints.

Native constraints enforce nonnegative bigint; exact approved currency/exponent pair; PER_UNIT basis; actor=owner; valid nonempty trimmed note length; finite observedAt/createdAt, years 0001..9999, observedAt<=createdAt; item+owner composite ownership; actor existence. Timestamps are timestamptz(3). The item and actor FKs cascade on deletion and restrict key updates. The history index is `(itemId, ownerId, observedAt DESC, createdAt DESC, id DESC)` and actorUserId is separately indexed. No updatedAt exists.

Every SQL UPDATE, including a no-op update, raises a native constraint exception. The application exposes no update/delete method. Trusted direct DELETE and item/user cascade cleanup remain possible; this is not permanent operator-proof retention and no pg_trigger_depth bypass is used. Phase09 must deliberately migrate actor=owner and actor-erasure semantics together before collaborating authors diverge; shared audit, deletion/restore rules remain future work. Direct SQL can bypass application lifecycle/quota policy; native checks protect row invariants, not privileged operator behavior.

## Locking and timestamp findings

ReadCommitted operations discover an owned live item/collection, take Collection SHARE first, then revalidate and lock the owned live item (UPDATE for append, SHARE for reads). Foreign or soft-deleted parents/items are hidden as ITEM_NOT_FOUND; archived/disposed items remain readable but reject append. The parent lock gates actual deleteCollection, which locks only Collection UPDATE. Item UPDATE serializes append quota/lifecycle with actual quantity edits, split, archive, disposal and item deletion. No item→collection inversion or unrelated grading refactor was introduced. Cost: brief blocking of collection edits while private valuation operations run.

The append quota is 10,000 per item under the item lock, with no pruning. A real 9,999-row setup plus two concurrent service appends proves exactly one succeeds and the next rejects without exceeding 10,000.

A real year-0001 test exposed two installed timestamp boundary issues:

1. The pg driver serializes a JS Date using the host's historical local offset, losing seconds of Berlin's +00:53:28 offset: the diagnostic shows input `0001-01-01T00:00:00.000Z` becomes UTC `00:00:28.000` when passed as Date, while an explicit ISO string remains UTC `00:00:00.000`.
2. Installed `@prisma/adapter-pg` 7.10.0 `dist/index.mjs:274-275` rewrites a timestamptz offset to `+00:00` without converting the wall time. This produced incorrect ordinary timestamps/keyset pages and Invalid Date at the historical seconds offset. Installed dependency excerpt is saved in `logs/task-1-adapter-provenance.txt`.

Root explicitly approved the bounded workaround: each valuation transaction calls `set_config('TimeZone','UTC',true)` and binds canonical ISO strings with explicit timestamptz casts. There is no shared-client, global-session or legacy timestamp refactor. Cost: one transaction setup query and continued discipline at the read/bind boundary. Real non-UTC regression forces Europe/Berlin before service work, proves the service sees UTC, checks exact year 0001, verifies canonical keyset behavior, and compares zone AND backend PID before/after to prove the transaction-local setting restores outside it. Actual post-lock clock tests assert createdAt is captured after waiting rather than transaction-start time.

## Verification and actual chronology

All runtime invocations use this exact prefix:

```sh
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm
```

Synthetic environment was sourced from `../sammlerraum-test-env.sh`. Before migration, an actual pg connection checked NODE_ENV=test, URL localhost:5432/sammlerraum_test, current_database sammlerraum_test, current_user test, and server version 17.11 (Homebrew). All DB-enabled Vitest runs used `--no-file-parallelism`. The new DB file was added to the actual dedicated CI allowlist; the ordinary test command intentionally skips DB integration unless enabled.

| Command after the exact runtime prefix | Result / evidence |
| --- | --- |
| `vitest run packages/domain/src/money/money.test.ts` against deliberate throwing scaffold | Genuine behavioral RED: 15 valid examples fail because parser is unimplemented; rejection cases already throw. `task-1-money-red.log` |
| Same after parser implementation, first attempt | 49 pass, 1 fails: mistaken initial ISK=2 test assumption. Verified pinned map says ISK=0; corrected fixture to ISO AFN=2, not production metadata. Misnamed first attempted-green log retained: `task-1-money-green.log` |
| DB-enabled `vitest run packages/domain/src/valuations/valuation-service.test.ts --no-file-parallelism` against deliberate throwing service scaffold | Genuine behavioral RED for missing service functionality, using actual fixture DB. `task-1-service-red.log` |
| Extended same suite before additive schema deploy/generation | 5 service behavior failures plus 2 honest schema/client scaffold failures (missing model/table), not claimed as behavioral TDD. `task-1-service-schema-red.log` |
| `--filter @sammlerraum/db prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --output /tmp/sammlerraum-valuation-migration.sql`; then `prisma migrate deploy`; `prisma generate` | Success after target guard. No reset/history rewrite. Diff/deploy/generate logs retained |
| DB-enabled `vitest run packages/domain/src/money packages/domain/src/valuations --no-file-parallelism`, initial attempts | Native time boundary failure; then year 0001 read failure and keyset duplicate exposed timezone issues. UTC fix then exposed one ORM Date tie-fixture written under non-UTC session; fixture corrected to explicit ISO-bound native timestamps. All attempted-green logs retained |
| Same after UTC fix/fixture correction | 57/57 (7 DB+50 pure), `task-1-service-green-final.log` |
| Expanded real race suite, first attempt | 65 pass, 1 test error: called nonexistent items.getItem; fixed test observation to actual DB read. `task-1-locks-attempt.log` |
| Same final focused suite | **67/67: 17 real PG +50 pure**, `task-1-focused-green.log` |
| DB-enabled `vitest run packages/domain/src/items/item-service.test.ts packages/domain/src/collections/collection-service.test.ts packages/domain/src/grading/grading-service.test.ts --no-file-parallelism` | **44/44**, `task-1-existing-db-regression.log` |
| `test` | **475 passed, 168 intentionally DB-gated skipped, 53 files passed/24 skipped**, `task-1-workspace-test.log` |
| `exec prettier --write` new source/tests/package/schema/workflow | Source formatted, but command returned 2 because Prettier has no Prisma parser. Used proper `--filter @sammlerraum/db prisma format` successfully instead. Both logs retained |
| `lint` | **PASS**, all workspace packages, `task-1-lint.log` |
| `typecheck`, first attempt | Source/package checks passed; web failed on pre-existing ignored `.next/types/* 2.ts` duplicate declarations. `task-1-typecheck.log` |
| `typecheck`, after generated-artifact preservation | **PASS**, `task-1-typecheck-clean.log` |
| `build` with NODE_ENV=production | **PASS**, all packages, worker bundles, Next optimized production build, `task-1-build.log` |
| `--filter @sammlerraum/db prisma migrate status`; final `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | **22 current migrations; empty diff**, final status/diff logs |

Later race/privacy cases extend the initial service RED/GREEN rather than claiming each subsequently added test independently went RED. Tests execute real PostgreSQL and actual existing service mutations; pause wrappers delegate the real transaction queries and only hold barriers to observe native waits. Coverage includes foreign/case-sensitive identity, append retention, exact large amounts and stored exponent, lifecycle/read privacy, direct SQL constraints/no-op UPDATE rejection/trusted DELETE, soft deletion retaining history, hard item deletion cleanup, actual quantity/split behavior, bounded pages/defaults/cursors, backdated/tied timestamps, actual mutation races, actual collection deletion winning the parent lock, item archive winning the item lock, and the actual public projection omitting private valuation facts.

Pre-existing generated-artifact issue: four ignored `.next/types/* 2.ts` files dated 03:22 local were byte-identical to canonical generated siblings dated 03:29. Read installed Next 16.3.5 typegen and agent-rules guidance, compared every file, then preserved duplicates outside checkout at `../phase06-task1-generated-duplicates/`. SHA256/path/mtime evidence is `logs/task-1-generated-duplicates.json`. No source/tsconfig workaround, instruction overwrite, or generated policy file change was made. Build produced no new managed AGENTS/CLAUDE files.

Final staging initially reported trailing terminal whitespace/blank EOF lines in raw command logs (`git diff --cached --check`, preserved in `task-1-staged-whitespace-before.log`). Verbatim logs are preserved outside checkout at `../phase06-task1-raw-logs/`; committed log copies normalize only trailing line whitespace and blank EOF lines, without removing failures or changing substantive output.

## Handoff and limitations

Task implementation and local checks are complete. Root still owns independent required reviews, exact-source full CI (including real DB allowlist/browser/image checks), backup/source push, canonical checkoff and main ledger-only synchronization. This report does not claim those gates ran locally. No local Docker/images/browser reruns were needed for the private domain/schema change. Preserve the dirty root-owned Phase05 progress, Phase06 progress/context and canonical ledger; they are explicitly excluded from this task commit.

Known deliberate costs: explicit pinned currency metadata maintenance and retention of historical pairs; stored scale and bigint string DTO discipline; one UTC setup query per valuation transaction; collection edit blocking during reads/appends; bounded per-item history refusing further writes at cap; splits initially lacking a new authored estimate; operator DELETE remaining possible; later Phase09 actor/audit/erasure migration required. There is no FX or estimate aggregation and no invented external valuation/provider facts.
