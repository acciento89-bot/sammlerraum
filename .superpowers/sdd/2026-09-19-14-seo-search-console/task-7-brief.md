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
