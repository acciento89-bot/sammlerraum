# Import, Export, Insurance, and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement safe CSV/XLSX imports, reusable mapping profiles, CSV/XLSX exports, insurance metadata, and selectable PDF inventory reports.

**Architecture:** Imports/exports are background jobs with persisted job state. Parsing is bounded and staged into preview then commit. Insurance data is private by default and report field inclusion is explicit.

**Tech Stack:** ExcelJS, csv-parse/csv-stringify, PDFKit, Prisma 7, pg-boss, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Imports never silently overwrite existing items.
- Preview precedes commit.
- Invalid locale money/date values produce row-level errors.
- Private documents and sensitive insurance fields are excluded unless explicitly selected.
- Large imports/exports execute in worker jobs with progress.

## Review Focus

1. Formula cells/macros must never execute during XLSX import.
2. A 100k-row file must hit configured row/size limits rather than exhaust memory.
3. Retried commit jobs must not duplicate already-created rows.
4. Duplicate-resolution choices must be deterministic per source row.
5. PDF/export defaults must exclude storage locations, policy numbers, private notes, and private documents.

---

### Task 1: Add import job, preview, and mapping profile models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/imports/import-service.ts`
- Create: `packages/domain/src/imports/import-service.test.ts`
- Create: `packages/contracts/src/imports.ts`

**Interfaces:**
- Produces: `createImportJob`, `buildImportPreview`, `saveImportProfile`.

- [ ] **Step 1: Write failing overwrite-protection test**

```ts
it("marks an existing-match row for a user decision instead of overwriting", async () => {
  const preview = await service.buildImportPreview(jobId, mapping);
  expect(preview.rows[0]).toMatchObject({
    status: "CONFLICT",
    allowedActions: expect.arrayContaining(["SKIP", "MERGE", "CREATE_SEPARATE"])
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/imports/import-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement models**

Add `ImportJob`, `ImportRow`, `ImportMappingProfile`, source checksum, locale, status, progress, row errors, conflict resolution. Persist source row number and stable row idempotency key.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name import_jobs
pnpm vitest run packages/domain/src/imports
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/imports packages/contracts/src/imports.ts
git commit -m "feat: add staged import jobs and profiles"
```

---

### Task 2: Add bounded CSV/XLSX parsing worker

**Files:**
- Create: `apps/worker/src/jobs/parse-import.ts`
- Create: `apps/worker/src/jobs/parse-import.test.ts`
- Modify: `packages/config/src/server.ts`

**Interfaces:**
- Consumes: uploaded source asset + import job.
- Produces: parsed preview rows/errors.

- [ ] **Step 1: Write failing row-limit and formula tests**

```ts
it("fails a workbook over the configured row limit", async () => {
  await expect(handler({ jobId: hugeJobId }))
    .rejects.toMatchObject({ code: "IMPORT_ROW_LIMIT_EXCEEDED" });
});

it("reads formula cells as stored values and never evaluates them", async () => {
  const result = await parseWorkbook(formulaFixture);
  expect(result.rows[0].dangerousCell).not.toContain("EXECUTED");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/parse-import.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement bounded parser**

Add `IMPORT_MAX_BYTES` and `IMPORT_MAX_ROWS` config. Stream CSV. For XLSX, reject macro-enabled formats, ignore formulas as executable logic, and persist preview rows in chunks.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/worker/src/jobs/parse-import.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/parse-import.ts apps/worker/src/jobs/parse-import.test.ts packages/config
git commit -m "feat: parse bounded CSV and XLSX imports"
```

---

### Task 3: Commit imports idempotently with row decisions

**Files:**
- Create: `apps/worker/src/jobs/commit-import.ts`
- Create: `apps/worker/src/jobs/commit-import.test.ts`

**Interfaces:**
- Consumes: approved preview + row resolutions.
- Produces: created/merged/skipped item results.

- [ ] **Step 1: Write failing retry test**

```ts
it("does not create a second item when the same commit job is retried", async () => {
  await handler({ jobId });
  await handler({ jobId });
  expect(await itemRepo.countByImportRow(jobId, "row-1")).toBe(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/commit-import.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement transaction/chunk commit**

Each row has stable idempotency identity. Apply `CREATE`, `SKIP`, `MERGE`, or `CREATE_SEPARATE`. Update job progress after each chunk and retain row-level result.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/worker/src/jobs/commit-import.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/commit-import.ts apps/worker/src/jobs/commit-import.test.ts
git commit -m "feat: commit imports idempotently"
```

---

### Task 4: Add CSV/XLSX export jobs

**Files:**
- Create: `packages/domain/src/exports/export-service.ts`
- Create: `apps/worker/src/jobs/build-tabular-export.ts`
- Create: `apps/worker/src/jobs/build-tabular-export.test.ts`
- Create: `packages/contracts/src/exports.ts`

**Interfaces:**
- Produces: `requestExport(actor, scope, format)`, output media asset.

- [ ] **Step 1: Write failing scope/privacy test**

```ts
it("does not export inaccessible items or private document bytes", async () => {
  const rows = await buildRows(otherViewer, scope);
  expect(rows.map(r => r.itemId)).not.toContain(privateItemId);
  expect(rows[0]).not.toHaveProperty("privateDocument");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/build-tabular-export.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement export**

Support collection, subtree, filtered search, full authorized inventory, and wishlist later when model exists. CSV and XLSX use localized display labels but canonical raw data values.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/exports apps/worker/src/jobs/build-tabular-export.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/exports packages/contracts/src/exports.ts apps/worker/src/jobs/build-tabular-export*
git commit -m "feat: add CSV and XLSX exports"
```

---

### Task 5: Add insurance data and private-by-default rules

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/insurance/insurance-service.ts`
- Create: `packages/domain/src/insurance/insurance-service.test.ts`

**Interfaces:**
- Produces: `setCollectionInsurance`, `setItemInsurance`, `getInsuranceData`.

- [ ] **Step 1: Write failing privacy test**

```ts
it("does not expose policy reference in public item data", async () => {
  const publicDto = await itemQuery.getPublicItem(itemId);
  expect(publicDto).not.toHaveProperty("policyReference");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/insurance/insurance-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement insurance model**

Store insured amount minor/currency, valuation date, insurer, policy reference, notes, collection/item linkage. Access requires explicit owner/editor policy as defined; public API projections exclude it.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name insurance
pnpm vitest run packages/domain/src/insurance
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/insurance
git commit -m "feat: add private insurance records"
```

---

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
