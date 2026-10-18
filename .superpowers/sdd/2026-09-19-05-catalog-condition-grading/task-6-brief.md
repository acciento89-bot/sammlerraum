### Task 6: Link items to catalog entries safely

**Files:**
- Modify: `packages/domain/src/items/item-service.ts`
- Create: `packages/domain/src/catalog/item-catalog-link.test.ts`
- Create: `apps/web/src/app/api/v1/catalog/search/route.ts`

**Interfaces:**
- Produces: `linkItemToCatalog(itemId, entryId, variantId?)`, `unlinkItemFromCatalog`.

- [ ] **Step 1: Write failing unlink resilience test**

```ts
it("keeps the personal item when its catalog link is removed", async () => {
  await service.unlinkItemFromCatalog(itemId);
  expect(await itemRepo.get(itemId)).toMatchObject({ id: itemId, catalogEntryId: null });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/catalog/item-catalog-link.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement linking**

Require variant belongs to entry. Catalog IDs remain optional. Do not copy user-private facts into global catalog fields.

- [ ] **Step 4: Run tests and build**

Run:
```bash
pnpm vitest run packages/domain/src/catalog packages/domain/src/condition packages/domain/src/grading
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/items packages/domain/src/catalog apps/web/src/app/api/v1/catalog
git commit -m "feat: link personal items to global catalog"
```

---

