### Task 7: Add feed and responsive community/wishlist UI

**Files:**
- Create: `packages/domain/src/community/feed-service.ts`
- Create: `packages/domain/src/community/feed-service.test.ts`
- Create: `apps/web/src/app/[locale]/(app)/community/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/wishlist/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/notifications/page.tsx`
- Create: `apps/web/e2e/community.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Produces: authorized feed and complete community/wishlist/notification user flows.

- [ ] **Step 1: Write failing feed privacy test**

```ts
it("drops content that became private after the feed event was created", async () => {
  const page = await feedService.getFeed(viewer, {});
  expect(page.items.map(x => x.targetId)).not.toContain(nowPrivateItemId);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/community/feed-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement feed and UI**

Feed is query-time policy filtered. UI supports follow, favorite, comment/reply, block/report, wishlist create/fulfill, duplicate marking, trade status display, notification read state, and comment-disable controls for owners.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm vitest run packages/domain/src/community packages/domain/src/wishlist packages/domain/src/notifications
pnpm --filter @sammlerraum/web exec playwright test e2e/community.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/community apps/web
git commit -m "feat: add community wishlist and notification UI"
```

---

