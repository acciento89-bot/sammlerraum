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

## Binding handoff
Use the existing item management page, management styling and DE/EN conventions. Task2 delivered owner-only bounded upload and POST link APIs; Task4 delivered protected byte reads; Task5 delivers authorized unlink and retention cleanup. Extend the existing service/routes with the minimal owner-authorized listing, title/reordering and document category/visibility controls needed by this UI. Do not expose storage keys or server paths in DTOs, DOM or public links. Preserve same-origin mutation guards and owner-hidden 404 behavior. Gallery reorder and title selection must validate link ownership/item membership and update atomically. Provide accessible keyboard move controls in addition to drag/reorder.

Document visibility defaults PRIVATE and must remain independent of item visibility; show deliberate explicit controls, localized errors, upload progress/cancel and pending/failed image processing. A canceled linked upload must not accidentally produce a success message; canceling an unlinked upload leaves recoverable retained intent for Task5 cleanup. Add the previously ruled minimal read-only public item/gallery view using authoritative public DTO and Task4 authorization, with noindex. No private metadata, storage locations, acquisition details or document listings may be exposed publicly. Purchase receipt remains private after owner logout even when item/image public. Use existing E2E/auth fixtures and real migrated test PostgreSQL; protect fixture cleanup with _test DB gate and avoid a production endpoint for test data.

Register new Playwright spec in actual configured projects and CI invocation; currently testMatch excludes media-documents.spec.ts. Run required journeys against production build before dev journeys overwrite .next. Browser evidence must cover desktop/mobile and DE/EN critical controls, real private receipt denial, title/order persistence and unauthorized mutation denial. Do not claim DB/E2E passes if skipped; remote CI is available when no local PostgreSQL. Preserve published migrations and unrelated files. Deferred Phase03 M1 blank INTEGER parsing and M2 duplicate location ancestry are not within media UI scope unless this task touches those exact paths; carry forward for later item UI work.

## Updated local verification availability (17 October 2026)
Controller has now installed PostgreSQL17.11 and started an isolated task-owned database on localhost5432, usertest, database sammlerraum_test. All migrations through Task5 are applied. Source ../sammlerraum-test-env.sh from repository root to set synthetic test env; no live provider credentials. Vitest setup hardcodes localhost5432 and /tmp/sammlerraum-test-uploads; test server env uses task-owned uploads. Local3000 is free. Use pinned pnpm10.17.1 (npm exec --yes --package=pnpm@10.17.1 -- pnpm ...), not newer PATH shim. Playwright Chromium may already be cached; install exact version if needed. Run actual failing browser journey before implementation, then GREEN; all fixture data stays in _test DB. The report's earlier no-localDB limitation is historical, not a reason to skip your local browser gates. Preserve controllers' test PostgreSQL process and env helper for your task.
