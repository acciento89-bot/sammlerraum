### Task 6: Add collection/item REST APIs and policy enforcement

**Files:**
- Create: `apps/web/src/app/api/v1/collections/route.ts`
- Create: `apps/web/src/app/api/v1/collections/[collectionId]/nodes/route.ts`
- Create: `apps/web/src/app/api/v1/items/route.ts`
- Create: `apps/web/src/app/api/v1/items/[itemId]/route.ts`
- Modify: `packages/domain/src/authz/policy.ts`
- Create: `apps/web/src/app/api/v1/items/item-api.test.ts`

**Interfaces:**
- Consumes: contracts + domain services + policy engine.
- Produces: collection/item CRUD API.

- [ ] **Step 1: Write failing private-ancestor API test**

```ts
it("returns 404 for anonymous access to a public item under a private ancestor", async () => {
  const response = await requestItemAsAnonymous(itemWithPrivateAncestor.id);
  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/src/app/api/v1/items/item-api.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement thin routes and policy facts**

Routes validate Zod contracts, load actor/resource facts, call `assertAuthorized`, then call domain services. For unauthorized private resources, return 404 rather than confirming existence.

- [ ] **Step 4: Run API and domain tests**

Run:
```bash
pnpm vitest run packages/domain/src/collections packages/domain/src/items packages/domain/src/custom-fields packages/domain/src/locations apps/web/src/app/api/v1/items
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1 packages/domain/src/authz
git commit -m "feat: expose collection and item APIs"
```

---

