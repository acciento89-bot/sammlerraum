### Task 6: Add media gallery and private document UI

**Files:**
- Create: `apps/web/src/components/media/item-gallery-editor.tsx`
- Create: `apps/web/src/components/media/document-manager.tsx`
- Create: `apps/web/e2e/media-documents.spec.ts`
- Modify: `apps/web/src/app/[locale]/(app)/items/[itemId]/page.tsx`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: media upload/read/link APIs.
- Produces: title image selection, ordered gallery, document typing, explicit document visibility controls, upload progress/error UI.

- [ ] **Step 1: Write failing private-document E2E**

```ts
test("public item can have a purchase receipt that remains private", async ({ page, request }) => {
  await uploadPublicItemImageAndPrivateReceipt(page);
  await logout(page);
  await expect(page.getByAltText("Sammlerstück")).toBeVisible();
  const receiptResponse = await request.get(privateReceiptUrl);
  expect(receiptResponse.status()).toBe(404);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/media-documents.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Support drag/reorder gallery, title-image selection, document category, private-by-default toggle state, upload cancellation, processing state, and clear size/type errors. Do not render original storage keys.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/media-documents.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add item media and document management UI"
```
