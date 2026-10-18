### Task 2: Compile filters to authorized database queries

**Files:**
- Create: `packages/domain/src/search/item-search-service.ts`
- Create: `packages/domain/src/search/item-search-service.test.ts`
- Create: `apps/web/src/app/api/v1/search/items/route.ts`

**Interfaces:**
- Produces: `searchItems(actor, query): Promise<SearchPage<ItemSummary>>`.

- [ ] **Step 1: Write failing hidden-count test**

```ts
it("does not include private inaccessible items in rows or total count", async () => {
  const result = await service.searchItems(otherUser, { text: "watch", filter: null });
  expect(result.items.map(x => x.id)).not.toContain(privateItemId);
  expect(result.total).toBe(result.items.length);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/search/item-search-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement query compilation**

Compile validated AST to Prisma predicates and safe raw SQL only where required for recursive visibility/text search. No client string is concatenated into SQL. Use cursor pagination.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/search`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/search apps/web/src/app/api/v1/search
git commit -m "feat: add authorized item search"
```

---

