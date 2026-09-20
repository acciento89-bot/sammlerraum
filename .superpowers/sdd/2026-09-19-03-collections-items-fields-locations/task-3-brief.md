### Task 3: Add structured identifiers and tags

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/items/identifier-service.ts`
- Create: `packages/domain/src/items/tag-service.ts`
- Create: `packages/domain/src/items/identifier-service.test.ts`

**Interfaces:**
- Consumes: item ID.
- Produces: `setItemIdentifiers(itemId, identifiers)`, `setItemTags(itemId, tags)`.

- [ ] **Step 1: Write failing identifier normalization tests**

```ts
it("normalizes EAN values without removing meaningful leading zeroes", async () => {
  const saved = await service.setItemIdentifiers(itemId, [
    { type: "EAN", value: "0123456789012" }
  ]);
  expect(saved[0].value).toBe("0123456789012");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/items/identifier-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement models**

Add `ItemIdentifier(type, value, normalizedValue)`, `Tag`, and item-tag join table. Unique constraints must be scoped to item/type/value, not global across all owners.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/items`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/items
git commit -m "feat: add item identifiers and tags"
```

---

