# Search Console and actual SEO launch verification

This is a prepared operational procedure, not a claim of deployment, DNS ownership, Google indexing or completed sitemap processing. The complete V1 remains91tasks. Phase13Task7 and Phase14Task7 require actual authorized production evidence. Finish the one whole SEO source review and exact-source CI first; production/DNS/provider authorization remains separate under the completion ledger.

## Source already covered by automated gates

- Exactly six curated bilingual collecting topics, plus the DE/EN homepage/features/pricing canonical pairs. German pricing is `/de/preise`; the preserved old `/de/pricing` alias is noindex and canonicalizes to it.
- Public collector profiles default to search-engine opt-out. Public human visibility is separate from search consent. Owner-only same-origin/fresh-session controls and a revision comparison prevent a stale tab re-enabling consent after withdrawal. Ordinary profile editing preserves consent.
- Public SEO, community sitemaps and structured data require current opt-in and effective PUBLIC visibility. The existing public-item ancestor/cycle/ownership predicate is reused; private/unlisted/deleted resources are excluded. Moderated comment bodies are not SEO inputs. Public projections exclude private notes, finances, storage locations, documents, original-media keys and login identities.
- All sitemap index and segment responses are dynamic/no-store. Stable p/c/i hash-prefix ranges replace shifting numeric offsets, recursively splitting above10000 candidates. SQL statement/transaction deadlines and a50000-file sitemap-index protocol budget apply. A concurrently oversized segment returns503 until the index is reloaded, never a silently truncated file. Small empty segments can result from conservative ancestor candidate counts; they expose no private resource URLs.
- Curated static pages do not invent a modification date. Community dates come from actual persisted updates. Only canonical preferred-locale UGC URLs enter the sitemap; DE/EN/x-default links identify alternate UI languages for the same public content.
- All UGC social previews use the owned brand fallback without fetching user media. Each curated category has its own deterministic translated PNG. Actual previews are1200×630. JSON-LD uses Organization/WebSite/WebApplication and eligible ProfilePage/CollectionPage/WebPage/BreadcrumbList, without invented offers, prices, ratings or Product claims.
- `pnpm lighthouse:ci` performs three serial mobile measurements on each of six real compiled pages: `/de`, `/en`, `/de/funktionen`, `/de/preise`, `/de/sammeln/muenzen`, `/en/collecting/coins`. Required scores are SEO/A11y/BestPractices≥.95 and Performance≥.85. Reports go only to local filesystem/our repository CI artifact (synthetic public-page evidence only), never temporary public Lighthouse storage. Local results do not claim production performance.

## Prepare the actual production candidate

Follow [the deployment procedure](deploy-portainer.md) and [the release checklist](release-checklist.md). Record the reviewed source, successful exact CI, matching immutable web/worker/migration/PostgreSQL image digests, private real configuration, persistent volume names, proven backup/restore and rollback limits. Verify HTTPS/TLS and the actual configured `APP_ORIGIN`; a working test origin or a certificate for another host is insufficient. Auth account setup and real verification/reset email transport are operational prerequisites, not implied by synthetic tests.

No real provider is activated by these scripts. AI, market ingestion, billing and notification mail retain their explicit initial OFF gates until their separate authorization/rights/budgets/credentials and real delivery proof. Do not lower a source check to disguise missing operational setup.

## Operator-controlled privacy fixtures

After the authorized deployment, deliberately create/use **our own** two verified operator test accounts through the actual application. Never use a customer's profile or change another owner's consent to populate a checklist.

1. Create one profile, public collection and public item with harmless synthetic content. Explicitly opt that profile into search indexing through its real account setting. Record the three actual public-route paths and their visible H1 titles.
2. Use the other owned profile in its default opted-out state; keep it publicly human-viewable. Record its profile path and visible title.
3. Create one private item and one unlisted item in the owned collection. Record their canonical-shaped public item paths; those public routes must return404/410 and must never appear in sitemap locations. Existing authorized direct/share behavior is unchanged.
4. Keep the exact manifest outsideGit in a private location with mode0600. Only paths under `/de/@handle` or `/en/@handle` with valid collection/item UUIDs are accepted. No passwords, cookies, tokens or signed URLs belong in it.

Manifest shape (replace all illustrative identities/titles with the actual **owned** fixtures; these example routes are not live proof):

