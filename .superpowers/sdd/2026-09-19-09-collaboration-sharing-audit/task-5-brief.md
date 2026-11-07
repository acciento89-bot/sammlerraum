### Task 5: Integrate audit emission into core mutations

**Files:**
- Modify: `packages/domain/src/items/item-service.ts`
- Modify: `packages/domain/src/collections/collection-service.ts`
- Modify: `packages/domain/src/locations/location-service.ts`
- Modify: `packages/domain/src/grading/grading-service.ts`
- Modify: `packages/domain/src/valuations/valuation-service.ts`
- Create: `packages/domain/src/audit/core-audit-integration.test.ts`

**Interfaces:**
- Consumes: audit service.
- Produces: core mutation audit coverage.

- [ ] **Step 1: Write failing mutation coverage test**

```ts
it("records item condition and location changes", async () => {
  await conditionService.setItemCondition(itemId, conditionId);
  await locationService.assignItemLocation(itemId, locationId);
  const events = await audit.listAuditEventsForResource("ITEM", itemId, actor);
  expect(events.map(e => e.action)).toEqual(
    expect.arrayContaining(["ITEM_CONDITION_CHANGED", "ITEM_LOCATION_CHANGED"])
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/audit/core-audit-integration.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Emit audit in same transaction where possible**

Add audited mutations for visibility, condition, grading, values, location, tags/custom fields, media/document link changes, role changes, import changes, archive/delete/restore.

- [ ] **Step 4: Run domain tests**

Run: `pnpm vitest run packages/domain`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat: audit core collection mutations"
```

---

