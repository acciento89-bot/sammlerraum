### Task 6: Generate selectable PDF inventory reports

**Files:**
- Create: `packages/domain/src/reports/report-schema.ts`
- Create: `apps/worker/src/jobs/build-insurance-report.ts`
- Create: `apps/worker/src/jobs/build-insurance-report.test.ts`
- Create: `apps/web/src/app/api/v1/reports/insurance/route.ts`

**Interfaces:**
- Produces: `InsuranceReportOptions`, PDF asset.

- [ ] **Step 1: Write failing default-exclusion test**

```ts
it("excludes sensitive fields unless explicitly selected", async () => {
  const model = await buildReportModel(actor, { collectionId, include: ["images", "values"] });
  expect(model.items[0]).not.toHaveProperty("storageLocation");
  expect(model.items[0]).not.toHaveProperty("privateNotes");
  expect(model).not.toHaveProperty("policyReference");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/build-insurance-report.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement report generation**

Generate snapshot metadata with `reportAsOf`, selected fields, item images, values, and explicitly selected proofs. Persist report as protected media asset.

- [ ] **Step 4: Run tests/build**

Run:
```bash
pnpm vitest run apps/worker/src/jobs/build-insurance-report.test.ts packages/domain/src/insurance
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/reports apps/worker/src/jobs/build-insurance-report* apps/web/src/app/api/v1/reports
git commit -m "feat: generate insurance inventory reports"
```

---

