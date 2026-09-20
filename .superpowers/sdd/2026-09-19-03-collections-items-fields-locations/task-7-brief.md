### Task 7: Add responsive collection and item management UI

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/collections/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/collections/[collectionId]/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/items/new/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/items/[itemId]/page.tsx`
- Create: `apps/web/src/components/items/item-form.tsx`
- Create: `apps/web/src/components/items/code-scanner.tsx`
- Create: `apps/web/e2e/collections-items.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: collection/item/custom-field/location APIs.
- Produces: mobile/desktop flows to create hierarchy, add/edit/archive items, manage identifiers/tags/custom fields, assign locations, and capture codes.

- [ ] **Step 1: Write failing E2E flow**

```ts
test("collector creates a nested collection and item with custom field and location", async ({ page }) => {
  await loginSeedUser(page, "de");
  await createCollectionInUi(page, "Pokémon");
  await createSubcollectionInUi(page, "Base Set");
  await createCustomFieldInUi(page, "Edition", "SHORT_TEXT");
  await createLocationInUi(page, ["Wohnzimmer", "Vitrine", "Fach 2"]);
  await createItemInUi(page, { title: "Glurak", edition: "1st", location: "Fach 2" });
  await expect(page.getByText("Glurak")).toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/collections-items.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement responsive UI**

Use accessible tree/navigation controls, explicit visibility selector, separate public description/private notes, canonical money/date inputs, and progressive disclosure for advanced fields.

`code-scanner.tsx` uses the browser `BarcodeDetector` API when available and always exposes manual EAN/UPC/ISBN entry as fallback. Scanner output is only an identifier proposal until the user confirms it.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/collections-items.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS in mobile and desktop projects.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add collection and item management UI"
```

---

