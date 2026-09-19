# Sammlerraum SEO and Search Console Design

**Status:** approved roadmap extension  
**Datum:** 19.09.2026  
**Repository:** `acciento89-bot/sammlerraum`  
**Production:** `https://sammlerraum.de`

---

## 1. Scope

Sammlerraum receives a complete technical SEO and search-engine integration layer in addition to the already approved product/system design.

This area is separate from authentication:

- **SSO** = Google/Apple sign-in and account linking;
- **SEO** = search-engine optimization and discoverability;
- **Google Search Console** = ownership, indexing, canonical, performance and search monitoring.

SSO is already covered by the Identity/Auth plan. This design covers SEO/Search Console.

---

## 2. Indexing model

Sammlerraum contains both public marketing content and user-generated collection content. Search-engine visibility must therefore be explicit.

### Always indexable public site pages

Marketing and informational pages may be indexed:

- German homepage;
- English homepage;
- Features;
- Pricing;
- public category landing pages;
- legal/contact pages where appropriate.

### Never indexable

The following must never be indexed:

- authenticated app routes;
- account/security routes;
- API routes;
- private collections/items;
- unlisted collections/items;
- share-token URLs;
- invitation-token URLs;
- password-reset/verification URLs;
- media/document authorization URLs;
- billing callback/session URLs;
- moderation/admin routes;
- personal calendar/token feeds if added later;
- search/filter URLs that create unbounded crawl spaces.

### Public user-generated pages

A public profile/collection/item is **not automatically search-engine indexable merely because it is publicly viewable**.

Each public profile has an explicit setting:

```text
Allow search engines to index my public collector profile
```

Default: **off**.

When off:
- the public profile remains accessible to humans through Sammlerraum/public links;
- profile, collection and item public pages emit `noindex`;
- they do not appear in Sammlerraum's public sitemap.

When on:
- only content that is effectively `PUBLIC` may become indexable;
- `UNLISTED` and `PRIVATE` content remains noindex regardless of the profile setting;
- moderated/hidden content remains noindex;
- a private ancestor still prevents indexing.

This separates “public in Sammlerraum” from “discoverable by external search engines”.

---

## 3. URL strategy

Marketing URLs use explicit locale prefixes and translated slugs:

```text
/de
/en
/de/funktionen
/en/features
/de/preise
/en/pricing
/de/sammeln/<category-slug>
/en/collecting/<category-slug>
```

Public collector pages remain language-neutral in identity but live below the locale route so chrome/navigation can localize:

```text
/de/@<handle>
/en/@<handle>
/de/@<handle>/<collection-slug>
/en/@<handle>/<collection-slug>
/de/@<handle>/<collection-slug>/items/<item-id>
/en/@<handle>/<collection-slug>/items/<item-id>
```

The canonical for a user-generated page uses the user's preferred public locale if explicitly selected; otherwise German is the x-default. Alternate locale URLs point to the same underlying public resource and only localize UI labels, not user-generated content.

Share-token URLs are never canonical public URLs.

---

## 4. Sitemap architecture

Use separate sitemap groups:

1. **marketing sitemap**
   - home;
   - features;
   - pricing;
   - category landing pages;
   - legal/info pages.

2. **public community sitemap**
   - only opted-in public profiles;
   - only effectively public collections/items belonging to opted-in profiles;
   - excludes blocked/moderated/soft-deleted content;
   - generated in bounded pages/chunks.

The sitemap index:

`https://sammlerraum.de/sitemap.xml`

may reference segmented sitemap files when community content grows.

Do not emit `lastModified = now` on every request. Use actual `updatedAt` only for records/pages where it is meaningful.

---

## 5. Canonicals and hreflang

Every indexable page has exactly one canonical.

Marketing translated pairs have reciprocal:

- `de-DE`;
- `en`;
- `x-default`.

Public profile/collection/item routes may expose DE/EN alternate chrome routes to the same content.

Canonical identity must not change due to:
- tracking parameters;
- filters;
- sort order;
- pagination query parameters;
- share tokens;
- session state.

Search/filter pages are noindex unless a future curated landing-page design explicitly promotes one into an indexable page.

---

## 6. Metadata

Every indexable page has deliberate:

- title;
- meta description;
- canonical;
- robots;
- Open Graph title;
- Open Graph description;
- Open Graph URL;
- Open Graph image;
- Twitter/X card metadata.

For public UGC:
- page title may include public display name, collection name or item title;
- private notes, purchase price, location, insurance data, documents and hidden metadata never enter SEO tags;
- descriptions are derived only from fields already allowed for public display.

---

## 7. Structured data

