### Task 4: Complete public profile, collection, and item SEO routes

**Files:**
- Modify: `apps/web/src/app/[locale]/@[handle]/page.tsx`
- Modify: `apps/web/src/app/[locale]/@[handle]/[collectionSlug]/page.tsx`
- Create: `apps/web/src/app/[locale]/@[handle]/[collectionSlug]/items/[itemId]/page.tsx`
- Create: `packages/domain/src/seo/public-page-query.ts`
- Create: `packages/domain/src/seo/public-page-query.test.ts`
- Create: `apps/web/e2e/public-indexability.spec.ts`

**Interfaces:**
- Produces `getPublicProfileSeoPage`, `getPublicCollectionSeoPage`, `getPublicItemSeoPage`.
- Each returns authorized public projection + `IndexabilityDecision`.

- [ ] **Step 1: Write failing private-field projection test**

```ts
it("never includes private item fields in SEO projection", async () => {
  const page = await query.getPublicItemSeoPage(handle, collectionSlug, itemId, "de");
  expect(page.item).not.toHaveProperty("privateNotes");
  expect(page.item).not.toHaveProperty("storageLocation");
  expect(page.item).not.toHaveProperty("purchasePrice");
  expect(page.item).not.toHaveProperty("insurance");
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/domain/src/seo/public-page-query.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement public item route**

Render only explicitly public-safe item fields/media. The page exists for human sharing regardless of search opt-in when effective visibility is PUBLIC; metadata uses `noindex` unless the indexability decision is INDEXABLE.

- [ ] **Step 4: Generate safe metadata**

Profile/collection/item metadata uses only:
- public display name/bio;
- public collection title/description;
- public item title/description;
- explicitly public image asset.

If no safe image exists, use branded fallback.

- [ ] **Step 5: Add E2E matrix**

Cover:
- public + opted out → 200 + noindex;
- public + opted in → 200 + index;
- unlisted → only direct allowed path/share behavior, no public SEO route indexing;
- private ancestor → unavailable/noindex;
- moderated content → unavailable/noindex.

- [ ] **Step 6: Run GREEN**

Run:

```bash
pnpm vitest run packages/domain/src/seo
pnpm --filter @sammlerraum/web exec playwright test e2e/public-indexability.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/seo apps/web/src/app/[locale]/@ apps/web/e2e/public-indexability.spec.ts
git commit -m "seo: add privacy-safe public collector pages"
```

---

