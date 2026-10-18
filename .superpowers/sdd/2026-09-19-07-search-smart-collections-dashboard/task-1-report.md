# Phase07 Task1 implementation report

BASE: `f4c7fe938f1001a057f281e947a5b74f2d06c617`, verified locally before commit. Source GO and final scope came from root's updated task-1-context.md after Phase06 completion. Root owns independent review, exact CI, persistence and task/phase checkoff. This report does not claim Phase07 or its runtime query producers complete.

## Delivered scope

- Browser-safe `@sammlerraum/contracts/search`: typed strict `{version:1,root}` AST, guarded public envelope/node Zod schemas, closed parser/error types, object and raw-JSON parse functions.
- Logical AND/OR/NOT, collection/category/condition/grading, purchase/manual/source-specific market money, tags/duplicate/trade/visibility, READY image/document presence declarations, created/updated/acquisition dates and every actual custom/catalog field type. Manufacturer/year are explicit real typed field selectors; INTEGER permits authored negatives. No aliases, conditionBand or invented wishlist-to-item predicate.
- Iterative own-data snapshot before recursive schema/stringification:512 JSON values,32 object properties,50 array elements,32 raw containers, max5 logical ancestors and50 leaves. UTF8 input and normalized output each fit16KiB. Reject cycles/DAG/accessors/sparse arrays/non-JSON/unpaired Unicode; never invoke getters/toJSON. Raw bounded lexical scanner detects duplicate/escaped duplicate keys before JSON.parse, which retains JSON grammar authority.
- Exact scalar validation/canonical duplicates and decimal comparisons without Number conversion; int64 nonnegative string money endpoints, stored exponent0..4 for canonical manual/market and separately declared legacy exponent0..9/opaque unitKey. No currency table clone, ICU interpretation, DB/schema/migration, or provider authority added.
- `@sammlerraum/domain/search/filter-ast`: bounded language/complexity validation and narrow whole-tree current availability rejection, including under NOT/OR/AND, for duplicate, legacy canonical range and all market operations. Stable preorder errors. No evaluator, synthetic definition/mapping registry, permission resolver or execution permit.

Public Zod parse/safeParse errors contain one constant custom issue at safe empty path; parseItemFilter/parseItemFilterJson map invalid/complex/unsupported-version to closed FilterValidationError. Neither path serializes underlying Zod input/keys/cause. Real definition resolution/authorization is Task2 work, with closed reference/error types available now.

## Contract decisions carried forward

The final context supersedes preparatory aliases/conditionBand/wishlist proposals. Source comments also record root's later generic catalog-retirement clarification: an owned exact linked ENTRY/SELECTED_VARIANT fact remains searchable when its target is retained but retired. Current-active requirements belong to market eligibility, not generic catalog attributes. Actual removed targets follow missing; invalid/deleted definition references must fail.

Root P7.4 supersedes preparation's post-fold tag100/custom option200 caps: actual producers bound authored display text before expanding lowercase. Canonical tag identity therefore permits200 UTF16 units, custom selection identity400, preserving exact producer folding and repeated-parse stability. Catalog option keys remain64 with their actual grammar. Producers/storage were not changed; bounded nonexistent identities simply match nothing when compiled later.

Positive tests on missing facts are false; NOT complements only after whole-query availability succeeds. Scoped missing/present applies to the selected collection/category. Zero/false/authored empty multi-select is present. Grading facts must match one record, comparable values within exact provider+authored scale. Latest manual is selected before denomination/range filtering, per-unit. These are compiler obligations, not a mocked runtime implementation.

Market CURRENT_ITEM_MAPPING fixes provider/namespace/type/kind/sourceMetric/full qualifiers/currency/exponent while resolving each item's exact current target/external mapping. More than one eligible mapping for any relevant item must reject the whole query; no first/highest/latest across product IDs. Phase06 browsing SourceKey is deliberately coarser and remains unchanged. Closed intervals overlap iff observation.low<=query.max AND observation.high>=query.min; containedBy iff query.min<=observation.low AND observation.high<=query.max. All market operations remain unavailable until a real bounded batch eligibility/rights parity seam exists.

