### Spec Compliance

- ✅ Spec compliant for Task5B1 at `c5fc3f2236c6ac4f93a09f982c8e5fe5a41bdadb`, against BASE `6d4fe74b3d0b1e15f5196aaf02edd81a58529e1c`. The actual route modules expose POST alongside GET (`apps/web/src/app/api/v1/search/items/route.ts:5`, `apps/web/src/app/api/v1/dashboard/route.ts:5`). The adapters enforce Origin → fresh session → body-only URL validation → body/wire parsing → existing service; actor comes from the session (`apps/web/src/lib/item-search-routes.ts:113`, `apps/web/src/lib/dashboard-routes.ts:43`).
- ✅ The browser-safe contract exports the 32768-byte cap and strict item/dashboard scalar shapes, rejects non-plain inputs, passes raw f directly to the existing filter parser, and delegates normalization to the actual item/dashboard parsers (`packages/contracts/src/private-search-query.ts:1`, `:6`, `:20`, `:26`, `:36`; package subpath in `packages/contracts/package.json:24`). No dashboard pagination fields, reference shapes, UI, producer, schema, index, runtime-budget or saved-mutation implementation was added.
- ✅ The reader implements exactly the two B1 shapes, streamed byte bounding, explicit leading BOM rejection, fatal UTF8, decoded duplicate/unknown root-key rejection, opaque quoted values, nested-container rejection, JSON.parse syntax validation and sanitized errors while retaining transport 413 (`apps/web/src/lib/api/read-search-body.ts:6`, `:12`, `:38`). Existing GET/service response code remains unchanged in the submitted diff.
- ✅ Native proofs cover real producer-backed owned/live selection, exact GET/POST results, method-crossing cursors, actor/query/lifecycle/limit/saved-context rejection, actual dashboard currency groups, and real service errors (`apps/web/src/lib/private-search-routes.integration.test.ts:65`, `:110`, `:140`, `:153`). Only this new native file enters the CI allowlist (`.github/workflows/ci.yml:161`).
- ⚠️ Cannot independently re-prove unchanged authorization/compiler/transaction/DTO foundations, every global Smart Collection invariant, or all dashboard source-separation behavior from this task diff. The new native proofs exercise the relevant boundaries; root retains responsibility for the previously reviewed foundations and remote CI. This approval does not complete B2, original Task5 or Phase07.

### Strengths

- The transport remains small and delegates domain semantics rather than introducing a parallel normalizer or aggregate implementation (`packages/contracts/src/private-search-query.ts:26`, `:36`; `apps/web/src/lib/dashboard-routes.ts:50`). The root-key precheck is limited to lexical responsibilities; the existing filter scanner receives f intact (`apps/web/src/lib/api/read-search-body.ts:12`; `packages/contracts/src/private-search-query.ts:33`, `:43`).
- Boundary tests exercise escaped-equivalent keys, quoted punctuation, invalid roots/syntax/UTF8/BOM, actual stream sizes independent of declared Content-Length, large legal raw filters and escaping-induced outer overflow (`apps/web/src/lib/api/read-search-body.test.ts:22`). Wire tests retain actual raw/canonical, text, depth, leaf, structural and version limits (`packages/contracts/src/private-search-query.test.ts:9`).
- Native response helpers validate the actual DTO schemas, and service spies observe the actual implementation rather than substituting a mock database (`apps/web/src/lib/private-search-routes.integration.test.ts:48`, `:65`). Search and dashboard registration use the configured APP_ORIGIN through their actual dependency factories (`apps/web/src/lib/item-search-route-dependencies.ts:15`; `apps/web/src/lib/dashboard-route-dependencies.ts:12`).
- Evidence explicitly preserves failures and distinguishes freezes. Behavioral RED records five HTTP405 expectation failures rather than only module startup (`logs/task-5b1-behavioral-red.log:4`). The initial freeze has 422 passes, comprising 186 database-enabled and 236 pure cases, zero skips; regular validation has 870 passes and 439 expected skips (`logs/task-5b1-frozen-native.log:4`, `:107`; `logs/task-5b1-frozen-regular.log:128`). The original type failure is retained (`logs/task-5b1-frozen-types.log:10`). Final affected validation has 58 passes (15 native, 43 reader), followed by successful types/lint/build (`logs/task-5b1-fix1-frozen-affected.log:4`, `:11`; `logs/task-5b1-fix1-frozen-gates.json:1`).

### Issues

#### Critical (Must Fix)

- None found within Task5B1.

#### Important (Should Fix)

- None found within Task5B1.

#### Minor (Nice to Have)

- None requiring a task change.

### Review Checks and Limits

- Read the brief first, then root context and required preparation sections. Initial combined output truncated preparation §§8–9; those sections were recovered in a bounded read. Reviewed the complete 1288-line package in four bounded passes without re-running git or separately reading changed source files. No required diff hunk remained cut off.
- One focused outside-diff check addressed the concrete risk of inventing dashboard normalization or leaking pagination: `packages/contracts/src/dashboard.ts:225` calls the actual `parseItemSearchQuery` and returns only text/filter/lifecycle; `packages/contracts/src/item-search.ts:61` retains actual filter normalization. No broader source crawl was performed.
- Inspected retained logs and gate metadata, compared initial/final manifests, and confirmed that only the two corrected test-file hashes differ (`logs/task-5b1-source-manifest-72b023c.sha256:4`, `:12`; `logs/task-5b1-source-manifest.sha256:4`, `:12`). No claim is made that the full 422/870 sets reran at c5fc3f2. No warnings/stderr matches were found in the inspected frozen native/regular or final gate logs. Runtime evidence records Node24.19.0/pnpm10.17.1 (`logs/task-5b1-runtime.log:1`).
- No tests, DB calls, builds, git commands, staging, commits or subagents were run. Only this review file was written. Evidence paths are repository-relative `logs/` as supplied; root owns their planned workspace relocation.

### Assessment

**Task quality:** Approved

**Reasoning:** The adapters implement the bounded private transport while preserving actual service, error and cursor contexts. Focused native and parser proofs plus the explicit two-freeze evidence chain support acceptance within B1; unchanged foundations and remote CI remain root-owned checks.

## Root evidence-location note

After the independent review completed, root moved the24 tracked `logs/task-5b1-*` artifacts from the repository root to this plan workspace `logs/` directory, byte-for-byte. All such evidence references above now resolve beneath `.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/`. Historical command output and authored review findings are preserved. Exact original/new paths and hashes are in `logs/task-5b1-root-relocation.json` within this workspace. No source/test/build rerun or behavior change accompanied this relocation.
