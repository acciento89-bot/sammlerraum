### Task 6: Add factual structured data, safe social previews, and Lighthouse gates

**Files:**
- Create: `apps/web/src/seo/structured-data.ts`
- Create: `apps/web/src/seo/structured-data.test.ts`
- Create: `apps/web/src/components/seo/structured-data.tsx`
- Create: `apps/web/src/app/[locale]/opengraph-image.tsx`
- Create: `apps/web/src/app/[locale]/@[handle]/[collectionSlug]/items/[itemId]/opengraph-image.tsx`
- Create: `lighthouserc.cjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces Organization/WebSite/WebApplication/ProfilePage/CollectionPage/BreadcrumbList builders.
- Produces safe branded/public-media Open Graph image generation.
- Produces `pnpm lighthouse:ci`.

- [ ] **Step 1: Write failing schema truthfulness test**

```ts
it("does not emit fabricated aggregate ratings or product offers for collector items", () => {
  const profileJson = JSON.stringify(profilePageJsonLd(profileFixture));
  const itemJson = JSON.stringify(publicItemJsonLd(itemFixture));

  expect(profileJson).not.toMatch(/aggregateRating|reviewCount|ratingValue/);
  expect(itemJson).not.toMatch(/offers|price|availability/);
});
```

- [ ] **Step 2: Write failing social-preview privacy test**

```ts
it("uses the branded fallback when no explicitly public image exists", async () => {
  const model = await buildItemOgModel(privateImageItemId);
  expect(model.imageKind).toBe("BRANDED_FALLBACK");
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm vitest run apps/web/src/seo/structured-data.test.ts packages/domain/src/seo
```

Expected: FAIL.

- [ ] **Step 4: Implement schema and preview builders**

Use factual app/company data and public projections only. Ordinary collector items do not use commerce `Product` offers.

- [ ] **Step 5: Install/configure Lighthouse CI**

Run:

```bash
pnpm add -D @lhci/cli
```

Add:

```json
"lighthouse:ci": "lhci autorun"
```

Representative URLs:
- `/de`;
- `/en`;
- `/de/funktionen`;
- `/de/preise`;
- one DE category page;
- one EN category page.

Assertions:
- SEO >= 0.95;
- accessibility >= 0.95;
- best-practices >= 0.95;
- performance >= 0.85.

- [ ] **Step 6: Run GREEN/build/Lighthouse**

Run:

```bash
pnpm vitest run apps/web/src/seo packages/domain/src/seo
pnpm --filter @sammlerraum/web build
pnpm lighthouse:ci
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/seo apps/web/src/components/seo apps/web/src/app lighthouserc.cjs package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "seo: add structured data previews and Lighthouse gate"
```

---

