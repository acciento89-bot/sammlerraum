# Integration, Hardening, Backup, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate every V1 subsystem, close security/UX gaps, verify DE/EN and responsive flows, prove backup/restore, produce production Docker/Portainer artifacts, and enforce the approved release gates.

**Architecture:** This plan changes no product scope. It validates cross-module behavior through E2E/security tests, production-like Docker environments, backup/restore drills, and explicit release verification scripts.

**Tech Stack:** Playwright, Vitest, Docker Compose, PostgreSQL 17, pg_dump/pg_restore, shell scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Every approved V1 function must be reachable through the web UI.
- DE and EN must be complete.
- User-to-user checkout/escrow/payout remains disabled.
- Backups are not considered complete until restore is tested.
- Production verification must not delete persistent volumes.

## Review Focus

1. Cross-module privacy: share/community/search/export/media paths must all agree on visibility.
2. Recovery after failure: worker crash/retry must not corrupt import, media, AI, billing, or market jobs.
3. Backup consistency: restored database references must resolve to restored media bytes.
4. Responsive accessibility: core flows must work on mobile viewport and keyboard navigation.
5. Marketplace boundary: no hidden route/API can create a paid user-to-user transaction.

---

### Task 1: Add full permission-matrix security tests

**Files:**
- Create: `apps/web/e2e/security-permissions.spec.ts`
- Create: `packages/testing/src/permission-fixtures.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all V1 policy-protected endpoints.
- Produces: CI permission matrix for anonymous, owner, admin, editor, viewer, shared viewer, blocked user, moderator.

- [ ] **Step 1: Write the matrix test**

```ts
for (const scenario of permissionMatrix) {
  test(`${scenario.actor} ${scenario.action} ${scenario.resource}`, async ({ request }) => {
    const response = await scenario.execute(request);
    expect(response.status()).toBe(scenario.expectedStatus);
  });
}
```

Include explicit rows for private ancestor/public child, private documents, storage locations, audit, insurance, revoked share, expired share, block interactions, and premium gates.

- [ ] **Step 2: Run and observe failures**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/security-permissions.spec.ts`  
Expected: FAIL for any remaining policy inconsistencies.

- [ ] **Step 3: Fix only the failing policy/service boundaries**

Do not add UI-only workarounds. Every correction belongs in policy/domain service/route facts.

- [ ] **Step 4: Re-run matrix**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/security-permissions.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e packages/testing .github/workflows/ci.yml packages/domain
git commit -m "test: enforce V1 permission matrix"
```

---

### Task 2: Add complete critical-path E2E suite in DE and EN

**Files:**
- Create: `apps/web/e2e/v1-critical-paths.spec.ts`
- Create: `packages/testing/src/v1-seed.ts`

**Interfaces:**
- Consumes: full V1 UI.
- Produces: critical-path browser verification.

- [ ] **Step 1: Write parameterized locale flows**

```ts
for (const locale of ["de", "en"] as const) {
  test(`complete collector flow in ${locale}`, async ({ page }) => {
    await registerAndLogin(page, locale);
    await createCollection(page, locale);
    await createItemWithImage(page, locale);
    await setConditionAndLocation(page, locale);
    await createSmartCollection(page, locale);
    await createShare(page, locale);
    await expectCoreDashboard(page, locale);
  });
}
```

Extend the suite with import preview/commit, wishlist, comments, invitation, AI mocked analysis, insurance report, billing mocked webhook, and notification read flow.

- [ ] **Step 2: Run and record failures**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/v1-critical-paths.spec.ts`  
Expected: failures identify integration/UI gaps.

- [ ] **Step 3: Fix integration gaps without changing approved scope**

All visible copy uses translation keys. Ensure mobile viewport tests at 390x844 and desktop at 1440x900.

- [ ] **Step 4: Re-run**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/v1-critical-paths.spec.ts`  
Expected: PASS for both locales/viewports.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/testing
git commit -m "test: cover complete Sammlerraum V1 flows"
```

---

### Task 3: Add backup and restore scripts with integrity manifest

**Files:**
- Create: `scripts/backup.sh`
- Create: `scripts/restore.sh`
- Create: `scripts/verify-restore.sh`
- Create: `docs/operations/backup-restore.md`
- Create: `docker-compose.restore-test.yml`

**Interfaces:**
- Produces: timestamped DB dump, media archive, SHA-256 manifest, scratch restore verification.

- [ ] **Step 1: Write failing restore verification**

`verify-restore.sh` must fail if:
- DB row count sanity query fails;
- a referenced media `storageKey` is absent;
- checksum differs;
- healthcheck fails.

Run before scripts exist.  
Expected: FAIL.

- [ ] **Step 2: Implement backup**

`backup.sh` uses `pg_dump --format=custom`, creates a tar archive of the persistent uploads root, writes SHA-256 checksums and UTC timestamp into a manifest, and never includes runtime secrets.

- [ ] **Step 3: Implement isolated restore test**

`restore.sh` restores into scratch PostgreSQL/storage paths. `verify-restore.sh` checks DB/media referential integrity by comparing every live media row expected to have bytes with restored storage.

- [ ] **Step 4: Execute a real local restore drill**

Run:
```bash
docker compose -f docker-compose.yml up -d db
bash scripts/backup.sh ./tmp/backup-test
docker compose -f docker-compose.restore-test.yml up -d
bash scripts/restore.sh ./tmp/backup-test
bash scripts/verify-restore.sh
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts docs/operations/backup-restore.md docker-compose.restore-test.yml
git commit -m "ops: prove database and media restore"
```

