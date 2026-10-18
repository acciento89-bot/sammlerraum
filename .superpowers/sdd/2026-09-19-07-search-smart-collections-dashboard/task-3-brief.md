### Task 3: Add Smart Collections

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/search/smart-collection-service.ts`
- Create: `packages/domain/src/search/smart-collection-service.test.ts`
- Create: `apps/web/src/app/api/v1/smart-collections/route.ts`

**Interfaces:**
- Produces: `createSmartCollection`, `updateSmartCollection`, `resolveSmartCollectionItems`.

- [ ] **Step 1: Write failing dynamic-membership test**

```ts
it("reflects item changes without storing membership rows", async () => {
  const smart = await service.createSmartCollection(actor, filterForTag("signed"));
  expect((await service.resolveSmartCollectionItems(smart.id)).items).toHaveLength(0);
  await tagService.setItemTags(itemId, ["signed"]);
  expect((await service.resolveSmartCollectionItems(smart.id)).items.map(x => x.id)).toContain(itemId);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/search/smart-collection-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement versioned saved AST**

Persist `filterVersion` and validated JSON representation of the typed AST. Do not create item membership join rows.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name smart_collections
pnpm vitest run packages/domain/src/search
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/search apps/web/src/app/api/v1/smart-collections
git commit -m "feat: add dynamic smart collections"
```

---

