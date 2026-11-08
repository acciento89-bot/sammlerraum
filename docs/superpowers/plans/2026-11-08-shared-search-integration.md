# Shared search integration implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Root is the only implementer/runtime owner. One fresh whole-plan reviewer after all tasks, then one consolidated root correction; no implementation agents.

**Goal:** Close Phase07's actual bulk shared authorization/field-inference integration for search rows/counts, saved definitions and dashboard views.

**Architecture:** Canonical callback-scoped membership/share read ports feed one explicit target into the bounded query compiler. Strict per-scope inference checks precede evaluation. Original OWNED transport stays unchanged; scoped definitions and projections are explicit.

**Tech Stack:** Existing TypeScript/Zod, Prisma.sql/PostgreSQL17.11, Next/next-intl, Vitest and compiled Playwright; Node24.19.0/pnpm10.17.1.

**Spec:** docs/superpowers/specs/2026-11-08-shared-search-design.md and its binding original V1/Phase07/Phase09 references. User opted out of routine questions and authorized full implementation; native execution preserved. Root's selected explicit-target design does not claim a new human approval.

## Global constraints

- BASEd331efbdd523225a3206c49fa93f81bd4821def2. Duplicate prerequisite locally reviewed/corrected/verified, pushed/read back; exact CI42423667733 still pending. Shared work may proceed locally; dependent push/acceptance waits for actual prior success.
- Existing source-recovery checkout and DraftPR1 only. No main/merge/deploy, providers/licensing activation, real email/payments/customer data, stores/devices or automations.
- Reuse canonical PIN budgets, recipient/token/creator/revocation/expiry validation and source lock order. No alternate authorization implementation or per-item read loop; no identity impersonation for mutations.
- Existing12s total/three full serialization attempts/5s transaction/2s statement/500ms lock budgets. Existing16KiB filter/32KiB query, text200codepoints/800UTF8 bytes, page20/max50, cursor2048base64url and1MiB response limits remain.
- Preserve all18frozen migrations. Task3 native RED proved the original definition constraint only permits version1. Add a new scoped-definition migration preserving the v1 branch and exact credential-free v2 shape; never edit applied migration bytes or weaken native grant guards. Retain proof workspaces and restore exact historical PDF/PNG variants after copying fresh evidence.

## Review focus

1. Basic read access must not permit price/document/private-pair inference under NOT/OR or on empty targets.
2. Node/item shares, hidden references and hidden timestamp cursors must not widen or disclose owner/parent/other-item data.
3. PIN/session/expiry/revocation/ownership changes across awaits must abort consistently without cached permissions.
4. Saved definitions retain only target references, never tokens/PINs, and never fall back to OWNED on failure.
5. Actual allowed scope operations and summaries must execute; default denial alone is insufficient. UI repair and source labels must remain meaningful in DE/EN/mobile.

### Task 1: Reusable canonical bulk read authorization ports

**Files:** Create domain/sharing/share-read-access.ts and search/scoped-read-context.ts with focused native tests; adapt sharing/share-service.ts mechanically to the same canonical helpers. Keep existing grant/PIN behavior intact.

- [x] TDD allowed member, verified recipient and token grants, wrong target/actor, deleted parents, current creator, durable revocation and PIN/session/expiry over actual source producers.
- [x] Extract/reuse canonical authorized/unlock/checkPinAccess helpers; provide a callback-scoped trusted context in the caller's bounded transaction with fixed candidate scope, field capabilities and post-consume revalidation. No client-created capabilities.
- [x] Run original share/membership/authorization regressions and new native cases, types; retain RED/GREEN and commit.

### Task 2: Strict scoped query contracts and field-aware compiler

**Files:** Create contracts/scoped-search.ts, domain/search/scoped-search-service.ts and scoped compiler/transport tests; reuse original AST/typed money/cursor utilities with explicit scoped adapters.

- [x] TDD common text/basic predicates and permitted price/media fields; whole-tree denied fields, empty targets, exact subtree/item boundaries, hidden reference probes and missing/zero/NOT/OR parity.
- [x] Implement strict scope target/query parsing, ID-based bound cursor, allowed row projection and same-snapshot rows/counts. Resolve money only in the exact current authorized target and actual field grants. No N+1 or fallback.
- [x] Run real native queries and original owned/money/duplicate regression; record bounded query calls and commit.

### Task 3: Scoped saved definitions and dashboard consumers

**Files:** Extend contracts/smart-collections.ts compatibly with explicit v2 target definitions; adapt domain saved service through a trusted scoped resolver. Add strict scoped dashboard contract/service.

- [x] TDD v1 unchanged, v2 current access/resolution, no persisted credentials, wrong/revoked grant and actual live changes. Test dashboard counts and permitted sums against the same selected relation; ungranted data remains unavailable/null.
- [x] Implement symbolic target persistence and live resolution plus scoped summary projection; never redirect failed scoped queries to OWNED or serialize ungranted facts.
- [x] Run native saved/dashboard/privacy regression, types and commit.

### Task 4: Actual API, discovery and ephemeral access transport

**Files:** Add scoped search/dashboard API routes and dependencies with actual native route tests; integrate existing share unlock/session helpers and saved adapters.

- [x] TDD fresh authentication for membership/own saved data, exact token capability for token reads, raw body/AST limits, no-store/noindex, closed errors and no credential serialization/logging. Test wrong supplied token versus stored target reference.
- [x] Wire canonical context and consumers with ephemeral PIN/session/token access outside query history/persistence. Bounded current grant discovery reveals only authorized labels and generic protected-share metadata.
- [x] Run actual cookie/capability/native HTTP journeys and default owned-route regressions, commit.

### Task 5: Responsive localized scoped search, saved and dashboard UI

**Files:** Reuse current workspace/share views and search draft controls; add explicit scoped components/state and DE/EN messages plus compiled Playwright cases.

- [x] TDD scope capability/repair behavior, scoped saved links and ephemeral access prompts without credentials in QueryStore/history. Preserve original OWNED UI behavior.
- [x] Implement explicit target context, permitted filters and safe shared summaries in current workspace/share navigation. Preserve unsupported saved operands for editing/removal.
- [x] Run actual DE/EN desktop/mobile allowed/denied/current-access journeys, screenshot current UI, types/lint/build and commit.

### Task 6: Whole-prerequisite proof, one review and draft integration

- [ ] Retain actual1/50/500-item scope query plans/counts, snapshot/concurrency/expiry/field-inference evidence and relevant original regressions. No speculative index/schema/timeout expansion.
- [ ] Freeze source, run appropriate complete local regular/native/types/lint/build/browser gates, one fresh whole-plan review and one consolidated root correction.
- [ ] Confirm exact prior duplicate CI success, push normal fast-forward/readback to existing draft and observe actual exact candidate CI. Only then assess original fullPhase07 Tasks2–5 for their separate final acceptance; canonical task count does not change from preparation.
