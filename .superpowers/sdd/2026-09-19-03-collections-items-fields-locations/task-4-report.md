# Task 4 implementer report

## Scope

Implemented collection-scoped typed custom fields through:

- `createCustomFieldService(database, actorUserId).createFieldDefinition(input)`;
- `createCustomFieldService(database, actorUserId).setFieldValue(itemId, fieldDefinitionId, value)`;
- exported `validateFieldValue(type, value, allowedOptions)` and contract schemas/types;
- additive Prisma models and migration for definitions, options, typed values, and multi-select links;
- focused unit coverage and a gated real-PostgreSQL round-trip/authorization/constraint test;
- domain/contracts package exports and inclusion in the existing CI PostgreSQL integration gate.

No public projection or route was added. Values remain reachable only through the owner-scoped
domain service in this task.

## Canonical contracts for downstream tasks

All ten required types are represented by `CustomFieldTypeSchema`:

| Type | Accepted value | Canonical value / storage |
| --- | --- | --- |
| `SHORT_TEXT` | string | NFKC + outer trim, 1–255 chars; `shortTextValue` |
| `LONG_TEXT` | string | NFKC + outer trim, 1–10,000 chars; `longTextValue` |
| `INTEGER` | safe integer number | unchanged API number; `integerValue` bigint |
| `DECIMAL` | plain decimal string | no exponent; leading/trailing zero normalization; max 20 integer and 18 fractional digits; `decimalValue numeric(38,18)` |
| `DATE` | real `YYYY-MM-DD` string | unchanged date-only string; `dateValue date`; years start at 0001 |
| `BOOLEAN` | boolean | unchanged; `booleanValue` |
| `SINGLE_SELECT` | string matching an allowed option after canonical comparison | stored option display value in the API and `singleSelectOptionId` in the database |
| `MULTI_SELECT` | string array of allowed options | caller order retained, duplicates removed; relational option rows with positions |
| `URL` | absolute HTTP(S) string without embedded credentials | URL canonical form; `urlValue` |
| `MONEY` | `{ amountMinor, currency }` | nonnegative safe integer minor units plus supported uppercase ISO 4217 currency, matching item purchase money; dedicated amount/currency columns |

Passing `null` to `setFieldValue` explicitly clears the value row and returns `null`. Other nulls
are type mismatches. Wrong primitive/container types use the exact
`CUSTOM_FIELD_TYPE_MISMATCH` code; correctly shaped but invalid values use
`CUSTOM_FIELD_VALUE_INVALID`.

Definitions have per-collection normalized-name uniqueness. Select options are relational,
ordered, and unique by normalized value within a definition. The service obtains short
`ReadCommitted` row locks and checks the trusted actor against the owning collection. A missing,
foreign, or cross-collection item/definition pair receives the same safe
`CUSTOM_FIELD_NOT_FOUND` response.

## Database invariants

`CustomFieldValue` contains the type discriminator and dedicated nullable columns instead of a
free-form JSON value. Composite foreign keys require its item and definition to share the same
collection and require the stored discriminator to match the definition type. A typed-shape
check permits exactly the columns for that discriminator; integer/money ranges, money currency,
text lengths, URL scheme, and ordered-position bounds also have database checks. Single- and
multi-select option foreign keys require options from the same definition.

The migration is additive at
`packages/db/prisma/migrations/20260920223000_custom_fields/migration.sql`. Existing migrations
through `20260920213000_item_identifiers_tags` were not changed.

## TDD evidence

1. Initial RED: the exact focused command exited 1 because
   `custom-field-service.ts` did not exist. Narrow GREEN passed the required test that supplies
   `"twelve"` to an integer definition and receives `CUSTOM_FIELD_TYPE_MISMATCH`.
2. Validation RED: 26 intended failures showed the missing `validateFieldValue` export across all
   ten types and invalid primitives/date/decimal/select/URL/money cases. GREEN passed 27/27.
3. Service RED: six intended failures covered definition creation, canonical options, single- and
   multi-select persistence, explicit null clearing, and indistinguishable missing/foreign/
   cross-collection targets. GREEN passed 33/33.
4. Edge-case RED: year zero and a name expanding beyond 120 characters under NFKC were both
   accepted. GREEN rejects both before persistence; the current focused result is 35 passed with
   the gated PostgreSQL test skipped locally.

## Verification evidence

- Required `prisma migrate dev --name custom_fields`: attempted once against the documented local
  PostgreSQL URL; exited 1 at the unavailable local schema engine connection. No local PostgreSQL
  or Docker service was available.
- Prisma `format`, `validate`, and `generate`: exit 0 with the package config's schema path.
- Offline migration consistency: the base-schema-to-current-schema Prisma diff produced 25
  statements; all 25 occur in the migration, with zero missing. The migration adds four intended
  check-constraint statements. Existing published migrations have zero diff from the task base.
- Focused custom-field and item tests: 52 passed, 7 PostgreSQL-gated tests skipped.
- Full local unit suite: 189 passed, 16 gated integration tests skipped.
- Workspace lint: exit 0.
- Workspace typecheck: exit 0.

The new gated PostgreSQL test creates and reads all ten typed values, checks select ordering,
owner isolation, cross-collection service rejection, direct composite-FK rejection, explicit
clearing, and direct typed-shape constraint rejection. It is included in the existing CI
PostgreSQL command. Actual migration deployment and database execution remain the controller's
required CI gate.

### Actual PostgreSQL correction

GitHub Actions run 35534182170 applied the migration and passed all unit, lint, typecheck, build,
and other database checks. Its one failure was the typed-shape test's expected Prisma error code:
PostgreSQL correctly rejected the row with SQLSTATE `23514` and named
`CustomFieldValue_typedShape_check`, while Prisma surfaced `P2039` instead of the test's assumed
`P2004`.

Inspection of the installed Prisma 7.10 adapter and client engine established the mapping path:
`@prisma/adapter-pg` has no dedicated case for PostgreSQL `23514`, so it emits a generic
`kind: "postgres"` driver error; the client deliberately maps generic database errors to `P2039`.
The integration assertion now requires `P2039`, driver metadata with `kind: "postgres"` and
`originalCode: "23514"`, and the exact typed-shape constraint name in both the retained original
database message and the surfaced error message. This verifies the intended database invariant
without weakening the assertion to a generic rejection.

The fresh review also found that the PostgreSQL fixture created both owners before entering its
cleanup `try/finally`; failure while creating the second owner could therefore leak the first.
The fixture now opens the cleanup scope before setup and registers each owner immediately after
creation, matching the existing identifier integration pattern.

## Rulings and change controls

- Decimal API values are strings so callers cannot lose precision in JavaScript; values outside
  `numeric(38,18)` are rejected rather than rounded.
- Selection values expose stable option labels for this phase while database values reference
  option IDs; later routes can use the exported contracts without exposing storage details.
- A single `CUSTOM_FIELD_NOT_FOUND` result covers absent, foreign-owner, and cross-collection
  targets to avoid existence disclosure.
- `null` deletes the value row, making clearing explicit and leaving no ambiguous all-null scalar
  record. An empty multi-select array remains a present, valid typed value.
- No dependencies, commits, refs, plan checkboxes, or progress-ledger files were changed by the
  implementer.
