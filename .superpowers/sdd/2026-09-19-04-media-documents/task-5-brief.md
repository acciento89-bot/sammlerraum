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
