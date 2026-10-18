### Task 4: Add condition schemes and normalized quality bands

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/condition/condition-service.ts`
- Create: `packages/domain/src/condition/condition-service.test.ts`

**Interfaces:**
- Produces: `getConditionScheme(categoryId)`, `setItemCondition(itemId, optionId)`.

- [ ] **Step 1: Write failing separation test**

```ts
it("stores exact condition label and optional normalized band separately", async () => {
  const saved = await service.setItemCondition(itemId, vinylVgPlusOption.id);
  expect(saved.conditionOption.labelKey).toBe("vinyl.vg_plus");
  expect(saved.normalizedBand).toBe(4);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/condition/condition-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement condition schemes**

Add `ConditionScheme`, `ConditionOption`, localized label keys, optional normalized band 1–5, ordering, active flag, and item condition relation.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/condition`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/condition
git commit -m "feat: add category condition schemes"
```

---

