# Sammlerraum administration implementation plan

> For agentic workers: use superpowers:executing-plans; implement in this worktree and obtain one independent final review.

**Goal:** Give the verified owner a private view of real accounts and registrations.
**Architecture:** Existing session authentication plus authoritative ApplicationRoleGrant ADMIN. Bounded read-only user directory and summary, server-rendered localized page, private JSON endpoint, operator-only verified grant.
**Tech stack:** Next.js 16, React, Prisma/PostgreSQL, better-auth, Vitest.
**Spec:** docs/superpowers/specs/2026-11-11-sammlerraum-admin-design.md

## Global constraints
No ad restart. No schema migration. No credentials or hidden tokens in responses. No public role-grant route. No customer account modification except specifically authorized owner's ADMIN grant. Preserve unrelated work.

## Review focus
Anonymous, unverified and moderator-only requests must expose no user data. Revoke grants between requests. Bound searches/pagination and reject duplicate query parameters. Calendar counts must respect Berlin/DST. Lists need clear empty/error states and usable narrow-screen layout.

### Task 1: Server authorization and directory
- [ ] Write failing tests for denied access, revoked grants, projections, pagination and Berlin date boundaries.
- [ ] Implement admin-user routes/service with fresh database verification, no-store responses and repeatable-read queries.
- [ ] Run focused tests and typecheck.

### Task 2: Owner interface and provisioning
- [ ] Add localized server-rendered admin page and link visible only to ADMIN users.
- [ ] Add operator-only grant command that refuses missing/ambiguous/unverified accounts.
- [ ] Check narrow/desktop UI and authorization against local database.

### Task 3: Release
- [ ] Independent review; fix findings. Build and mandatory full CI on exact committed source.
- [ ] Deploy reviewed web image, provision the verified owner's existing account and verify private/public boundaries on production.
- [ ] Report actual status and access instructions; never claim provisioned/live before verification.
