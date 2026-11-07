# Spec Compliance

- ❌ Issues found: the exported guarded Zod schemas do not preserve the required closed, input-free diagnostics under their supported `reportInput: true` parse option. This also permits rejected accessors to run while constructing the error. See Important I1 at `packages/contracts/src/search.ts:333`. A compiler-contract comment also needs the P7.4 custom-identity exception clarified (Minor M1).
- Reviewed scope: BASE `f4c7fe938f1001a057f281e947a5b74f2d06c617` to HEAD `c00467d8c42041435122a9f7de4a165aef18bd3c`, using the full source/test/export companion diff and the complete package's recorded evidence. Task brief, final task context, preparation as superseded, and binding L1.1–4/P7.1–4 were considered. All three planned files and the authorized helper/export-map changes are present.
- ⚠️ Compiler execution, actual reference/ownership resolution, SQL missing/NOT parity, mapping ambiguity/rights, and L1 complete coverage cannot be verified from this pure task. They are explicitly deferred obligations, not missing Task 1 implementations: `packages/contracts/src/search.ts:289`, `packages/domain/src/search/filter-ast.ts:12`. Exact CI and phase acceptance remain the controller's responsibility.

# Strengths

- `packages/contracts/src/search-parser.ts:39` snapshots own data iteratively before recursive validation/stringification, enforcing cumulative values, object/array width, raw-container depth, Unicode and byte budgets while rejecting repeated container identities, accessors, nonplain objects and non-JSON values. `packages/contracts/src/search-parser.ts:112` rejects decoded duplicate JSON keys before native parsing; `packages/contracts/src/search-parser.ts:154` separately bounds AST logical depth and leaf count.
- `packages/contracts/src/search.ts:162` correlates each of the ten actual custom/catalog value types with its valid operators. `packages/contracts/src/search.ts:250` includes collection/acquisition date and the required leaf families without invented manufacturer/year/wishlist branches. `packages/contracts/src/search.ts:94` compares bounded decimals exactly; monetary endpoints retain their string/int64 contract.
- `packages/contracts/src/search.ts:75` and `packages/domain/src/search/filter-ast.test.ts:308` implement P7.4's 200/400 canonical identity caps with genuine expanding-lowercase examples, stable reparsing, and over-cap failures. Canonical duplicate detection runs after scalar transforms. `packages/contracts/src/search.ts:319` checks the normalized output byte budget as well as the raw snapshot.
- `packages/contracts/src/search.ts:223` retains metric/full qualifiers/denomination in the inventory-relative market selector and couples interval operations to PRICE_RANGE. `packages/contracts/src/search.ts:294` correctly distinguishes retained retired catalog facts from market current-active eligibility.
- `packages/domain/src/search/filter-ast.ts:17` parses first, then visits every branch in deterministic preorder, rejecting duplicate, legacy amount comparisons and every market operation without Boolean shortcuts. The availability API explicitly grants no execution authority; `packages/domain/src/search/filter-ast.test.ts:410` checks deterministic ordering.
- `packages/contracts/package.json:20` and `packages/domain/package.json:36` expose the requested package entry points. The helper split keeps raw JSON/object guarding separate from the 370-line language declaration; no unnecessary framework, database work or currency authority was introduced.

# Issues

## Critical (Must Fix): 0

None.

## Important (Should Fix): 1

### I1 — Supported Zod input reporting bypasses the closed-error boundary

**Location:** `packages/contracts/src/search.ts:333` (issue construction at line 338; both public schemas exported at lines 347–348). Missing regression coverage: `packages/domain/src/search/filter-ast.test.ts:111` tests only default parse options.

**What fails:** The wrapper adds a constant custom issue but leaves its `input` unspecified. With the pinned `zod` **4.1.11** dependency declared in `packages/contracts/package.json`, Zod associates that issue with the original input to the `z.unknown().transform(...)`. Its supported `{ reportInput: true }` option retains that input in `error.issues` and the rendered error message. The raw guard itself rejects accessors correctly; error construction subsequently serializes the original rejected object and invokes those accessors.

**Confirmed reproduction:** One focused, in-memory browser bundle/VM probe, using `npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm exec node --input-type=module`, called:

