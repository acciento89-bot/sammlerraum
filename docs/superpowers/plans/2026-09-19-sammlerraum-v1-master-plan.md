# Sammlerraum V1 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Sammlerraum.de V1 defined by the approved design spec, while keeping each subsystem independently testable and reviewable.

**Architecture:** A pnpm workspace contains a Next.js web application, a separate Node worker, and focused shared packages for database, domain logic, contracts, queueing, storage, configuration, and testing. PostgreSQL is the system of record; long-running work goes through a PostgreSQL-backed queue. The plans below are executed in order so later subsystems consume stable interfaces from earlier ones.

**Tech Stack:** Node.js 24 LTS, pnpm 10, Next.js 16, React 19, TypeScript, PostgreSQL 17, Prisma 7, Better Auth, Zod, pg-boss, Sharp, next-intl, Vitest, Playwright, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Version 1 is the complete web V1 defined by the approved spec; do not reduce it to a public MVP.
- Native iOS and Android apps are not part of the first web release, but the API must remain client-independent.
- The first release does not include user-to-user checkout, escrow, payouts, shipping, or marketplace payments.
- German and English are supported from the start.
- Authorization, visibility, premium entitlements, and sensitive-document access are enforced server-side.
- PostgreSQL is the primary relational database and initial queue backend.
- V1 uses persistent self-hosted file storage behind a storage abstraction.
- GraphQL and microservices are not part of V1.
- User-entered private content is private by default unless the approved visibility/share model says otherwise.
- AI output is advisory; authenticity, market value, condition, grading, provenance, and ambiguous variants are never silently accepted as facts.
- Production containers are replaceable; database and file data must survive redeploys.
- Use TDD for domain behavior and critical integrations; each task ends in a green focused test run and a commit.

## Review Focus

1. **Private-descendant leakage:** a public child under a private ancestor must still be unreadable externally; pin this in the authorization plan.
2. **Duplicate retries:** retried imports, jobs, webhooks, and market syncs must not duplicate side effects; pin this in queue/import/billing plans.
3. **Stale cross-module references:** deleting or archiving catalog, media, location, or user objects must not leave unsafe dangling access paths; pin this in data/media/audit plans.
4. **Large user input:** large images, spreadsheets, filter trees, and exports must fail with controlled limits rather than exhausting web workers; pin this in media/import/search plans.
5. **Locale/currency ambiguity:** DE/EN numbers, dates, and money values must be parsed/stored canonically and rendered by locale; pin this in foundation/import/valuation plans.

---

## Plan Set and Execution Order

1. `2026-09-19-01-platform-foundation.md` — workspace, CI, Docker, PostgreSQL, queue base, i18n, request IDs, healthchecks.
2. `2026-09-19-02-identity-auth-policies.md` — accounts, Better Auth, passkeys, social login, sessions, policy engine, API error contracts.
3. `2026-09-19-03-collections-items-fields-locations.md` — collections, hierarchy, items, tags, custom fields, identifiers, storage locations, basic visibility.
4. `2026-09-19-04-media-documents.md` — storage provider, protected uploads/downloads, image variants, document safety.
5. `2026-09-19-05-catalog-condition-grading.md` — category templates, global catalog, revisions, proposals, condition schemas, grading.
6. `2026-09-19-06-valuations-market-data.md` — manual values, history, market adapters, source comparison, sync jobs.
7. `2026-09-19-07-search-smart-collections-dashboard.md` — typed filters, search, smart collections, analytics/dashboard.
8. `2026-09-19-08-import-export-insurance-reports.md` — CSV/XLSX import/export, mapping profiles, insurance, PDF reports.
9. `2026-09-19-09-collaboration-sharing-audit.md` — invitations, roles, share tokens, granular share scopes, audit and restoration.
10. `2026-09-19-10-community-moderation-notifications.md` — profiles, follow/favorite/comment, block/report, moderation, in-app/email notifications.
11. `2026-09-19-11-ai-assisted-capture.md` — provider abstraction, photo analysis, structured suggestions, human confirmation.
12. `2026-09-19-12-premium-billing.md` — entitlements, Stripe adapter, checkout/portal/webhooks, plan limits.
13. `2026-09-19-13-integration-hardening-release.md` — E2E, security, backup/restore, production compose, release gates.

## Cross-Plan Interfaces

- `@sammlerraum/db` owns Prisma client, migrations, and database test helpers.
- `@sammlerraum/contracts` owns Zod request/response schemas and OpenAPI registration.
- `@sammlerraum/domain` owns domain services and policy interfaces; web routes remain thin.
- `@sammlerraum/queue` exports `QueueClient.enqueue<T>()` and worker registration.
- `@sammlerraum/storage` exports `StorageProvider` and local persistent implementation.
- `@sammlerraum/config` exports validated server/client environment configuration.
- All public API routes live under `/api/v1/*`.
- Each plan adds only migrations it owns; later plans must not rewrite earlier migration history.

## Completion Rule

The master plan is complete only when every child plan is green, the final release plan passes all release criteria in the approved spec, and the production deployment can be restored from backups without losing database or media state.
