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

