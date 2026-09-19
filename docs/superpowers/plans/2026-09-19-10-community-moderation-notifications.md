# Community, Wishlist, Moderation, and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement wishlists, duplicate relations, public community interactions, moderation, blocks/reports, the community feed, in-app notifications, and transactional/optional email delivery.

**Architecture:** Community state is separate from collection ownership. Blocking is enforced in policies before interactions are created. Domain events create internal notifications; channel delivery is handled asynchronously through the worker.

**Tech Stack:** Prisma 7, PostgreSQL 17, Nodemailer/SMTP abstraction, pg-boss, Zod, Vitest, Next.js.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Community use is optional.
- Private content never enters public profile/feed/search because of community features.
- Blocks prevent direct community interaction between the two accounts.
- Comments can be disabled globally, by collection, or by item.
- Security-critical email cannot be disabled by normal notification preferences.

## Review Focus

1. Blocked users must not follow, comment on, favorite, or directly notify each other.
2. Deleted/private content must disappear from feeds without leaking its title through old notifications.
3. Duplicate marking must support separate exemplars with different condition/grading.
4. Notification retries must not create duplicate in-app rows or duplicate emails.
5. A reported comment must remain available to authorized moderators even if hidden publicly.

---

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

### Task 3: Add comments, blocks, and reports

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/community/comment-service.ts`
- Create: `packages/domain/src/moderation/block-report-service.ts`
- Create: `packages/domain/src/community/comment-service.test.ts`
- Create: `packages/domain/src/moderation/block-report-service.test.ts`

**Interfaces:**
- Produces: `createComment`, `deleteOwnComment`, `moderateOwnContentComment`, `blockUser`, `reportUser`, `reportComment`.

- [ ] **Step 1: Write failing comment disable/block tests**

```ts
it("rejects comments when the item owner disabled them", async () => {
  await expect(commentService.createComment(actor, itemWithCommentsDisabled, "hello"))
    .rejects.toMatchObject({ code: "COMMENTS_DISABLED" });
});

it("a block removes direct comment permission", async () => {
  await blockService.blockUser(ownerId, actor.id);
  await expect(commentService.createComment(actor, publicItem, "hello"))
    .rejects.toMatchObject({ code: "BLOCKED_INTERACTION" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/community/comment-service.test.ts packages/domain/src/moderation/block-report-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement models/services**

Comment target is collection or item, supports optional parent comment for reply, soft-delete/hide state. Reports retain reason/category, reporter, target snapshot IDs, moderation status. Blocks are directional but policy treats either relevant direction as disabling direct interaction.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/community packages/domain/src/moderation`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/community packages/domain/src/moderation
git commit -m "feat: add comments blocks and reports"
```

---

### Task 4: Add moderation workflow

**Files:**
- Create: `packages/domain/src/moderation/moderation-service.ts`
- Create: `packages/domain/src/moderation/moderation-service.test.ts`
- Create: `apps/web/src/app/api/v1/moderation/reports/route.ts`

**Interfaces:**
- Produces: `listReports`, `resolveReport`, `hideContent`, `restoreContent`.

- [ ] **Step 1: Write failing moderator-access test**

```ts
it("keeps reported hidden comment available to authorized moderators", async () => {
  await moderation.hideContent(commentId, moderator);
  expect(await publicCommentQuery(commentId)).toBeNull();
  expect(await moderation.getCommentForReview(commentId, moderator)).toBeDefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/moderation/moderation-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement moderation status and roles**

Introduce application moderator/admin role separate from collection roles. Actions require reason and emit audit events with source `MODERATION`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/moderation`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/moderation apps/web/src/app/api/v1/moderation
git commit -m "feat: add community moderation workflow"
```

---

### Task 5: Add notification event model and preferences

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/notifications/notification-service.ts`
- Create: `packages/domain/src/notifications/notification-service.test.ts`
- Create: `packages/contracts/src/notifications.ts`

**Interfaces:**
- Produces: `createNotificationOnce`, `markRead`, `markAllRead`, `updatePreferences`.

- [ ] **Step 1: Write failing dedupe test**

```ts
it("creates one in-app notification for the same event key", async () => {
  await service.createNotificationOnce(event);
  await service.createNotificationOnce(event);
  expect(await repo.countByEventKey(event.eventKey)).toBe(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/notifications/notification-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement notification models**

Notification includes recipient, event key, type, safe target reference, readAt, createdAt. Preferences are per category/channel. Security categories ignore disable requests for required email delivery.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name notifications
pnpm vitest run packages/domain/src/notifications
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/notifications packages/contracts/src/notifications.ts
git commit -m "feat: add in-app notifications and preferences"
```

---

### Task 6: Add email provider abstraction and delivery worker

**Files:**
- Create: `packages/email/package.json`
- Create: `packages/email/src/types.ts`
- Create: `packages/email/src/smtp-provider.ts`
- Create: `apps/worker/src/jobs/send-email.ts`
- Create: `apps/worker/src/jobs/send-email.test.ts`
- Modify: `packages/config/src/server.ts`

**Interfaces:**
- Produces: `EmailProvider.send(message)`, job `notification.send-email`.

- [ ] **Step 1: Write failing retry-dedupe test**

```ts
it("does not send the same delivery record twice after successful retry acknowledgement", async () => {
  await handler({ deliveryId });
  await handler({ deliveryId });
  expect(fakeProvider.sent).toHaveLength(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/send-email.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement SMTP adapter and delivery records**

Use required production SMTP env config. Persist delivery status and provider message ID. Render DE/EN templates from stable notification type data; never embed sensitive private content in generic community email subjects.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/email apps/worker/src/jobs/send-email.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/email apps/worker/src/jobs/send-email* packages/config
git commit -m "feat: deliver localized notification emails"
```

---

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

### Task 8: Add public profile routes and wire community events into notifications/dashboard

**Files:**
- Create: `apps/web/src/app/[locale]/@[handle]/page.tsx`
- Create: `apps/web/src/app/[locale]/@[handle]/[collectionSlug]/page.tsx`
- Create: `packages/domain/src/notifications/community-event-handlers.ts`
- Create: `packages/domain/src/notifications/community-event-handlers.test.ts`
- Modify: `packages/domain/src/dashboard/dashboard-service.ts`
- Modify: `packages/domain/src/dashboard/dashboard-service.test.ts`
- Create: `apps/web/e2e/public-profile.spec.ts`

**Interfaces:**
- Consumes: public profile, collection visibility, follow/favorite/comment/wishlist events, dashboard service.
- Produces: stable public profile/collection URLs, idempotent community notifications, wishlist/duplicate dashboard metrics and milestone inputs.

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

Emit notifications for follow, favorite, comment/reply, moderation status, import/export completion, and later billing/security hooks through stable event keys. Public profile routes expose only public collections/items, never login email or private statistics. Public collection URLs use owner handle + stable collection slug with collision-safe suffix generation.

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
