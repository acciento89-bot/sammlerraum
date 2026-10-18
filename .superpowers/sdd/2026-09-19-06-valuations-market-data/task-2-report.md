# Phase06 Task2 implementation report

Status: implemented and locally verified; ready for root independent SPEC/QUALITY review and exact-source CI. No canonical checkoff, push, main sync or Task3 GO is claimed. BASE `d55c86a4cfb60561e98eec996f0d72643a022df4`. Work began around 02:15 UTC and finished around 02:32 UTC on 2026-10-18, within the cutoff. Root's five approved preflight rulings and clarifications govern.

## Delivered

- New dependency-free `@sammlerraum/market-data` package, explicit immutable provider registry, empty default registry and typed `MarketDataProvider.fetch(request): Promise<MarketObservation[]>`. Package documentation states activation/display/retention boundaries. No HTTP/adapters/default fake provider.
- Seven separate kinds with exact bigint point/range values; pinned Task1 currency/exponent validation and historical exponent storage. No new currency parser/framework or legacy-money changes. Structured authored qualifiers/confidence retain missing versus zero/false and explicit SOURCE DAY/SECOND/MILLISECOND versus FETCH provenance.
- Strict runtime object/field/type/UTF-8/JSONB limits; one exact target per 0–100-row batch, 256 KiB serialized batch, 4 KiB metadata, 1024-byte qualifiers. Input is validated and copied before acquiring a transaction. Public source URLs are conservatively HTTPS without query/fragment/auth; raw provider payloads and private item/user facts are not accepted.
- Server-only `createMarketDataService(database, registry)` returns `prepareFetchRequest`, `recordObservations`, `recordObservationsInTransaction`, and provider-specific bounded `listObservations`. Preparation returns current canonical mapping and revision; no private joins. RecordResult contains stable identity-ordered IDs and unique inserted/reused counts. Repeated identical inputs within a batch count once.
- Native EVENT versus POLL partial uniqueness includes source product, stable event or durable poll, metric, kind, currency and bounded JSONB qualifiers. Equal retries preserve original row/first retrieval time; changed same-key content aborts the entire batch. Semantic comparison excludes original identifier audit UUID and matched revision only when actual target and exact namespace/type/value remain identical. Original provenance is retained.
- Exact coherent catalog matching and native INSERT validation, entry SHARE→variant SHARE lock order, active identifier/variant and current revision requirement. Supported revision snapshots bind IDs and exact source identifiers; no title matching or entry-to-variant inference. Existing observations survive later retirement/rollback. Stale fetched results fail without partial inserts.
- Transaction-local UTC and canonical ISO `::timestamptz` bindings reuse Task1's finalized driver strategy. No global client or valuation-production refactor. The transaction-scoped ingestion method participates in the caller's transaction, enabling Task3 observation+receipt atomicity.
- **Empty batches still validate and lock the exact current target, verify fetchedAt, and only then return count zero.** A real test also verifies empty stale input fails. Task3 owns provider+poll/request consistency, committed skip receipts (including empty successes), scheduling/lifecycle and replay barriers.
- Native no-op and changing UPDATE protection; provider-indexed trusted DELETE remains possible for scoped fixture cleanup and later authorized license purge. No app delete method or live purge.
- Additive migration `20261018022132_market_observations` follows Task1's `20261018015303`; generated via Prisma schema diff, extended with explicit native guards before its first application, then applied successfully to owned local PostgreSQL17 `sammlerraum_test`. No reset or applied-history rewrite. Native pinned currency CHECK derives directly from Task1's sealed matching snapshot.
- Actual dedicated CI DB allowlist includes the market service suite. Domain export/workspace dependency and lockfile updated. No worker/queue/adapter/API/UI changes.

## Approved Task1 test-only carry

Strengthened the existing valuation UTC regression using a fresh test client with a deliberately non-UTC **session** baseline, verified outside-before/in-transaction/outside-after backend PIDs are all equal, observed UTC only inside and Berlin again after commit, checked year0001 roundtrip, and disconnected in finally. Task2 has the corresponding real proof. Using only an outside UTC baseline would not catch accidental session-global UTC; this test now would. No production valuation code changed.

## Verification evidence

All pnpm commands used the pinned launcher:

`npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm ...`

DB commands sourced `../sammlerraum-test-env.sh`; tests additionally verified `_test` database name and PostgreSQL17. DB suites ran serially with `--no-file-parallelism`. Logs are in this plan workspace's `logs/task-2-*`.

