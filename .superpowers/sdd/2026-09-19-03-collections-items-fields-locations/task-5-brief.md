### Task 5: Add hierarchical storage locations and movement history

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/locations/location-service.ts`
- Create: `packages/domain/src/locations/location-service.test.ts`
- Create: `packages/contracts/src/locations.ts`

**Interfaces:**
- Consumes: collection ID/item ID.
- Produces: `createLocation`, `moveLocation`, `assignItemLocation`, `getLocationContents`.

- [ ] **Step 1: Write failing privacy and cycle tests**

```ts
it("keeps storage location out of the public item DTO", async () => {
  const dto = await itemQuery.getPublicItem(itemId);
  expect(dto).not.toHaveProperty("storageLocation");
});

it("rejects a storage location hierarchy cycle", async () => {
  await expect(service.moveLocation(roomId, shelfId))
    .rejects.toMatchObject({ code: "LOCATION_HIERARCHY_CYCLE" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/locations/location-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement models and service**

Add `StorageLocation` adjacency tree, location type, stable QR token/ID, and `ItemLocationHistory`. Assignment writes both the current foreign key and history record in one transaction.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/locations`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/locations packages/contracts/src/locations.ts
git commit -m "feat: add hierarchical storage locations"
```

---

