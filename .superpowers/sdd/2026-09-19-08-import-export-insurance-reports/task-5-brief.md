### Task 5: Add insurance data and private-by-default rules

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/insurance/insurance-service.ts`
- Create: `packages/domain/src/insurance/insurance-service.test.ts`

**Interfaces:**
- Produces: `setCollectionInsurance`, `setItemInsurance`, `getInsuranceData`.

- [ ] **Step 1: Write failing privacy test**

```ts
it("does not expose policy reference in public item data", async () => {
  const publicDto = await itemQuery.getPublicItem(itemId);
  expect(publicDto).not.toHaveProperty("policyReference");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/insurance/insurance-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement insurance model**

Store insured amount minor/currency, valuation date, insurer, policy reference, notes, collection/item linkage. Access requires explicit owner/editor policy as defined; public API projections exclude it.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name insurance
pnpm vitest run packages/domain/src/insurance
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/insurance
git commit -m "feat: add private insurance records"
```

---