| Check | Result / evidence |
|---|---|
| Initial service/registry behavioral RED | `task-2-red-confirmed.log`: 3 failures from explicit unimplemented service/registry seams, after correcting fixture setup |
| Expanded behavioral RED | `task-2-behavior-red.log`: 9 failures against service scaffold |
| Pre-migration schema scaffold | `task-2-schema-scaffold-red.log`: 10 failures due absent observation relation; this is scaffold chronology, not evidence of a previously existing native guard bug |
| Additive migration + generate | `task-2-migrate.log`, `task-2-generate.log`: success, migration applied once to localhost5432/sammlerraum_test |
| First implemented behavior/native tests | `task-2-first-green-attempt.log`: 12/12 pass |
| Affected real DB seams | `task-2-affected-db.log`: 55/55 pass across market, valuation, catalog mutation and item-catalog linking; catalog/legacy suites run once, not repeatedly |
| Boundary regression RED→GREEN | `task-2-boundary-red-confirmed.log`: 3 failures (validation before DB acquisition, source object snapshot, exact JSONB metadata byte accounting); `task-2-boundary-green.log`: 19/19 pass after fixes |
| Task2 final focused suites | `task-2-focused-final.log`: 20/20 pass (13 real PG + 4 pure validation + 3 registry) |
| Final strengthened UTC test seams | `task-2-utc-final.log`: **37/37 pass**, comprising all Task2 tests plus all17 valuation tests |
| Normal workspace tests | `task-2-workspace-final.log`: **482 pass, 181 DB-gated skipped**, 55 pass/25 skip files; DB proof is separate above |
| Workspace lint | `task-2-lint.log`: pass. Subsequent touched test files formatted; `task-2-final-format-check.log` also pass |
| Workspace typecheck | `task-2-typecheck-final.log`: pass; after final test-only strengthening `task-2-final-tsc.log` also pass |
| Production workspace build | `task-2-build.log`: pass, including worker typecheck and production Next build; no production code changed after this check |
| Source whitespace | `git diff --check`: pass; staged check excludes raw command logs, whose original trailing/terminal blank lines are preserved |

The PG suite covers every kind, nonnegative/range/max-biginteger/ISO scale behavior, missing/zero, source precision and year0001, source qualifier/confidence preservation, exact retry/event/poll semantics, identifier retirement/re-add, stale/empty-stale behavior, atomic mixed-batch failure, invalid/private/oversized data, bounded keyset history, caller-owned transaction rollback, native insert/unique/update/delete guards and concurrent same-key equal/conflicting writes. Controlled transaction barriers plus `pg_stat_activity` verify actual catalog lock waiting in both orders; no elapsed sleep is used as lock evidence. Retiring catalog data after ingestion preserves historical provenance.

## Failed attempts and corrected findings

- Initial fixture incorrectly expected addCatalogVariant to return `.state`; its actual return is the variant plus revision. Initial cleanup also encountered the not-yet-created table. Both setup issues were corrected before the confirmed behavioral RED. Initial output remains `task-2-red.log`.
- Initial Prisma diff used a repository-relative schema path despite the filtered package working directory. Corrected to `prisma/schema.prisma`; `task-2-schema.log` preserves that failure. No migration was applied by the failed command.
- First typecheck found String.isWellFormed unavailable in this repository's ES2023 type library. Replaced with a Unicode-mode lone-surrogate check rather than changing global TS target. Later full typechecks passed. No runtime currency/timestamp fallback introduced.
- Additional registry-control tests already passed before explicit defensive control checks; misleadingly named `task-2-control-red.log` is **GREEN**, not claimed as a demonstrated defect.
- Author review found input qualifier/confidence references were not copied, owning-wrapper validation occurred after transaction acquisition, and compact JSON metadata bytes differed from native JSONB spacing. The dedicated three-test regression RED was corrected and passed. The first metadata fixture estimate was 11 bytes short; corrected to actual4097 bytes before the confirmed RED. Both preliminary and confirmed logs remain. Exact4096 acceptance/4097 rejection and qualifier1024/1025 boundaries are covered.
- The first unfiltered staged whitespace check flagged original test/build log whitespace and prevented that commit attempt. Source whitespace is clean; preserved raw logs and scoped the check to source/report files instead of altering evidence.
- Two narrow edit-script anchor assertions failed while inserting the empty-stale assertion; no partial test insertion was claimed. Corrected the anchor and the final suite verifies empty-stale rejection.

## Task boundaries, consequences and remaining gates

No new root design ruling was needed. Internal helper `validation.ts`, pure validation tests and package README are small support files for the approved contract. The native guard functions are market-specific and do not create a general ingestion framework.

Task3 must consume the finalized transaction seam and original persisted poll ID, insert an immutable successful receipt in the same transaction (including zero observations), recheck it before catalog/network work, and implement stronger request consistency, bounded default-off scheduling, real run.ts/main.ts composition, cancellation/draining and purge replay barriers. A queue singleton or this model alone does not guarantee exactly-once HTTP. Task6 supplies fake-HTTP-tested real adapters and distributed rate-limit/budget enforcement; no live provider readiness is claimed.

Task4/5 must enforce provider display entitlement, keep source/kind/currency/qualifier distinctions, preserve stored exponent and time precision, and use bigint decimal strings at JSON boundaries. No aggregate, FX, or invented sale timestamp is provided. License/retention operations require explicit later authorization/runbook verification and provider cache invalidation. Only fixture-scoped DELETE was exercised.

No source blocker found in author review. Independent review and exact-source CI remain root-owned. Root-owned preflight/context/progress/canonical-ledger files were preserved and excluded from staging. No children, reviewers, push, merge, deploy, provider API/account/credential operation, real role action, local Docker or production write was performed.
