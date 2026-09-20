### Task 4: Add typed custom field definitions and values

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/custom-fields/custom-field-service.ts`
- Create: `packages/domain/src/custom-fields/custom-field-service.test.ts`
- Create: `packages/contracts/src/custom-fields.ts`

**Interfaces:**
- Consumes: collection ID, item ID.
- Produces: `createFieldDefinition`, `setFieldValue`, `validateFieldValue`.

- [ ] **Step 1: Write failing type test**

```ts
it("rejects text supplied to a number field", async () => {
  await expect(service.setFieldValue(itemId, fieldId, "twelve"))
    .rejects.toMatchObject({ code: "CUSTOM_FIELD_TYPE_MISMATCH" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/custom-fields/custom-field-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement typed values**

Field types: `SHORT_TEXT`, `LONG_TEXT`, `INTEGER`, `DECIMAL`, `DATE`, `BOOLEAN`, `SINGLE_SELECT`, `MULTI_SELECT`, `URL`, `MONEY`.

Store canonical typed values in dedicated nullable columns on `CustomFieldValue` plus constraints in service validation; do not serialize every value into one free-form JSON blob.

- [ ] **Step 4: Run tests and migrate**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name custom_fields
pnpm vitest run packages/domain/src/custom-fields
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/custom-fields packages/contracts/src/custom-fields.ts
git commit -m "feat: add typed custom fields"
```

---

