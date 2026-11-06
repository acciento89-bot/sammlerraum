### Task 3: Commit imports idempotently with row decisions

**Files:**
- Create: `apps/worker/src/jobs/commit-import.ts`
- Create: `apps/worker/src/jobs/commit-import.test.ts`

**Interfaces:**
- Consumes: approved preview + row resolutions.
- Produces: created/merged/skipped item results.

- [ ] **Step 1: Write failing retry test**

```ts
it("does not create a second item when the same commit job is retried", async () => {
  await handler({ jobId });
  await handler({ jobId });
  expect(await itemRepo.countByImportRow(jobId, "row-1")).toBe(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/commit-import.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement transaction/chunk commit**

Each row has stable idempotency identity. Apply `CREATE`, `SKIP`, `MERGE`, or `CREATE_SEPARATE`. Update job progress after each chunk and retain row-level result.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/worker/src/jobs/commit-import.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/commit-import.ts apps/worker/src/jobs/commit-import.test.ts
git commit -m "feat: commit imports idempotently"
```

---

