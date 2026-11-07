### Task 5: Add localized search and dashboard UI

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/search/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`
- Create: `apps/web/src/components/search/filter-builder.tsx`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`
- Create: `apps/web/e2e/search-dashboard.spec.ts`

**Interfaces:**
- Consumes: search/smart/dashboard APIs.
- Produces: responsive collector search/filter/dashboard flows.

- [ ] **Step 1: Write failing E2E scenario**

```ts
test("saved smart collection updates after an item is tagged", async ({ page }) => {
  await seedOwnedItem({ title: "Card", tags: [] });
  await page.goto("/de/search");
  await createSmartCollectionInUi(page, { tag: "signiert" });
  await tagSeededItemInUi(page, "signiert");
  await expect(page.getByText("Card")).toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/search-dashboard.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Use URL state for active filters, accessible controls, mobile responsive filter drawer, locale-aware money/date rendering, and no hard-coded German text in components.

- [ ] **Step 4: Run tests/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/search-dashboard.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add search smart collection and dashboard UI"
```
