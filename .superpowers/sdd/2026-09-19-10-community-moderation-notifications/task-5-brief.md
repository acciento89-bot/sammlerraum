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