```json
{
  "ownedFixture": true,
  "optedInProfile": "/de/@release-opted-in",
  "optedInCollection": "/de/@release-opted-in/collection-11111111-1111-4111-8111-111111111111",
  "optedInItem": "/de/@release-opted-in/collection-11111111-1111-4111-8111-111111111111/items/22222222-2222-4222-8222-222222222222",
  "optedOutProfile": "/de/@release-opted-out",
  "privateItem": "/de/@release-opted-in/collection-11111111-1111-4111-8111-111111111111/items/33333333-3333-4333-8333-333333333333",
  "unlistedItem": "/de/@release-opted-in/collection-11111111-1111-4111-8111-111111111111/items/44444444-4444-4444-8444-444444444444",
  "expectedHeadings": {
    "optedInProfile": "Release operator example",
    "optedInCollection": "Public release sample",
    "optedInItem": "Public release sample object",
    "optedOutProfile": "Opted-out release operator example"
  }
}
```

Run `BASE_URL=https://sammlerraum.de bash scripts/verify-seo-production.sh --fixtures /private/operator/seo-fixtures.json --receipt /private/operator/seo-receipt.json`.

This is strictly GET-only: no account creation, login, mail, purchases, consent changes, DNS mutations or indexing requests. It validates real owned HTTPS/final page identity, localized headings, exactly one canonical, reciprocal hreflang, auth-guarded search noindex, actual PNG signature/dimensions, complete registered marketing sitemap entries and controlled public/private fixture states. It fetches all sitemap files within a bounded release-smoke budget (128files/32MiB total/120seconds); a larger or incomplete/unavailable coverage fails explicitly rather than passing a sample as complete. Product sitemap generation has the separate50000-file protocol capacity. Receipts contain check labels/results, never fixture URLs or fetched page bodies. Missing fixture configuration is a failed live gate, not skipped proof.

The manual `production-smoke.yml` workflow runs the same verifier after ordinary public smoke. Its manifest comes only from the preapproved repository secret `SAMMLERRAUM_SEO_FIXTURES_JSON`, written to a0600 temporary file and removed afterwards. Set that secret only after the controlled fixtures and separate account authorization exist; never paste the manifest into workflow parameters or a public report. No schedule/automation is introduced.

The same verifier is also exercised against the real compiled application and owned PostgreSQL fixtures in source CI. A separate guarded test driver maps the owned public origin onto loopback transport; the production CLI has no test-origin bypass. That receipt is explicitly labelled source-only, never a deployed-production pass.

## Domain Property, after separate authorization

1. Open the existing authorized Google Search Console account and select or create the **Domain Property** `sammlerraum.de`. Do not substitute a URL-prefix property and call it domain verification.
2. Obtain Google's current TXT verification value in that account. Keep it outsideGit/chat/CI logs. Do not copy an unrelated token from a different project or claim that merely finding a public TXT record proves ownership.
3. Identify the authoritative DNS zone for the root domain. Preserve existing TXT/SPF/DKIM/DMARC and other records. Add only Google's required root TXT record after the separately authorized change; no registrar/hosting transfer or nameserver replacement.
4. Check propagation, then use Search Console's actual Verify action. Keep the TXT record after verification. Save a redacted ownership receipt: property/account/date/verified status, without the TXT value or credentials.

## Sitemap processing and URL inspections

Only after HTTPS/source/live privacy verification succeeds:

1. Submit `https://sammlerraum.de/sitemap.xml` in that Domain Property. Save actual submitted/processed status and discovered URL counts. Submission alone is not successful processing.
2. Inspect `/de`, `/en`, `/de/sammeln/muenzen` and `/en/collecting/coins`. Record user-declared canonical, Google-selected canonical, last crawl and indexing state. Google may not have selected a canonical before crawling; keep that as pending rather than inventing agreement.
3. Inspect the controlled opted-in public profile/collection/item only after reconfirming their current explicit consent and effective PUBLIC visibility. Record whether Google-selected canonical matches the preferred public locale. Never request indexing for opted-out, private, unlisted, account/search, media/document/API, share/invitation or token URLs.
4. Review Page Indexing, HTTPS, Core Web Vitals, Manual Actions and Security Issues. Newly launched sites may have no field-vitals data; that is not a measured pass or a defect to invent.
5. For withdrawal, confirm fresh noindex and absence from generated sitemaps with the owned fixtures. Explain that third-party engines may take time to remove an earlier indexed result; withdrawal does not make human-public content private. Do not automatically use Google's emergency removal tool for customers.

## Completion evidence

Keep separate dated receipts for reviewed source+exactCI, actual deployment/TLS/auth operation, own-fixture SEO smoke, verified Domain Property, actual sitemap processing and representative inspections. Only actual completed steps may be checked off. Neither local Lighthouse nor private CI can prove a live Portainer deployment or Search Console ownership.
