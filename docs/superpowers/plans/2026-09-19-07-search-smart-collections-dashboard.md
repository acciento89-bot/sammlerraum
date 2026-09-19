# Search, Smart Collections, and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scalable item search, typed combinable filters, saved Smart Collections, and the collector dashboard/analytics required by V1.

**Architecture:** Search/filter requests compile from a validated filter AST to Prisma/PostgreSQL predicates. Smart Collections persist that AST, never item copies. Dashboard metrics use dedicated query services and never mix currencies implicitly.

**Tech Stack:** PostgreSQL 17, Prisma 7, Zod discriminated unions, Vitest, Next.js.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Filter definitions are structured, versioned data, not arbitrary SQL or free-form query strings.
- Search never returns items the actor cannot view.
- Smart Collections contain no duplicated item rows.
- Large/complex filters have bounded depth and clause count.
- Dashboard values remain separated by currency/source where aggregation is unsafe.

## Review Focus

1. Malicious filter JSON must not become raw SQL.
2. Deeply nested filter trees must be rejected at the configured complexity limit.
3. Search result counts must honor visibility exactly like returned rows.
4. Smart Collection membership changes automatically when item data changes.
5. Dashboard totals must not mix currencies or hidden items.

---

### Task 1: Define typed filter AST and complexity limits

**Files:**
- Create: `packages/contracts/src/search.ts`
- Create: `packages/domain/src/search/filter-ast.ts`
- Create: `packages/domain/src/search/filter-ast.test.ts`

**Interfaces:**
- Produces: `ItemFilterSchema`, `validateFilterComplexity(filter)`.

- [ ] **Step 1: Write failing complexity tests**

```ts
it("rejects filter trees deeper than five logical levels", () => {
  expect(() => validateFilterComplexity(deepFilter(6)))
    .toThrowError(/FILTER_TOO_COMPLEX/);
});

it("rejects more than fifty leaf clauses", () => {
  expect(() => validateFilterComplexity(andOf(51)))
    .toThrowError(/FILTER_TOO_COMPLEX/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/search/filter-ast.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement discriminated union**

Support logical `and/or/not` and field predicates for category, manufacturer, year, condition, grading, money ranges, tags, duplicate flag, trade status, visibility, media/doc presence, created/updated dates, and custom fields.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/search/filter-ast.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/search.ts packages/domain/src/search
git commit -m "feat: define typed item filter language"
```

---

### Task 2: Compile filters to authorized database queries

**Files:**
- Create: `packages/domain/src/search/item-search-service.ts`
- Create: `packages/domain/src/search/item-search-service.test.ts`
- Create: `apps/web/src/app/api/v1/search/items/route.ts`

**Interfaces:**
- Produces: `searchItems(actor, query): Promise<SearchPage<ItemSummary>>`.

- [ ] **Step 1: Write failing hidden-count test**

```ts
it("does not include private inaccessible items in rows or total count", async () => {
  const result = await service.searchItems(otherUser, { text: "watch", filter: null });
  expect(result.items.map(x => x.id)).not.toContain(privateItemId);
  expect(result.total).toBe(result.items.length);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/search/item-search-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement query compilation**

Compile validated AST to Prisma predicates and safe raw SQL only where required for recursive visibility/text search. No client string is concatenated into SQL. Use cursor pagination.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/search`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/search apps/web/src/app/api/v1/search
git commit -m "feat: add authorized item search"
```

---

### Task 3: Add Smart Collections

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/search/smart-collection-service.ts`
- Create: `packages/domain/src/search/smart-collection-service.test.ts`
- Create: `apps/web/src/app/api/v1/smart-collections/route.ts`

**Interfaces:**
- Produces: `createSmartCollection`, `updateSmartCollection`, `resolveSmartCollectionItems`.

- [ ] **Step 1: Write failing dynamic-membership test**

```ts
it("reflects item changes without storing membership rows", async () => {
  const smart = await service.createSmartCollection(actor, filterForTag("signed"));
  expect((await service.resolveSmartCollectionItems(smart.id)).items).toHaveLength(0);
  await tagService.setItemTags(itemId, ["signed"]);
  expect((await service.resolveSmartCollectionItems(smart.id)).items.map(x => x.id)).toContain(itemId);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/search/smart-collection-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement versioned saved AST**

Persist `filterVersion` and validated JSON representation of the typed AST. Do not create item membership join rows.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name smart_collections
pnpm vitest run packages/domain/src/search
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/search apps/web/src/app/api/v1/smart-collections
git commit -m "feat: add dynamic smart collections"
```

---

### Task 4: Add dashboard query service

**Files:**
- Create: `packages/domain/src/dashboard/dashboard-service.ts`
- Create: `packages/domain/src/dashboard/dashboard-service.test.ts`
- Create: `packages/contracts/src/dashboard.ts`

**Interfaces:**
- Produces: `getDashboard(actor, scope): Promise<DashboardData>`.

- [ ] **Step 1: Write failing currency/privacy tests**

```ts
it("groups monetary totals by currency instead of mixing them", async () => {
  const data = await service.getDashboard(actor, {});
  expect(data.purchaseTotals).toEqual([
    { currency: "EUR", amountMinor: expect.any(BigInt) },
    { currency: "USD", amountMinor: expect.any(BigInt) }
  ]);
});

it("excludes inaccessible shared/private items", async () => {
  const data = await service.getDashboard(actor, {});
  expect(data.itemCount).toBe(expectedVisibleOwnedAndSharedCount);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/dashboard/dashboard-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement dashboard metrics**

Return item/collection counts, purchase totals by currency, latest manual/external values by currency/source, duplicates, wishlist counts when available later, trade statuses, top collections/items, recent additions, condition/grading distribution, missing-data counts.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/dashboard`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/dashboard packages/contracts/src/dashboard.ts
git commit -m "feat: add collector dashboard queries"
```

---

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
