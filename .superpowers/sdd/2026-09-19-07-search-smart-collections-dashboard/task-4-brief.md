### Task 4: Add dashboard query service

**Files:**
- Create: `packages/domain/src/dashboard/dashboard-service.ts`
- Create: `packages/domain/src/dashboard/dashboard-service.test.ts`
- Create: `packages/contracts/src/dashboard.ts`

**Interfaces:**
- Produces: `getDashboard(actor, scope): Promise<DashboardData>`.

- [ ] **Step 1: Write failing currency/privacy tests**

```ts
it("groups monetary totals by currency instead of mixing them", async () => {
  const data = await service.getDashboard(actor, {});
  expect(data.purchaseTotals).toEqual([
    { currency: "EUR", amountMinor: expect.any(BigInt) },
    { currency: "USD", amountMinor: expect.any(BigInt) }
  ]);
});

it("excludes inaccessible shared/private items", async () => {
  const data = await service.getDashboard(actor, {});
  expect(data.itemCount).toBe(expectedVisibleOwnedAndSharedCount);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/dashboard/dashboard-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement dashboard metrics**

Return item/collection counts, purchase totals by currency, latest manual/external values by currency/source, duplicates, wishlist counts when available later, trade statuses, top collections/items, recent additions, condition/grading distribution, missing-data counts.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/dashboard`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/dashboard packages/contracts/src/dashboard.ts
git commit -m "feat: add collector dashboard queries"
```

---

