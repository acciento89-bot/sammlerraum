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

