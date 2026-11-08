### Task 4: Add CSV/XLSX export jobs

**Files:**
- Create: `packages/domain/src/exports/export-service.ts`
- Create: `apps/worker/src/jobs/build-tabular-export.ts`
- Create: `apps/worker/src/jobs/build-tabular-export.test.ts`
- Create: `packages/contracts/src/exports.ts`

**Interfaces:**
- Produces: `requestExport(actor, scope, format)`, output media asset.

- [ ] **Step 1: Write failing scope/privacy test**

```ts
it("does not export inaccessible items or private document bytes", async () => {
  const rows = await buildRows(otherViewer, scope);
  expect(rows.map(r => r.itemId)).not.toContain(privateItemId);
  expect(rows[0]).not.toHaveProperty("privateDocument");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/build-tabular-export.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement export**

Support collection, subtree, filtered search, full authorized inventory, and wishlist later when model exists. CSV and XLSX use localized display labels but canonical raw data values.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/exports apps/worker/src/jobs/build-tabular-export.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/exports packages/contracts/src/exports.ts apps/worker/src/jobs/build-tabular-export*
git commit -m "feat: add CSV and XLSX exports"
```

---

