# Sammlerraum: measurable acquisition test

User explicitly approved implementation, publication and a maximum €30 search test from the existing €150 authorization. Prior campaign stays paused. Questions/design handoff opted out in this conversation.

## Approach
Extend the existing Next.js/Prisma site, existing Google Ads account, current collector visual language. Dedicated German landing page `/de/sammlung-verwalten`, with truthful free-plan limits, actual product examples, obvious registration CTA, no invented social proof. English equivalent for consistency, but campaign targets German-speaking people physically in Germany.

Use basic opt-in Google Ads conversion measurement, no Analytics/remarketing/enhanced conversions. No external Google tag or measurement request before explicit optional consent. Equal accept/decline controls, persistent accessible withdrawal control; declining never blocks registration or use. Do not pass names/emails/collection contents/full private URLs to Google. Update DE/EN privacy text. Campaign marker is fixed and stored only after consent; attribution requires arriving through that marker and a new account. Server checks verified status, account creation time, existing item and exclusion of existing/admin/internal accounts. Stable opaque event IDs deduplicate conversions in Google; browser suppresses repeated events only for the current document after gtag processing callbacks; later document loads/reconnections retry with the same ID because callbacks do not acknowledge Google receipt. No account IDs exposed. Prefer read-only eligibility calculation from existing database over a new schema and retention burden. Registration primary, first item secondary; ordinary pageviews not campaign goals.

## Budget / launch
Search only, Germany presence, German, tightly matched collection-management intent, no Display/search partners, no broad/automatic expansion. Fixed total campaign budget <=€30 and explicit end date; if unavailable, do not substitute an unbounded daily budget. Do not launch before live landing, opt-out/consent checks, eligibility/dedup tests and real tag/goal configuration are verified. Target conversions rather than clicks; no guarantee of registrations or pay-only-per-registration.

## Completion
Meaningful unit/integration/browser tests, exact-source release gates, healthy live deployment and screenshot. Verify campaign saved settings, total cap, goals and status; document Google review/learning status accurately. No real purchases or fake advertising conversions during tests.
