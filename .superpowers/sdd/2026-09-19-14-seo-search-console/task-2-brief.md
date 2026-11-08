### Task 2: Add robots, sitemap index, and bounded marketing/community sitemaps

**Files:**
- Create: `apps/web/src/app/robots.ts`
- Create: `apps/web/src/app/sitemap.ts`
- Create: `apps/web/src/app/sitemaps/community/[page]/route.ts`
- Create: `packages/domain/src/seo/sitemap-service.ts`
- Create: `packages/domain/src/seo/sitemap-service.test.ts`

**Interfaces:**
- Produces `getIndexableCommunityPage(page, pageSize): Promise<IndexablePublicResource[]>`.
- Produces `buildMarketingSitemap(origin): MetadataRoute.Sitemap`.
- Produces community sitemap pages capped at 10,000 URLs per generated segment.

- [ ] **Step 1: Write failing privacy and stale-last-modified tests**

```ts
it("excludes private unlisted and opted-out resources", async () => {
  const rows = await service.getIndexableCommunityPage(0, 100);
  expect(rows.map(row => row.id)).not.toEqual(
    expect.arrayContaining([privateItemId, unlistedItemId, optedOutPublicItemId])
  );
});

it("uses persisted updatedAt rather than request time", async () => {
  const rows = await service.getIndexableCommunityPage(0, 100);
  expect(rows[0].lastModified).toEqual(seedItem.updatedAt);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/domain/src/seo/sitemap-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement robots**

Disallow at minimum:

```text
/api/
/de/app/
/en/app/
/de/login
/en/login
/de/register
/en/register
/de/verify-email
/en/verify-email
/de/forgot-password
/en/forgot-password
/de/reset-password
/en/reset-password
/share/
/invite/
```

Do not rely on robots for authorization.

- [ ] **Step 4: Implement marketing and paged community sitemap generation**

Marketing entries come from the central registry/category registry. Community query requires:
- profile `searchEngineIndexingEnabled = true`;
- effective resource visibility `PUBLIC`;
- no private ancestor;
- not soft deleted;
- not moderation-hidden.

Use cursor/ID-bounded pagination internally and expose deterministic numbered sitemap segments.

- [ ] **Step 5: Run GREEN/build**

Run:

```bash
pnpm vitest run packages/domain/src/seo
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts apps/web/src/app/sitemaps packages/domain/src/seo
git commit -m "seo: add privacy-safe sitemap architecture"
```

---

