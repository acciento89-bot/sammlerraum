# Collections, Items, Custom Fields, and Locations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the core private collection manager: collections, hierarchy, items, quantities, acquisition data, identifiers, tags, custom fields, visibility inheritance, and hierarchical storage locations.

**Architecture:** Collection/item writes go through domain services and Prisma transactions. Collection hierarchy uses adjacency lists plus recursive PostgreSQL queries for ancestry checks. Flexible fields use typed definitions/values rather than unstructured item JSON.

**Tech Stack:** Prisma 7, PostgreSQL 17 recursive CTEs, Zod, Vitest, Next.js REST routes.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Multiple collections and unlimited-depth sub-collections are supported.
- Smart Collections are not implemented in this plan.
- Private ancestor visibility always wins over less restrictive descendants.
- Private notes and exact storage locations are never public by item visibility alone.
- Quantity objects can later be split into individual items.

## Review Focus

1. Moving a node beneath its own descendant must be rejected.
2. Public item inside private collection remains unreadable anonymously.
3. Money/date input is stored canonically, not locale-formatted strings.
4. Duplicate identifiers are allowed when the identifier namespace is not globally unique; uniqueness is scoped intentionally.
5. Custom-field values of the wrong type are rejected before persistence.

---

### Task 1: Add collection and hierarchy models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/collections/collection-service.ts`
- Create: `packages/domain/src/collections/collection-service.test.ts`
- Create: `packages/contracts/src/collections.ts`

**Interfaces:**
- Consumes: authenticated user ID.
- Produces: `createCollection`, `createCollectionNode`, `moveCollectionNode`, `getAncestorVisibility`.

- [x] **Step 1: Write failing cycle test**

```ts
it("rejects moving a node below its own descendant", async () => {
  await expect(service.moveNode(parentId, { parentId: childId }))
    .rejects.toMatchObject({ code: "COLLECTION_HIERARCHY_CYCLE" });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/collections/collection-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Add models and service**

Add enums `Visibility = PRIVATE | UNLISTED | PUBLIC`, models `Collection`, `CollectionNode`, and owner relation. Nodes use `parentId` adjacency. Before moves, execute a recursive CTE that gathers descendants and reject when target parent is among them.

- [x] **Step 4: Run migration and tests**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name collections_hierarchy
pnpm vitest run packages/domain/src/collections/collection-service.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/collections packages/contracts/src/collections.ts
git commit -m "feat: add collection hierarchy"
```

---