```ts
ItemFilterSchema.safeParse(
  { version: 1, root: { kind: "secret-key", value: "secret-value" } },
  { reportInput: true },
);
```

The returned custom issue contained the entire submitted envelope in `input`, and `error.message` contained both `secret-key` and `secret-value`. A second case in that same probe passed an object with an enumerable getter to the same API; the getter invocation count was **1** during `safeParse`. Default options produced only `{ code: "custom", message: "FILTER_INVALID", path: [] }`.

**Why this blocks:** The final task context requires every exported schema/parse path to return bounded constant errors without raw submitted keys/values and to avoid invoking getters/toJSON. This option is part of the existing exported Zod API, not a caller-added refinement or custom error implementation. A logger or shared parsing adapter enabling standard Zod input reporting therefore breaks both required properties. Unbounded rejected input can also be attached to diagnostics despite successful early budget rejection. The current tests and report overstate the public schema guarantee.

**Required fix:** Ensure the issue reaches Zod finalization with an explicitly sanitized input, or otherwise enforce the closed boundary before Zod can retain/render the rejected object. Verify the precise behavior against pinned Zod 4.1.11 rather than assuming omission and explicit `undefined` are equivalent. Keep the correction narrow. Cover both `ItemFilterSchema` and `ItemFilterNodeSchema` with `reportInput: true` across `safeParse`/`parse` and their async equivalents; use secret key/value and accessor/toJSON fixtures and assert bounded issues/messages and zero invocation. The probe directly exercised synchronous `ItemFilterSchema.safeParse`; the other public methods share this wrapper and need regression coverage rather than an unsupported claim that each was separately executed here.

## Minor (Nice to Have): 1

### M1 — Clarify the custom-selection exception to reference errors

**Location:** `packages/contracts/src/search.ts:292` says “Reference/type/option failures are errors resolved by Task2, not missing.” Read without qualification, this includes nonexistent CUSTOM normalized selection identities. Binding P7.4 permits bounded nonexistent custom identities, which must simply match nothing; invalid/deleted definition identities, resolved type mismatches and invalid catalog option-key references retain their error semantics. Clarify this comment so Task 2 does not implement the opposite behavior. This is a documentation contract inconsistency, not an existing runtime resolver bug: Task 1 deliberately has no resolver. The controller confirmed this distinction during review after the Task 2 preparer identified the ambiguity.

The final build evidence still shows the already recorded worker bundle-size indicators at `logs/task-1-verified-build.log:40` and `logs/task-1-verified-build.log:44`; those existing Phase 6 concerns are not counted again as new Task 1 defects.

# Evidence and Limits

- Read final recorded test, typecheck, lint, build and browser-import outputs. `logs/task-1-verified-tests.log:9` records 85 AST tests; its final totals are 708 passed / 253 skipped, with 68 passed files / 30 skipped files. Types/lint completed for all ten workspace projects; production build and isolated browser import completed. These are inspected implementer results, not a reviewer rerun or a claim of database authorization coverage.
- Checked retained chronology in the complete review package: initial missing-export RED; 48 failed / 33 passed scaffolding RED; 79/81 first implementation with the DAG and native-Zod expectation fixes; explicit nesting/output-expansion RED; decimal compatibility and identity-expansion RED; initial typecheck/build/browser-command failures and later recovery. Earlier 707-test runs remain distinguishable from final 708-test evidence. Raw-log whitespace failures remain preserved and distinct from the passing source/report check.
- Named unchanged seam check: inspected `packages/contracts/src/valuations.ts:18` and `packages/contracts/src/grading.ts:23` for monetary endpoint/source scalar and grading comparable compatibility. The valuation wire contract already uses structural three-letter currency and separate stored exponent; no new currency-policy enforcement was demanded of this pure parser. No broader platform audit was performed.
- One in-memory focused probe was run solely for I1. No suite, browser server, database, source/index/HEAD mutation, child agent, push or live action was performed. Only this review report was written.

# Assessment

**Task quality:** Needs fixes.

**Counts:** 0 Critical / 1 Important / 1 Minor.

**Reasoning:** The bounded language, normalization and deterministic availability foundation otherwise match the final Task 1 scope. The supported public Zod diagnostic option defeats an explicit security and robustness contract, so the task cannot be approved until I1 is corrected and covered.
