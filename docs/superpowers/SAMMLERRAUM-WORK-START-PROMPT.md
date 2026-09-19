# Sammlerraum Work Start Prompt

Use the following prompt when starting a fresh ChatGPT Work run for the Sammlerraum implementation.

---

## Prompt

Repository: `acciento89-bot/sammlerraum`

The complete approved product/system design, SEO extension, implementation plans, and progress ledger are already in the repository. Do not redesign the product from scratch and do not reduce the approved V1 scope.

### Read these files first, in this order

1. `README.md`
2. `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`
3. `docs/superpowers/specs/2026-09-19-seo-search-console-design.md`
4. `docs/superpowers/plans/2026-09-19-sammlerraum-v1-master-plan.md`
5. `docs/superpowers/SAMMLERRAUM-V1-LEDGER.md`
6. the detailed phase plan for the next open task shown in the ledger.

### Execution method

Use `superpowers:subagent-driven-development` if this Work runtime supports real subagent dispatch.

For **every task**:

1. use a fresh implementer subagent;
2. implement strictly from the corresponding detailed task plan;
3. use TDD: failing test first, verify RED, minimal implementation, verify GREEN;
4. run the exact focused tests/build checks listed in the task;
5. use a fresh reviewer subagent to review the task against the spec and task plan;
6. fix all concrete review findings;
7. re-run the relevant tests;
8. commit the completed task;
9. update `docs/superpowers/SAMMLERRAUM-V1-LEDGER.md`;
10. continue immediately to the next task.

After each completed phase, run that phase's broader regression checks before starting the next phase.

After all phases, run a fresh whole-branch review before final release work.

If real subagent dispatch is unavailable, use `superpowers:executing-plans` and follow the same task order/TDD/ledger discipline.

### Branch / worktree rules

- Do **not** develop directly on `main`.
- Create an isolated feature branch/worktree for the implementation.
- Use a clear branch name such as `work/sammlerraum-v1`.
- Keep commits small and aligned to the individual tasks.
- Do not rewrite published migration history.
- Do not force-push `main`.

### Required phase order

```text
01 Platform Foundation
02 Identity, Auth & Policies
03 Collections, Items, Fields & Locations
04 Media & Documents
05 Catalog, Condition & Grading
06 Valuations & Market Data
07 Search, Smart Collections & Dashboard
08 Import, Export, Insurance & Reports
09 Collaboration, Sharing & Audit
10 Community, Moderation & Notifications
11 AI-Assisted Capture
12 Premium & Billing
13 Integration, Hardening & Release
14 SEO & Google Search Console
```

Start at the **first incomplete task in the ledger**. On the initial run this is **Phase 01 / Task 1**.

### Do not reduce scope

The approved Sammlerraum V1 intentionally includes the complete scope from the specs, including:

- DE/EN;
- email/password, Google, Apple and Passkeys;
- private/public/unlisted collections and items;
- nested collections;
- collaboration/roles;
- media/private documents;
- category templates/custom fields/tags;
- global catalog;
- condition/grading;
- manual values and external market data;
- AI-assisted capture as suggestions only;
- search/filter/Smart Collections;
- dashboard/statistics;
- CSV/XLSX import/export;
- insurance/reports;
- wishlist/duplicates/trade/sale status;
- community/follows/favorites/comments/moderation;
- notifications/email;
- Premium/Billing;
- audit/restore;
- storage locations and QR labels;
- Docker/PostgreSQL/worker/backups/restore;
- privacy-safe public sharing;
- SEO, category landing pages and Search Console.

Do not convert this into a small MVP.

### Hard product boundaries

Do **not** add a full user-to-user marketplace checkout to V1.

Specifically do not add:

- escrow;
- seller payouts;
- user-to-user payment checkout;
- shipping workflow;
- buyer protection/dispute system.

The data architecture may remain prepared for the later marketplace phase exactly as documented.

### Privacy/security rules that must never be weakened

- PRIVATE and UNLISTED content must never leak through direct IDs, public routes, sitemaps, feeds, notifications, exports, media URLs or social previews.
- A public child below a private ancestor is not externally visible.
- Private notes, storage locations, insurance data, purchase receipts and protected documents are not made public by item visibility.
- Public search-engine indexing of user-generated content defaults **off** and requires explicit profile opt-in.
- Search-engine opt-in never overrides PRIVATE/UNLISTED/ancestor/moderation rules.
- Social/provider accounts are not blindly merged only because email strings match.
- AI output remains advisory and cannot silently establish authenticity, value, grading, condition, provenance or ambiguous variants.
- Billing/entitlement checks are server-side.
- Uploaded files remain behind authorization.
- Logs/audit events must not contain secrets or private document bytes.

### External credentials/providers

Some tasks will eventually require real external configuration, for example:

- Google OAuth;
- Apple Sign in;
- SMTP;
- Stripe;
- OpenAI;
- market-data providers;
- DNS/Search Console.

Do not fabricate credentials.

If credentials are unavailable:

1. implement the provider adapter/configuration/tests with mocks/fakes;
2. document the exact required environment variables/callbacks;
3. record the missing live verification in the ledger under **External blocker log**;
4. continue with other independent tasks.

Do not stop the whole project merely because one external credential is missing.

### Stop conditions

Do not stop to ask about minor implementation choices already constrained by the specs/plans.

Stop only when one of these is true:

- an irreversible production action is required;
- a production deployment is about to be performed;
- an external account/DNS/provider action requires the user's credentials or confirmation;
- requirements conflict materially and the specs do not resolve the conflict;
- continuing would risk destructive data loss.

### Production restriction

Do **not** deploy to production, change production DNS, submit Search Console verification, create live Stripe products/prices, or perform other irreversible live-provider actions without explicit user approval.

You may prepare all code, migrations, deployment files, documentation, smoke scripts and exact manual steps beforehand.

### Completion standard

A task is complete only when:

- implementation matches the relevant spec;
- required tests pass;
- reviewer findings are resolved;
- the task has its own commit;
- the ledger is updated.

A phase is complete only when every task in it is green.

Sammlerraum V1 is complete only when all 14 phases are complete and the final release gates, backup/restore verification, production smoke preparation and SEO/Search Console preparation are green.

Begin now with the first incomplete ledger task. Do not re-plan the project.

---

## First-run expected starting point

```text
Phase 01 — Platform Foundation
Task 1 — Scaffold the workspace and test harness
```
