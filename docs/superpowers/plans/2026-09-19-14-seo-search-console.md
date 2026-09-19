# Sammlerraum SEO and Search Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sammlerraum technical SEO, privacy-safe public community indexing, bilingual category landing pages, structured data, social previews, Lighthouse gates, and Google Search Console onboarding.

**Architecture:** A central SEO registry defines indexable marketing routes and curated category pages. Public user-generated pages use an explicit profile-level search-engine opt-in and current effective visibility before becoming indexable or entering community sitemaps. Sitemap generation, page metadata, structured data, and production smoke checks all consume the same indexability rules so privacy cannot drift between subsystems.

**Tech Stack:** Next.js 16 metadata APIs, next-intl, Prisma 7, Zod, Vitest, Playwright, Lighthouse CI, Google Search Console operational runbook.

**Spec:** `docs/superpowers/specs/2026-09-19-seo-search-console-design.md`

## Global Constraints

- Search-engine indexing of public user-generated content is opt-in and defaults off.
- PRIVATE and UNLISTED content never becomes indexable.
- Share/invitation/auth/media/document/API URLs never enter sitemaps.
- Search/filter result URLs are noindex and do not create crawl traps.
- DE/EN canonical and hreflang relationships are reciprocal.
- SEO metadata may use only fields already authorized for public display.
- No private image may be used in public social previews.
- No fabricated ratings, reviews, prices, availability, awards, or seller claims.
- Search Console verification tokens remain outside Git.
- No analytics/ad tracking provider is introduced for SEO.

## Review Focus

1. A public item under a private ancestor must remain noindex and absent from sitemaps.
2. Turning profile search-engine indexing off must immediately remove all owned public UGC from generated sitemaps.
3. Search/filter query combinations must not create unbounded indexable URLs.
4. Open Graph generation must fall back to branded media when the item's image is private/unlisted.
5. Sitemap pagination must remain stable and bounded when public UGC grows to large volumes.

---

### Task 1: Add central marketing SEO registry and bilingual metadata

**Files:**
- Create: `apps/web/src/seo/public-pages.ts`
- Create: `apps/web/src/seo/public-pages.test.ts`
- Create: `apps/web/src/seo/page-metadata.ts`
- Create: `apps/web/src/seo/page-metadata.test.ts`
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Create: `apps/web/src/app/[locale]/features/page.tsx`
- Create: `apps/web/src/app/[locale]/pricing/page.tsx`

**Interfaces:**
- Produces `PUBLIC_MARKETING_PAGES`.
- Produces `marketingMetadata(pageKey, locale): Metadata`.

- [ ] **Step 1: Write failing reciprocal metadata tests**

```ts
import { describe, expect, it } from "vitest";
import { marketingMetadata } from "./page-metadata";

describe("marketingMetadata", () => {
  it("builds reciprocal German and English alternates for pricing", () => {
    const de = marketingMetadata("pricing", "de");
    const en = marketingMetadata("pricing", "en");

    expect(de.alternates).toMatchObject({
      canonical: "/de/preise",
      languages: {
        "de-DE": "/de/preise",
        en: "/en/pricing",
        "x-default": "/de/preise",
      },
    });

    expect(en.alternates).toMatchObject({
      canonical: "/en/pricing",
      languages: {
        "de-DE": "/de/preise",
        en: "/en/pricing",
        "x-default": "/de/preise",
      },
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run apps/web/src/seo/page-metadata.test.ts`  
Expected: FAIL because the SEO registry does not exist.

- [ ] **Step 3: Implement the marketing route registry**

Use stable route keys and translated slugs:

```ts
export const PUBLIC_MARKETING_PAGES = {
  home: { de: "/de", en: "/en" },
  features: { de: "/de/funktionen", en: "/en/features" },
  pricing: { de: "/de/preise", en: "/en/pricing" },
} as const;
```

The German/English visible pages use translation keys from the existing `next-intl` setup.

- [ ] **Step 4: Implement metadata builder**

Return exact title, description, canonical, reciprocal language alternatives, Open Graph and Twitter metadata from one typed registry. Use absolute URLs only after combining with configured `APP_ORIGIN`.

- [ ] **Step 5: Run GREEN/build**

Run:

```bash
pnpm vitest run apps/web/src/seo/public-pages.test.ts apps/web/src/seo/page-metadata.test.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/seo apps/web/src/app
git commit -m "seo: add bilingual marketing metadata"
```

---

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