Marketing pages use factual JSON-LD:

### Organization
- Sammlerraum/Kamilunavo relationship represented accurately;
- URL/logo.

### WebSite
- name;
- URL;
- supported language information.

### SoftwareApplication / WebApplication
- name;
- web application category;
- actual Free/Premium offer information once final pricing exists.

Public community pages may use:
- `ProfilePage` for indexable public profiles;
- `CollectionPage` for indexable collections;
- `BreadcrumbList` for hierarchy/navigation.

Avoid `Product` schema for ordinary personal collectibles unless Sammlerraum later exposes a genuine commerce listing that satisfies Google's product requirements.

Never fabricate:
- ratings;
- review counts;
- availability;
- prices;
- awards;
- seller claims.

---

## 8. Category landing pages

Sammlerraum gains curated, static, bilingual landing pages for major collection categories.

Initial set:

- Trading Cards;
- Coins;
- Watches;
- Vinyl;
- Comics;
- Stamps.

Each page explains relevant Sammlerraum features for that category and links into registration/onboarding.

These are marketing/editorial pages, not automatic dumps of user content.

The category registry is shared with product templates where appropriate but SEO copy remains curated and translated.

Avoid creating thousands of thin/generated pages from every attribute or filter.

---

## 9. Search pages and crawl traps

The internal public search is for users, not for mass search-engine indexing.

Rules:

- public search result pages emit `noindex, follow`;
- filter/sort/query combinations do not enter sitemaps;
- pagination URLs use consistent canonicals;
- empty search pages are noindex;
- crawler access must not cause expensive unbounded queries.

This prevents combinatorial crawl spaces from category/tag/filter combinations.

---

## 10. Social previews

Deterministic social preview images exist for:

- DE homepage;
- EN homepage;
- category landing pages.

For opted-in public profiles/collections/items, social previews may use explicitly public media only.

A private/unlisted image must never be fetched or embedded into a public Open Graph image.

If no safe public media exists, use a branded fallback image.

---

## 11. Performance and Core Web Vitals

Public pages must remain lightweight.

Release checks cover:

- no layout shift from unsized media;
- optimized Next image delivery;
- no unnecessary client JavaScript on static marketing/category pages;
- stable mobile layout;
- semantic headings/landmarks;
- accessible links/forms;
- server-side pagination for public community pages;
- bounded image sizes and variants.

Lighthouse representative targets:

- SEO >= 0.95;
- Accessibility >= 0.95;
- Best Practices >= 0.95;
- Performance >= 0.85.

No analytics/tracking vendor is introduced merely for SEO.

---

## 12. Google Search Console

Use a **Domain Property** for:

`sammlerraum.de`

Verification uses the DNS TXT value supplied by Google Search Console.

The token is never committed to Git.

After verification:

1. submit `https://sammlerraum.de/sitemap.xml`;
2. confirm sitemap processing;
3. inspect `/de` and `/en`;
4. inspect one DE/EN category landing page;
5. once public community content exists, inspect one opted-in public profile and collection;
6. verify Google-selected canonical;
7. review Page Indexing;
8. review Core Web Vitals;
9. review HTTPS;
10. review Manual Actions/Security Issues.

Search Console is monitoring/verification, not a replacement for technical SEO.

---

## 13. Search Console privacy rule

Never request indexing for:
- private content;
- unlisted content;
- token URLs;
- account/auth pages;
- documents/media endpoints;
- public content whose owner has not enabled search-engine indexing.

If a user disables search-engine indexing later:
- the page immediately emits `noindex`;
- it is removed from future sitemap generations;
- Sammlerraum may document that third-party search engines can take time to remove already indexed copies.

---

## 14. Production SEO smoke

After deployment verify:

- robots.txt;
- sitemap index;
- sitemap segments;
- DE/EN canonicals;
- hreflang;
- noindex on app/auth/share/search pages;
- public opted-out profile noindex;
- public opted-in profile indexable;
- unlisted/private item never indexable;
- JSON-LD validity;
- Open Graph images;
- representative Lighthouse checks.

---

## 15. Definition of done

SEO/Search Console is complete when:

- index policy is enforced server-side and tested;
- public UGC indexing is explicit opt-in;
- sitemap(s) contain only allowed canonical pages;
- DE/EN canonical/hreflang metadata is consistent;
- search/filter crawl traps are noindex;
- structured data is factual;
- social previews cannot leak private media;
- curated bilingual category landing pages exist;
- Lighthouse thresholds pass;
- `sammlerraum.de` is verified as a Search Console Domain Property;
- sitemap is submitted successfully;
- representative marketing and opted-in community URLs are inspected successfully.
