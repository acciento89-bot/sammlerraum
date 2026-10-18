### Task 7: Add catalog lookup, proposal, condition, and grading UI

**Files:**
- Create: `apps/web/src/components/catalog/catalog-linker.tsx`
- Create: `apps/web/src/app/[locale]/(app)/catalog/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/catalog/[entryId]/page.tsx`
- Create: `apps/web/src/components/items/condition-grading-editor.tsx`
- Create: `apps/web/e2e/catalog-grading.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: catalog search/link/proposal, condition, grading APIs.
- Produces: reference lookup/linking, new-entry/correction proposal UI, category condition selection, independent grading editor.

- [ ] **Step 1: Write failing separation E2E**

```ts
test("changing own condition does not overwrite external grading", async ({ page }) => {
  await openSeededGradedItem(page, "de");
  await selectCondition(page, "Near Mint");
  await saveItem(page);
  await expect(page.getByText("PSA 9")).toBeVisible();
  await expect(page.getByText("Near Mint")).toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/catalog-grading.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Catalog candidates always show variant-disambiguating fields such as language/edition/reference. Proposal forms require change summary and optional source URL. Condition and grading render as separate sections.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/catalog-grading.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add catalog condition and grading UI"
```
