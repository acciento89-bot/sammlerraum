### Task 7: Add collaboration, sharing, and audit UI

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/collections/[collectionId]/members/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/collections/[collectionId]/sharing/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/audit/page.tsx`
- Create: `apps/web/src/components/sharing/share-permissions-editor.tsx`
- Create: `apps/web/e2e/collaboration-sharing.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: invitation/membership/share/audit APIs.
- Produces: role management, invite acceptance, granular link sharing, revocation, audit history, supported restore UI.

- [ ] **Step 1: Write failing revoked-share E2E**

```ts
test("revoking a share invalidates the existing public link immediately", async ({ page, context }) => {
  const url = await createShareInUi(page, { images: true, values: false });
  const guest = await context.newPage();
  await guest.goto(url);
  await expect(guest.getByText(seedItemTitle)).toBeVisible();
  await revokeShareInUi(page);
  await guest.reload();
  await expect(guest.getByText(seedItemTitle)).not.toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/collaboration-sharing.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Role controls hide impossible transitions but still rely on server policy. Sharing editor starts with safe defaults, supports expiry/PIN/selected documents/export scope, and visibly distinguishes member access from share access. Audit restore shows conflict errors rather than overwriting newer data.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/collaboration-sharing.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add collaboration sharing and audit UI"
```
