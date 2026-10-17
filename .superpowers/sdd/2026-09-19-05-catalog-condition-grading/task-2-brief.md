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

