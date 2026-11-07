### Task 7: Add import, export, insurance, and report UI

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/imports/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/imports/[jobId]/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/exports/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/insurance/page.tsx`
- Create: `apps/web/src/components/imports/mapping-editor.tsx`
- Create: `apps/web/src/components/reports/report-field-selector.tsx`
- Create: `apps/web/e2e/import-report.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: import/export/insurance/report APIs and job progress.
- Produces: preview/mapping/conflict-resolution flow, export request/history, insurance editor, explicit PDF field selector.

- [ ] **Step 1: Write failing conflict-resolution E2E**

```ts
test("import conflict requires an explicit row decision before commit", async ({ page }) => {
  await uploadConflictFixture(page);
  await expect(page.getByText("Konflikt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import starten" })).toBeDisabled();
  await chooseConflictAction(page, 1, "Als separates Exemplar");
  await expect(page.getByRole("button", { name: "Import starten" })).toBeEnabled();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/import-report.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Show parser/job progress, row errors, mapping-profile save/load, conflict decisions, and export history. Insurance report selector defaults all sensitive switches off and shows the exact included fields before queueing a report.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/import-report.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add import export and insurance report UI"
```
