### Task 4: Add source comparison API and item valuation summary

**Files:**
- Create: `packages/domain/src/valuations/valuation-query.ts`
- Create: `packages/domain/src/valuations/valuation-query.test.ts`
- Create: `apps/web/src/app/api/v1/items/[itemId]/valuations/route.ts`

**Interfaces:**
- Produces: `getItemValuationSummary(itemId, actor)`.

- [ ] **Step 1: Write failing mixed-currency test**

```ts
it("does not calculate a combined total across mixed currencies", async () => {
  const summary = await query.getItemValuationSummary(itemId, actor);
  expect(summary.aggregate).toBeNull();
  expect(summary.currencyConflict).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/valuations/valuation-query.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement transparent comparison**

Return manual latest + history and external observations grouped by provider/kind/currency. Do not compute a blended value unless all required inputs share currency and a later explicit aggregation method exists.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/valuations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/valuations apps/web/src/app/api/v1/items
git commit -m "feat: compare manual and market valuations"
```

---
