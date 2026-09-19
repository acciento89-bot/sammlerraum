# Catalog, Condition, and Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement category templates, the global reference catalog, variants, external identifiers, revision history, moderated catalog proposals, category-specific condition schemas, and grading records.

**Architecture:** Catalog data is globally shared but versioned and moderated. Personal items may optionally reference catalog entries/variants. Condition schemes are category-owned metadata; grading remains a separate item-level fact.

**Tech Stack:** Prisma 7, PostgreSQL 17, Zod, Vitest, Next.js REST routes.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Global catalog data must never absorb personal ownership, price, location, or private notes.
- Personal items remain valid without a catalog link.
- Catalog corrections are proposed and moderated; ordinary users do not mutate canonical rows directly.
- Condition and grading are separate fields.
- Catalog source/license metadata must be retainable.

## Review Focus

1. Two variants with same title but different language/edition must remain distinct.
2. Reject catalog proposals that target a revision that has moved unless conflict is resolved.
3. A deleted catalog entry must not delete personal items; links become nullable or redirected.
4. Condition normalization must not overwrite the displayed domain-specific label.
5. Grading certificate uniqueness is provider-scoped, not globally assumed.

---

### Task 1: Add category templates and typed catalog attributes

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/catalog/category-template-service.ts`
- Create: `packages/domain/src/catalog/category-template-service.test.ts`
- Create: `packages/contracts/src/catalog.ts`

**Interfaces:**
- Produces: `createCategoryTemplate`, `getCategoryTemplate`, typed `CatalogAttributeDefinition`.

- [ ] **Step 1: Write failing schema test**

```ts
it("rejects a catalog attribute value that does not match its definition", async () => {
  await expect(service.validateAttributeValue(numberField, "not-a-number"))
    .rejects.toMatchObject({ code: "CATALOG_ATTRIBUTE_TYPE_MISMATCH" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/catalog/category-template-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Add models and implementation**

Add `CategoryTemplate`, localized template labels, `CatalogAttributeDefinition`, allowed field types matching the custom-field primitive types, and stable language-neutral keys.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name catalog_templates
pnpm vitest run packages/domain/src/catalog/category-template-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/catalog packages/contracts/src/catalog.ts
git commit -m "feat: add category catalog templates"
```

---

### Task 2: Add global catalog entries, variants, identifiers, and revisions

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/catalog/catalog-service.ts`
- Create: `packages/domain/src/catalog/catalog-service.test.ts`

**Interfaces:**
- Produces: `createCatalogEntry`, `addCatalogVariant`, `addExternalIdentifier`, `getCatalogEntryAtRevision`.

- [ ] **Step 1: Write failing variant-distinction test**

```ts
it("keeps language and edition variants separate", async () => {
  const de = await service.addVariant(entryId, { language: "de", edition: "1st" });
  const en = await service.addVariant(entryId, { language: "en", edition: "1st" });
  expect(de.id).not.toBe(en.id);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/catalog/catalog-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement revisioned catalog**

Add `CatalogEntry`, `CatalogVariant`, `CatalogExternalIdentifier`, `CatalogRevision`, source/license metadata, localized text where needed, and immutable revision snapshots for canonical changes.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name global_catalog
pnpm vitest run packages/domain/src/catalog/catalog-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/catalog
git commit -m "feat: add revisioned global catalog"
```

---

### Task 3: Add catalog proposal moderation

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/catalog/proposal-service.ts`
- Create: `packages/domain/src/catalog/proposal-service.test.ts`
- Create: `apps/web/src/app/api/v1/catalog/proposals/route.ts`

**Interfaces:**
- Produces: `submitProposal`, `approveProposal`, `rejectProposal`.

- [ ] **Step 1: Write failing stale-revision test**

```ts
it("does not auto-apply a proposal against a stale base revision", async () => {
  await advanceCatalogRevision(entryId);
  await expect(service.approveProposal(proposalId, moderatorId))
    .rejects.toMatchObject({ code: "CATALOG_PROPOSAL_CONFLICT" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/catalog/proposal-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement proposal states**

States: `PENDING`, `APPROVED`, `REJECTED`, `CONFLICT`. Store proposer, base revision, proposed patch, source note/URL, moderator, moderation time, decision reason.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/catalog/proposal-service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/catalog/proposal-service.ts packages/domain/src/catalog/proposal-service.test.ts apps/web/src/app/api/v1/catalog
git commit -m "feat: add moderated catalog proposals"
```

---

### Task 4: Add condition schemes and normalized quality bands

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/condition/condition-service.ts`
- Create: `packages/domain/src/condition/condition-service.test.ts`

**Interfaces:**
- Produces: `getConditionScheme(categoryId)`, `setItemCondition(itemId, optionId)`.

- [ ] **Step 1: Write failing separation test**

```ts
it("stores exact condition label and optional normalized band separately", async () => {
  const saved = await service.setItemCondition(itemId, vinylVgPlusOption.id);
  expect(saved.conditionOption.labelKey).toBe("vinyl.vg_plus");
  expect(saved.normalizedBand).toBe(4);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/condition/condition-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement condition schemes**

Add `ConditionScheme`, `ConditionOption`, localized label keys, optional normalized band 1–5, ordering, active flag, and item condition relation.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/condition`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/condition
git commit -m "feat: add category condition schemes"
```

---

### Task 5: Add grading records

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/grading/grading-service.ts`
- Create: `packages/domain/src/grading/grading-service.test.ts`

**Interfaces:**
- Produces: `addGrading`, `updateGrading`, `removeGrading`.

- [ ] **Step 1: Write failing provider-scope test**

```ts
it("allows equal certificate numbers across different providers", async () => {
  await service.addGrading(itemA, { provider: "PSA", certificateNo: "123", grade: "10" });
  await expect(service.addGrading(itemB, { provider: "CGC", certificateNo: "123", grade: "10" }))
    .resolves.toBeDefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/grading/grading-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement grading model**

Store provider, grade as normalized string plus optional numeric comparable value, certificate number, graded date, verification URL, and provenance/source.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/grading`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/grading
git commit -m "feat: add external grading records"
```

---

### Task 6: Link items to catalog entries safely

**Files:**
- Modify: `packages/domain/src/items/item-service.ts`
- Create: `packages/domain/src/catalog/item-catalog-link.test.ts`
- Create: `apps/web/src/app/api/v1/catalog/search/route.ts`

**Interfaces:**
- Produces: `linkItemToCatalog(itemId, entryId, variantId?)`, `unlinkItemFromCatalog`.

- [ ] **Step 1: Write failing unlink resilience test**

```ts
it("keeps the personal item when its catalog link is removed", async () => {
  await service.unlinkItemFromCatalog(itemId);
  expect(await itemRepo.get(itemId)).toMatchObject({ id: itemId, catalogEntryId: null });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/catalog/item-catalog-link.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement linking**

Require variant belongs to entry. Catalog IDs remain optional. Do not copy user-private facts into global catalog fields.

- [ ] **Step 4: Run tests and build**

Run:
```bash
pnpm vitest run packages/domain/src/catalog packages/domain/src/condition packages/domain/src/grading
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/items packages/domain/src/catalog apps/web/src/app/api/v1/catalog
git commit -m "feat: link personal items to global catalog"
```

---

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
