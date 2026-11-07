### Task 2: Add follows and favorites

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/community/social-service.ts`
- Create: `packages/domain/src/community/social-service.test.ts`
- Create: `apps/web/src/app/api/v1/community/follows/route.ts`
- Create: `apps/web/src/app/api/v1/community/favorites/route.ts`

**Interfaces:**
- Produces: `followUser`, `unfollowUser`, `favoriteTarget`, `unfavoriteTarget`.

- [ ] **Step 1: Write failing visibility/block tests**

```ts
it("cannot favorite a private item the actor cannot view", async () => {
  await expect(service.favoriteTarget(actor, { type: "ITEM", id: privateItemId }))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("blocked users cannot follow each other", async () => {
  await expect(service.followUser(blockedActor, blockerId))
    .rejects.toMatchObject({ code: "BLOCKED_INTERACTION" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/community/social-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement social relationships**

Unique follow pair and favorite target constraints. Self-follow rejected. Favorite supports public collection/item targets only when policy allows current read.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/community/social-service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/community apps/web/src/app/api/v1/community
git commit -m "feat: add follows and favorites"
```

---

