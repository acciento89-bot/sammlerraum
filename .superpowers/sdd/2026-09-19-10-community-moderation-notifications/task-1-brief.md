### Task 1: Add wishlist entries and duplicate relations

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/wishlist/wishlist-service.ts`
- Create: `packages/domain/src/wishlist/wishlist-service.test.ts`
- Create: `packages/contracts/src/wishlist.ts`

**Interfaces:**
- Produces: `createWishlistEntry`, `fulfillWishlistEntry`, `markDuplicateRelation`, `listDuplicateCandidates`.

- [ ] **Step 1: Write failing separate-exemplar test**

```ts
it("marks two distinct exemplars as duplicates without merging their grading", async () => {
  await service.markDuplicateRelation(actor, itemA, itemB);
  expect((await itemRepo.get(itemA)).grading).not.toEqual((await itemRepo.get(itemB)).grading);
  expect(await service.areMarkedDuplicates(itemA, itemB)).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/wishlist/wishlist-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement wishlist/duplicate models**

Wishlist supports optional catalog entry/variant, free title, desired condition, target price, currency, priority, notes, fulfillment timestamp. `DuplicateRelation` links two item IDs canonically ordered to prevent duplicate pair rows.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name wishlist_duplicates
pnpm vitest run packages/domain/src/wishlist
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/wishlist packages/contracts/src/wishlist.ts
git commit -m "feat: add wishlists and duplicate relations"
```

---

