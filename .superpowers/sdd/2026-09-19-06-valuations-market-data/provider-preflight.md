# Market provider primary-document preflight

Root read-only preparation, checked 2026-10-18 around 00:35 UTC. Phase 06 has no implementation GO yet. This document neither authorizes external calls nor proves any live credential, license or deployment.

## Discovery path

Applied stripe-directory skill first. Existing CLI upgraded 1.53.1→1.54.0 as instructed; directory plugin 0.3.5 already latest. Directory searches succeeded without a login challenge or exposed credentials; this does not independently establish an authenticated payment/provisioning session. Named Scrydex returned []; PriceCharting and two broader collectible-pricing queries returned the adjacent Card Hedge provider, not an exact verified match. No payment/provisioning next action was executed. Retained the already approved providers and read their public primary technical documentation directly. No provider API calls, accounts, subscriptions or messages.

## PriceCharting

Source: [official API documentation](https://www.pricecharting.com/api-documentation).

Current guide values only; no historical prices/sales. Exact product-ID and best-match text lookup differ. Integer pennies; token query parameter `t`; one API call/second, CSV once/ten minutes. Field meanings depend on category: card `manual-only-price` is PSA10.

Public application use requires commercial licensing/written permission. Subscription termination requires purging acquired data. Caching is recommended. These are activation/retention gates; fake HTTP needs no live activation.

Root inference for Tasks 2/3/6: durable poll identity, honest retrieval-time provenance, explicit matching, distributed limiting and token-redacted errors are required. No source sale timestamp is invented; product ID alone cannot identify recurring observations. No terms acceptance is authorized here.

## Scrydex

Sources: [pricing data](https://scrydex.com/docs/getting-started/prices), [authentication](https://scrydex.com/docs/getting-started/authentication), [rate limits](https://scrydex.com/docs/getting-started/rate-limits), [caching](https://scrydex.com/docs/getting-started/best-practices), [Pokémon price history](https://scrydex.com/docs/pokemon/price-history).

Pricing must be explicitly requested with `include=prices`; omission can yield absent/empty prices. Raw records expose condition, flags, currency, low and market; graded records add company/grade and can expose mid/high. Pricing coverage differs by game. Documented USD/JPY prices are not implicitly EUR. Preserve each authored qualifier/metric; do not synthesize an internal condition or currency conversion.

Authentication uses server-side `X-Api-Key` and `X-Team-ID` over HTTPS, with a subscribed account/team. Documentation describes credits, possible overages and a 100-request/second ceiling. Usage reporting can lag 20–30 minutes, so it cannot independently prevent a spend cap overrun. No requests or credentials are needed for fake-HTTP adapters.

Caching guidance distinguishes slowly changing metadata from dynamic prices. Price-history response days have date strings and price arrays qualified by variant/condition/type/flags/currency, with pagination metadata. A daily date is not proof of a precise sale timestamp or individual transaction.

Root inference: decide current-card versus daily-history endpoint deliberately, bound response bytes/pages, preserve day precision and retrieved-at separately, and preserve missing values. Require independent licensing/retention verification before activation; technical caching guidance alone does not prove public redistribution rights. Test malformed amounts, unknown currencies/qualifiers, missing fields, 429/transient retry, secrets redaction and no paid-network default. These are preparation considerations, not unreviewed source requirements or completion claims.

## Remaining gate

Recheck exact endpoint/response and licensing documentation when Task 6 starts; keep primary URLs in adapter documentation. Source observations remain separate from personal estimates and private purchase/grading facts. Explicit operator activation, credentials, budget, entitlement and retention decisions belong to the later production gate. Do not claim live-provider readiness from fake HTTP or this preflight.