---

### Task 4: Harden worker/jobs and resource limits

**Files:**
- Create: `packages/testing/src/job-chaos.test.ts`
- Modify: `packages/queue/src/pg-boss-queue.ts`
- Modify: job handlers under `apps/worker/src/jobs/`
- Modify: `packages/config/src/server.ts`

**Interfaces:**
- Produces: bounded concurrency/timeouts and retry-safe behavior.

- [ ] **Step 1: Write crash/retry tests**

```ts
it.each(["import.commit", "media.process-image", "ai.analyze-item", "market.sync", "notification.send-email"])(
  "%s survives a crash after durable side effect without duplicating it",
  async (jobName) => {
    const result = await runCrashThenRetryScenario(jobName);
    expect(result.duplicateSideEffects).toBe(0);
  }
);
```

- [ ] **Step 2: Run and confirm any failures**

Run: `pnpm vitest run packages/testing/src/job-chaos.test.ts`  
Expected: FAIL until all handlers respect idempotency checkpoints.

- [ ] **Step 3: Add limits**

Configure per-job concurrency, timeout, retry backoff, import/media/AI byte limits, and graceful worker shutdown that stops accepting new jobs before exit.

- [ ] **Step 4: Re-run**

Run: `pnpm vitest run packages/testing/src/job-chaos.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/queue packages/config apps/worker packages/testing
git commit -m "fix: harden worker retries and resource limits"
```

---

### Task 5: Add production compose, migration entrypoint, and deploy verification

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `scripts/migrate-production.sh`
- Create: `scripts/verify-production.sh`
- Create: `docs/operations/deploy-portainer.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: Portainer-ready production stack and non-destructive verification.

- [ ] **Step 1: Write production config verifier**

`verify-production.sh` checks:
- web/worker/db services exist;
- persistent DB/uploads volumes exist;
- required env variable names are referenced;
- no development bind mounts;
- no marketplace payment service/route flag enabled;
- health endpoints return expected status after startup.

- [ ] **Step 2: Run before production compose exists**

Run: `bash scripts/verify-production.sh`  
Expected: FAIL.

- [ ] **Step 3: Implement production stack**

Use immutable built images, healthchecks, restart policies, shared persistent upload volume, DB persistent volume, and a one-shot migration command before app rollout. Never use `docker compose down -v` in deployment docs.

- [ ] **Step 4: Validate**

Run:
```bash
docker compose -f docker-compose.prod.yml config
bash scripts/verify-production.sh
```

Expected: PASS in the production-like local environment.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.prod.yml scripts/migrate-production.sh scripts/verify-production.sh docs/operations/deploy-portainer.md .github/workflows/ci.yml
git commit -m "ops: add Portainer production deployment"
```

---

### Task 6: Add final release-gate script and marketplace boundary test

**Files:**
- Create: `scripts/release-gate.sh`
- Create: `packages/testing/src/marketplace-boundary.test.ts`
- Create: `docs/operations/release-checklist.md`

**Interfaces:**
- Produces: one command for code-level V1 release verification.

- [ ] **Step 1: Write failing marketplace boundary test**

```ts
it("has no user-to-user payment transaction endpoint in V1", () => {
  const routes = listApiRoutePaths();
  expect(routes).not.toContain("/api/v1/marketplace/checkout");
  expect(routes).not.toContain("/api/v1/payouts");
  expect(routes).not.toContain("/api/v1/escrow");
});
```

- [ ] **Step 2: Run and confirm route scanner works**

Run: `pnpm vitest run packages/testing/src/marketplace-boundary.test.ts`  
Expected: PASS only when V1 boundary is intact.

- [ ] **Step 3: Implement release-gate script**

`release-gate.sh` runs:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @sammlerraum/web exec playwright test
bash scripts/verify-production.sh
bash scripts/verify-restore.sh
```

Also verify OpenAPI generation succeeds and DE/EN translation key parity has no missing keys.

- [ ] **Step 4: Run the complete gate**

Run: `bash scripts/release-gate.sh`  
Expected: PASS with zero skipped critical suites.

- [ ] **Step 5: Commit**

```bash
git add scripts/release-gate.sh packages/testing/src/marketplace-boundary.test.ts docs/operations/release-checklist.md
git commit -m "test: add final Sammlerraum V1 release gate"
```

---

### Task 7: Production smoke after Portainer deployment

**Files:**
- Create: `.github/workflows/production-smoke.yml`
- Create: `scripts/smoke-production.sh`

**Interfaces:**
- Consumes: deployed `https://sammlerraum.de`.
- Produces: external read-only smoke verification.

- [ ] **Step 1: Write smoke script against required public endpoints**

Check:
- `/api/health`;
- German landing/login/pricing;
- English landing/login/pricing;
- `/api/openapi.json`;
- unsigned billing webhook request is rejected;
- private media random UUID returns 404;
- no marketplace checkout endpoint exists.

- [ ] **Step 2: Run against an undeployed/non-current target and confirm it fails meaningfully**

Run: `BASE_URL=https://sammlerraum.de bash scripts/smoke-production.sh`  
Expected before deployment: non-zero if V1 is not deployed.

- [ ] **Step 3: Configure GitHub workflow for manual smoke execution**

The workflow takes `base_url` input defaulting to `https://sammlerraum.de` and runs only read-only smoke checks.

- [ ] **Step 4: Deploy through Portainer without deleting volumes, then run smoke**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/production-smoke.yml scripts/smoke-production.sh
git commit -m "ops: add external production smoke verification"
```
