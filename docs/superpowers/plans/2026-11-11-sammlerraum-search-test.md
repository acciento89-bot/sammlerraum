# Sammlerraum Search Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a focused signup landing, verified conversion measurement and an at-most €30 Google Search test.
**Architecture:** Existing Next.js client consent boundary plus read-only authenticated eligibility route; database supplies truth and opaque server-derived transaction IDs supply deduplication. Existing visual assets and existing Google Ads account.
**Tech Stack:** Next.js16, React19, Prisma/Postgres, Google Ads basic consent mode.
**Spec:** docs/superpowers/specs/2026-11-11-sammlerraum-search-test-design.md

## Global Constraints
€30 total maximum from existing budget; old campaign paused. No Google traffic before opt-in. No PII/enhanced conversions. No schema migration. Exclude existing/admin/test accounts; eligibility only after verified registration. No Apple or other app changes.

## Review Focus
- OAuth/full page reload preserves consent and campaign without leaking auth query strings.
- Decline/withdrawal prevents network events and clears attribution; local storage failure fails closed.
- Multiple visits or accounts cannot duplicate conversions or report old test users.
- Item creation via modal/client fetch eventually reports once without navigation.
- Search budget is a total cap, not a daily average; no campaign activation with incomplete live verification.

### Task 1: Verified measurement
Files: lib/acquisition.ts + tests, api/v1/acquisition/status/route.ts, components/marketing/acquisition-measurement.tsx + pure browser helper/tests, locale layout, privacy copy.
- [ ] Write and run failing tests for verified eligibility, preexisting/test/admin exclusion, actual first item, opaque stable IDs; consent/decline/dedup behavior.
- [ ] Implement read-only eligibility and opt-in tag boundary; no credentials/PII exposed, private no-store route with existing session handling.
- [ ] Set up two specific Google Ads actions (registration primary, activation secondary), embed verified public IDs.
- [ ] Run unit and real database tests; commit only own files.

### Task 2: Conversion landing
Files: localized collection-management route, focused marketing component/style, browser journeys, privacy.
- [ ] Write missing-page/browser acceptance cases: mobile overflow, visible CTA/free limits, registration navigation and consent states.
- [ ] Implement page with existing category/product artwork, honest benefits and clear three-step start.
- [ ] Validate desktop/mobile visual and consent network boundary; build/typecheck/full test suite; commit.

### Task 3: Release and launch
- [ ] Fresh-context whole-branch review; resolve material findings with regression tests.
- [ ] Exact-source CI/release coordinator gates; immutable production image, only web image pin update, smoke and real live landing checks.
- [ ] Create Search campaign with registration goal, secondary activation, Germany presence, tightly matched intent, €30 total and explicit end date. Keep other campaigns paused.
- [ ] Verify launch configuration and evidence; report actual status, attribution limitations and budget.
