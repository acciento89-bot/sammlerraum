### Task 3: Add idempotent market sync jobs

**Files:**
- Create: `apps/worker/src/jobs/sync-market-data.ts`
- Create: `apps/worker/src/jobs/sync-market-data.test.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `market.sync { providerId, catalogVariantId }`.
- Produces: deduplicated observations.

- [ ] **Step 1: Write failing retry test**

```ts
it("does not duplicate provider observations on job retry", async () => {
  await handler(payload);
  await handler(payload);
  expect(await repo.countForExternalId("sale-123")).toBe(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/sync-market-data.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement sync handler**

Use provider observation external ID + provider ID as idempotency key. Reject/flag observations whose returned variant qualifiers do not match the requested catalog variant sufficiently.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/worker/src/jobs/sync-market-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs apps/worker/src/main.ts
git commit -m "feat: synchronize market data idempotently"
```

---
