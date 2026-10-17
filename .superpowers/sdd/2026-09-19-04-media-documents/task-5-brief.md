### Task 5: Add safe unlink, retention, and orphan cleanup

**Files:**
- Create: `packages/domain/src/media/cleanup-service.ts`
- Create: `packages/domain/src/media/cleanup-service.test.ts`
- Create: `apps/worker/src/jobs/cleanup-media.ts`

**Interfaces:**
- Consumes: media links, retention timestamps.
- Produces: `unlinkAsset`, `findDeletableAssets`, cleanup job.

- [ ] **Step 1: Write failing shared-reference test**

```ts
it("does not delete bytes while another valid link exists", async () => {
  await service.unlinkAsset(firstLinkId);
  await cleanup.run();
  expect(await storage.exists(asset.storageKey)).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/media/cleanup-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement retention cleanup**

Unlink inside DB transaction. Mark asset orphaned only when link count reaches zero. Worker deletes after retention deadline, then removes variant bytes and DB rows. If byte deletion fails, keep DB state retryable.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/media/cleanup-service.test.ts apps/worker/src/jobs/cleanup-media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/media apps/worker/src/jobs/cleanup-media.ts
git commit -m "feat: add safe media retention cleanup"
```

---


## Binding handoff for this resumed task
Read the Phase04 execution rulings, Additional Phase04 rulings, Task3 integration obligation, and Task5 late-write recovery ruling at the end of docs/superpowers/SAMMLERRAUM-V1-LEDGER.md. They extend this task's acceptance criteria. The same asset can be referenced by multiple item media links, private document links and avatar profiles, including references introduced by item splitting. All references count. An unlinked retained file must remain unreadable through existing read API.

Use the existing dedicated-session advisory lock namespace for ordinary process/cleanup exclusion. It does not fence unbounded storage I/O after a lost database session. Preserve durable discoverability of keys through minimal tombstones and periodically reconcile late writes, or demonstrate an equivalent tested scheme; no arbitrary timer expiry of that tracking. Reserved local-provider .storage-UUID.tmp files need conservative age-gated process-crash cleanup, with active-write/crash tests; preserve the four-method StorageProvider contract. Additive migrations only.

Supporting wiring into worker runtime, API exports/routes, database migration, config and CI is in scope when necessary to deliver the actual job and owner-only unlink. Do not implement Task6 UI. Keep production untouched; no real data cleanup. Do not mark plan/ledger complete until independent review and CI pass. Local Docker/PostgreSQL are not installed; use remote CI for live DB gates rather than claiming skipped integration tests pass. Install workspace dependencies with frozen lock and generate Prisma client before checks; Node and pnpm are on PATH.

Report any unspecified retention/default choices before implementing them. Existing recorded decisions remain authoritative. Keep stdout concise; save complete command evidence in task-5-report.md and log files beside it. Commit implementation and tests, but do not push; controller handles review and persistence. Never spawn subagents.