Legacy unitKey and exponent declarations never classify facts. L1 complete relevant-present-fact coverage over the independently authorized outer scope, including under NOT/OR, remains a genuine prerequisite. Shared scope stays Phase09; duplicate runtime relation and wishlist search/UI stay Phase10. Wishlist is an unknown/invalid v1 leaf. Static availability passing is not DB compiler/permission/producer proof.

## Evidence and chronology

All commands use `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm ...`. Exact command forms below are relative to the repository. Full output, including failures, is preserved in `logs/task-1-*` beside this report.

1. Initial focused RED could not resolve the new package export. After inert API scaffolding,81 cases ran:48 failed/33 passed. This is honest scaffolding RED; the33 initially passing checks were not represented as implemented features.
2. First implementation:79/81 passed. Two fixture expectations were corrected without weakening guards: shared object reuse was correctly a forbidden DAG; public Zod schema errors naturally use safe constant native issues while parser helpers use closed domain errors.
3. Additional genuine boundary RED: direct object raw nesting33 and NFKC expansion beyond normalized16KiB (2 failed/81 passed). Both guards were added; focused83/83 passed.
4. Initial typecheck caught one generic Zod object-property typing issue, fixed using the exact typed range shape.
5. Decimal compatibility RED caught an unnecessary64-character raw decimal cap; removed to preserve existing canonicalDecimal leading-zero behavior within global bounds. No numerical precision change.
6. Root-adjudicated identity-expansion RED uses real `İ` producer behavior, stable repeated parse and overcap regressions; tag/custom selection identity caps were corrected without producer changes.

Verification outcomes are recorded below after the final covering runs; any earlier attempt remains retained rather than overwritten.

## Verification record

Source was frozen after the identity-cap correction. All covering commands below ran after that final source write, with exit0. The earlier707-test runs, earlier build and earlier lint/type checks are retained as historical attempts, never relabelled as final-source checks.

| Covering command (after pinned prefix above) | Outcome | Evidence |
| --- | --- | --- |
| `test` | 68 files passed/30 DB-gated files skipped;708 tests passed/253 skipped; AST file85/85 | `logs/task-1-verified-tests.log` |
| `typecheck` | All10 workspace projects passed | `logs/task-1-verified-typecheck.log` |
| `lint` | All10 workspace projects passed | `logs/task-1-verified-lint.log` |
| `build` with explicit non-live CI environment placeholders | All workspace builds including production Next build passed | `logs/task-1-verified-build.log` |
| Browser-platform esbuild bundle and isolated VM import/parse | Passed without process/Buffer/require in target runtime | `logs/task-1-verified-browser-import.log` |
| Staged source/report `git diff --cached --check -- <owned source/report paths>` | Passed | `logs/task-1-source-diff-check.log` |

Initial build without required environment failed with missing DATABASE_URL/APP_ORIGIN/UPLOADS_DIR; no source workaround was added. Both later builds used dummy CI-style environment values, no running database or provider permission. Initial browser-bundle command could not find a standalone esbuild binary; using the existing Vite dependency's esbuild API succeeded, without installing dependencies. Runtime proof is `v24.19.0` in `logs/task-1-runtime.log`. Exact final command forms are in `logs/task-1-commands.txt`.

The initial unstaged whitespace check passed, but a later whole-staged `git diff --cached --check` reported trailing spaces/blank EOF lines in raw captured test/build output only (`logs/task-1-staged-diff-check.log`). Those evidence logs are preserved verbatim. The scoped staged source/report whitespace check passed; no source/report whitespace issue was hidden or reformatted out of a test failure.

No DB/native integration/browser server, live provider, real data/classification/role operation, subagent, push, merge or deployment was performed. Existing DB-gated tests remain visibly skipped in the regular suite; their absence is not query/authorization evidence.