### Task 2: Add collectible items, acquisition lifecycle, and quantity splitting

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/items/item-service.ts`
- Create: `packages/domain/src/items/item-service.test.ts`
- Create: `packages/contracts/src/items.ts`

**Interfaces:**
- Consumes: collection membership/ownership, collection node.
- Produces: `createItem`, `updateItem`, `archiveItem`, `splitQuantityItem`.

- [x] **Step 1: Write failing quantity split test**

```ts
it("splits a quantity item without changing total quantity", async () => {
  const result = await service.splitQuantityItem(itemId, 3);
  expect(result.source.quantity + result.created.quantity).toBe(10);
  expect(result.created.id).not.toBe(result.source.id);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/items/item-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Add item model and service**

Add `CollectibleItem` with title, public description, private notes, quantity > 0, acquisition type enum, acquisition date, purchase amount as integer minor units plus ISO currency, visibility, trade status, archived/disposed timestamps.

Splitting runs in one transaction and rejects split counts <= 0 or >= current quantity.

- [x] **Step 4: Run migration and tests**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name collectible_items
pnpm vitest run packages/domain/src/items/item-service.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/items packages/contracts/src/items.ts
git commit -m "feat: add collectible item lifecycle"
```

---

### Task 3: Add structured identifiers and tags

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/items/identifier-service.ts`
- Create: `packages/domain/src/items/tag-service.ts`
- Create: `packages/domain/src/items/identifier-service.test.ts`

**Interfaces:**
- Consumes: item ID.
- Produces: `setItemIdentifiers(itemId, identifiers)`, `setItemTags(itemId, tags)`.

- [x] **Step 1: Write failing identifier normalization tests**

```ts
it("normalizes EAN values without removing meaningful leading zeroes", async () => {
  const saved = await service.setItemIdentifiers(itemId, [
    { type: "EAN", value: "0123456789012" }
  ]);
  expect(saved[0].value).toBe("0123456789012");
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/items/identifier-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement models**

Add `ItemIdentifier(type, value, normalizedValue)`, `Tag`, and item-tag join table. Unique constraints must be scoped to item/type/value, not global across all owners.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/items`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/items
git commit -m "feat: add item identifiers and tags"
```

---

### Task 4: Add typed custom field definitions and values

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/custom-fields/custom-field-service.ts`
- Create: `packages/domain/src/custom-fields/custom-field-service.test.ts`
- Create: `packages/contracts/src/custom-fields.ts`

**Interfaces:**
- Consumes: collection ID, item ID.
- Produces: `createFieldDefinition`, `setFieldValue`, `validateFieldValue`.

- [x] **Step 1: Write failing type test**

```ts
it("rejects text supplied to a number field", async () => {
  await expect(service.setFieldValue(itemId, fieldId, "twelve"))
    .rejects.toMatchObject({ code: "CUSTOM_FIELD_TYPE_MISMATCH" });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/custom-fields/custom-field-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement typed values**

Field types: `SHORT_TEXT`, `LONG_TEXT`, `INTEGER`, `DECIMAL`, `DATE`, `BOOLEAN`, `SINGLE_SELECT`, `MULTI_SELECT`, `URL`, `MONEY`.

Store canonical typed values in dedicated nullable columns on `CustomFieldValue` plus constraints in service validation; do not serialize every value into one free-form JSON blob.

- [x] **Step 4: Run tests and migrate**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name custom_fields
pnpm vitest run packages/domain/src/custom-fields
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/custom-fields packages/contracts/src/custom-fields.ts
git commit -m "feat: add typed custom fields"
```

---

### Task 5: Add hierarchical storage locations and movement history

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/locations/location-service.ts`
- Create: `packages/domain/src/locations/location-service.test.ts`
- Create: `packages/contracts/src/locations.ts`

**Interfaces:**
- Consumes: collection ID/item ID.
- Produces: `createLocation`, `moveLocation`, `assignItemLocation`, `getLocationContents`.

- [x] **Step 1: Write failing privacy and cycle tests**

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

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/locations/location-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement models and service**

Add `StorageLocation` adjacency tree, location type, stable QR token/ID, and `ItemLocationHistory`. Assignment writes both the current foreign key and history record in one transaction.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/locations`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/locations packages/contracts/src/locations.ts
git commit -m "feat: add hierarchical storage locations"
```

---

### Task 6: Add collection/item REST APIs and policy enforcement

**Files:**
- Create: `apps/web/src/app/api/v1/collections/route.ts`
- Create: `apps/web/src/app/api/v1/collections/[collectionId]/nodes/route.ts`
- Create: `apps/web/src/app/api/v1/items/route.ts`
- Create: `apps/web/src/app/api/v1/items/[itemId]/route.ts`
- Modify: `packages/domain/src/authz/policy.ts`
- Create: `apps/web/src/app/api/v1/items/item-api.test.ts`

**Interfaces:**
- Consumes: contracts + domain services + policy engine.
- Produces: collection/item CRUD API.

- [ ] **Step 1: Write failing private-ancestor API test**

```ts
it("returns 404 for anonymous access to a public item under a private ancestor", async () => {
  const response = await requestItemAsAnonymous(itemWithPrivateAncestor.id);
  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/src/app/api/v1/items/item-api.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement thin routes and policy facts**

Routes validate Zod contracts, load actor/resource facts, call `assertAuthorized`, then call domain services. For unauthorized private resources, return 404 rather than confirming existence.

- [ ] **Step 4: Run API and domain tests**

Run:
```bash
pnpm vitest run packages/domain/src/collections packages/domain/src/items packages/domain/src/custom-fields packages/domain/src/locations apps/web/src/app/api/v1/items
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1 packages/domain/src/authz
git commit -m "feat: expose collection and item APIs"
```

---

### Task 7: Add responsive collection and item management UI

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/collections/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/collections/[collectionId]/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/items/new/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/items/[itemId]/page.tsx`
- Create: `apps/web/src/components/items/item-form.tsx`
- Create: `apps/web/src/components/items/code-scanner.tsx`
- Create: `apps/web/e2e/collections-items.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: collection/item/custom-field/location APIs.
- Produces: mobile/desktop flows to create hierarchy, add/edit/archive items, manage identifiers/tags/custom fields, assign locations, and capture codes.

- [ ] **Step 1: Write failing E2E flow**

```ts
test("collector creates a nested collection and item with custom field and location", async ({ page }) => {
  await loginSeedUser(page, "de");
  await createCollectionInUi(page, "Pokémon");
  await createSubcollectionInUi(page, "Base Set");
  await createCustomFieldInUi(page, "Edition", "SHORT_TEXT");
  await createLocationInUi(page, ["Wohnzimmer", "Vitrine", "Fach 2"]);
  await createItemInUi(page, { title: "Glurak", edition: "1st", location: "Fach 2" });
  await expect(page.getByText("Glurak")).toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/collections-items.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement responsive UI**

Use accessible tree/navigation controls, explicit visibility selector, separate public description/private notes, canonical money/date inputs, and progressive disclosure for advanced fields.

`code-scanner.tsx` uses the browser `BarcodeDetector` API when available and always exposes manual EAN/UPC/ISBN entry as fallback. Scanner output is only an identifier proposal until the user confirms it.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/collections-items.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS in mobile and desktop projects.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add collection and item management UI"
```

---

### Task 8: Add printable storage labels and scan-to-location flow

**Files:**
- Create: `packages/domain/src/locations/label-service.ts`
- Create: `packages/domain/src/locations/label-service.test.ts`
- Create: `apps/web/src/app/[locale]/(app)/locations/[locationId]/label/page.tsx`
- Create: `apps/web/src/app/l/[token]/page.tsx`
- Create: `apps/web/e2e/location-labels.spec.ts`

**Interfaces:**
- Consumes: storage locations and stable QR token.
- Produces: printable QR label and scan target that resolves to the authorized location view.

- [ ] **Step 1: Write failing token/privacy test**

```ts
it("resolves a valid label token but never exposes private location contents to an unauthorized actor", async () => {
  const resolved = await service.resolveLabelToken(location.labelToken);
  expect(resolved.locationId).toBe(location.id);
  await expect(service.getLocationContentsForActor(location.id, anonymousActor))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/locations/label-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement labels**

Generate QR content as `${APP_ORIGIN}/l/${token}` using a cryptographically random stable token unrelated to database sequence IDs. Printable view contains QR, human-readable location name, and short internal code; it never prints item values or private notes.

- [ ] **Step 4: Run tests/E2E**

Run:
```bash
pnpm vitest run packages/domain/src/locations/label-service.test.ts
pnpm --filter @sammlerraum/web exec playwright test e2e/location-labels.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/locations apps/web
git commit -m "feat: add printable storage QR labels"
```