### Task 3: Add search-engine indexing preference for public profiles

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/seo/indexability.ts`
- Create: `packages/domain/src/seo/indexability.test.ts`
- Modify: `packages/domain/src/identity/profile-service.ts`
- Create: `apps/web/src/components/profile/search-indexing-control.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/account/profile/page.tsx`

**Interfaces:**
- Adds `UserProfile.searchEngineIndexingEnabled Boolean @default(false)`.
- Produces `getPublicIndexability(resource, ancestors, profile): IndexabilityDecision`.

- [ ] **Step 1: Write failing ancestor/opt-in tests**

```ts
it("defaults a public profile to noindex until the owner opts in", () => {
  expect(getPublicIndexability(publicProfileFixture, [], {
    searchEngineIndexingEnabled: false,
  })).toEqual({ index: false, reason: "PROFILE_OPT_OUT" });
});

it("never indexes a public child below a private ancestor", () => {
  expect(getPublicIndexability(publicItemFixture, [{ visibility: "PRIVATE" }], {
    searchEngineIndexingEnabled: true,
  })).toEqual({ index: false, reason: "PRIVATE_ANCESTOR" });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/domain/src/seo/indexability.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Add the schema field and migration**

Run after implementation:

```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name public_search_indexing_preference
```

Default every existing/new profile to false.

- [ ] **Step 4: Implement indexability decision**

Reasons include:
- `PROFILE_OPT_OUT`;
- `RESOURCE_NOT_PUBLIC`;
- `PRIVATE_ANCESTOR`;
- `MODERATION_HIDDEN`;
- `SOFT_DELETED`;
- `INDEXABLE`.

The decision is derived server-side and reused by page metadata and sitemap queries.

- [ ] **Step 5: Add explicit profile setting UI**

Copy must explain that public Sammlerraum visibility and Google/Bing indexing are separate. Turning indexing off does not make already-public content private.

- [ ] **Step 6: Run GREEN/build**

Run:

```bash
pnpm vitest run packages/domain/src/seo packages/domain/src/identity
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db packages/domain/src/seo packages/domain/src/identity apps/web/src/components/profile apps/web/src/app/[locale]/\(app\)/account/profile
git commit -m "feat: add public search-engine indexing preference"
```

---

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

### Task 7: Add Search Console runbook and production SEO verification

**Files:**
- Create: `docs/operations/google-search-console.md`
- Create: `scripts/verify-seo-production.sh`
- Modify: `docs/operations/release-checklist.md`
- Modify: `.github/workflows/production-smoke.yml`

**Interfaces:**
- Produces reproducible Search Console setup steps.
- Produces read-only `verify-seo-production.sh`.

- [ ] **Step 1: Document Search Console Domain Property setup**

Use:

```text
sammlerraum.de
```

Procedure:
1. create/select the Domain Property in Google Search Console;
2. copy Google's DNS TXT verification value;
3. add it at the DNS provider for the root domain;
4. verify the property;
5. keep the DNS verification record;
6. never commit the TXT token to Git.

- [ ] **Step 2: Document sitemap submission and representative inspections**

Submit:

```text
https://sammlerraum.de/sitemap.xml
```

Inspect:
- `https://sammlerraum.de/de`;
- `https://sammlerraum.de/en`;
- one DE category page;
- one EN category page;
- one opted-in public profile;
- one opted-in public collection/item after community data exists.

Record whether Google-selected canonical matches Sammlerraum canonical.

- [ ] **Step 3: Implement production verifier**

`scripts/verify-seo-production.sh` checks:
- robots and sitemap return 200;
- sitemap excludes app/auth/share/token/API URLs;
- DE/EN marketing pages have expected canonical/hreflang;
- public search is noindex;
- test opted-out public profile is noindex;
- test opted-in public profile is indexable;
- Open Graph image endpoint returns image content;
- no private/unlisted fixture URL appears in sitemap.

- [ ] **Step 4: Add SEO verifier to production smoke**

Run it only read-only after deployment.

- [ ] **Step 5: Run after production deploy**

Run:

```bash
BASE_URL=https://sammlerraum.de bash scripts/verify-seo-production.sh
```

Expected: PASS.

Search Console DNS verification/sitemap submission remain explicit account-owner operations and must be checked off separately.

- [ ] **Step 6: Commit**

```bash
git add docs/operations/google-search-console.md scripts/verify-seo-production.sh docs/operations/release-checklist.md .github/workflows/production-smoke.yml
git commit -m "ops: add Search Console and SEO verification"
```
