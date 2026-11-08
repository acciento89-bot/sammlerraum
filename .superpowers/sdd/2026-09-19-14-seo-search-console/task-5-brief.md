### Task 5: Add curated bilingual collector-category landing pages and crawl-safe public search

**Files:**
- Create: `apps/web/src/seo/category-pages.ts`
- Create: `apps/web/src/seo/category-pages.test.ts`
- Create: `apps/web/src/app/[locale]/collecting/[categorySlug]/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/search/page.tsx`
- Create: `apps/web/src/seo/search-metadata.test.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Produces curated category registry for Trading Cards, Coins, Watches, Vinyl, Comics, Stamps.
- Produces public search metadata with `noindex, follow`.

- [ ] **Step 1: Write failing thin-page/search tests**

```ts
it("defines substantial translated copy for every initial category", () => {
  for (const page of CATEGORY_PAGES) {
    expect(page.de.intro.length).toBeGreaterThan(250);
    expect(page.en.intro.length).toBeGreaterThan(250);
  }
});

it("keeps public/internal search results noindex", () => {
  expect(searchMetadata().robots).toMatchObject({
    index: false,
    follow: true,
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run apps/web/src/seo/category-pages.test.ts apps/web/src/seo/search-metadata.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement curated pages**

Each page contains:
- category-specific title/description;
- useful feature explanation;
- structured feature sections;
- CTA to registration/onboarding;
- links to relevant neighboring category pages.

Do not generate category pages from every database category/tag automatically.

- [ ] **Step 4: Add noindex search/filter metadata**

Any query/filter/sort/pagination search result remains noindex and never enters sitemap.

- [ ] **Step 5: Run GREEN/build**

Run:

```bash
pnpm vitest run apps/web/src/seo
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/seo apps/web/src/app/[locale]/collecting apps/web/src/app/[locale]/\(app\)/search apps/web/messages
git commit -m "seo: add collector category landing pages"
```

---

