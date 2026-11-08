### Task 8: Add public profile routes and wire community events into notifications/dashboard

**Files:**
- Create: `apps/web/src/app/[locale]/@[handle]/page.tsx`
- Create: `apps/web/src/app/[locale]/@[handle]/[collectionSlug]/page.tsx`
- Create: `apps/web/src/app/[locale]/@[handle]/[collectionSlug]/items/[itemId]/page.tsx`
- Create: `packages/domain/src/notifications/community-event-handlers.ts`
- Create: `packages/domain/src/notifications/community-event-handlers.test.ts`
- Modify: `packages/domain/src/dashboard/dashboard-service.ts`
- Modify: `packages/domain/src/dashboard/dashboard-service.test.ts`
- Create: `apps/web/e2e/public-profile.spec.ts`

**Interfaces:**
- Consumes: public profile, collection visibility, follow/favorite/comment/wishlist events, dashboard service.
- Produces: stable public profile/collection/item URLs, idempotent community notifications, wishlist/duplicate dashboard metrics and milestone inputs.

- [ ] **Step 1: Write failing event-deduplication and privacy tests**

```ts
it("creates one notification for one favorite event and removes target details when the target becomes private", async () => {
  await handlers.onFavoriteCreated(favoriteEvent);
  await handlers.onFavoriteCreated(favoriteEvent);
  expect(await notificationRepo.countByEventKey(favoriteEvent.eventKey)).toBe(1);

  await itemService.updateItem(itemId, { visibility: "PRIVATE" }, owner);
  const notification = await notificationQuery.getForRecipient(owner.id);
  expect(notification[0].safeTargetLabel).toBeNull();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/notifications/community-event-handlers.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement handlers and public routes**

Emit notifications for follow, favorite, comment/reply, moderation status, import/export completion, and later billing/security hooks through stable event keys. Public profile routes expose only public collections/items, never login email or private statistics. Public collection URLs use owner handle + stable collection slug with collision-safe suffix generation. Add a stable public item route under `/<locale>/@<handle>/<collectionSlug>/items/<itemId>` that resolves only effectively PUBLIC items and returns 404 for private/unlisted/inaccessible descendants.

Extend dashboard data with wishlist progress, duplicate count, and milestone candidates such as item-count thresholds and completed collections; milestones remain informational only.

- [ ] **Step 4: Run unit/E2E/build**

Run:
```bash
pnpm vitest run packages/domain/src/notifications packages/domain/src/dashboard
pnpm --filter @sammlerraum/web exec playwright test e2e/public-profile.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/notifications packages/domain/src/dashboard apps/web
git commit -m "feat: add public collector profiles and community event wiring"
```
