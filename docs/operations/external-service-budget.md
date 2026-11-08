# External-service cost activation

The owner's combined allowance is at most EUR25 per UTC calendar month for paid image
analysis and market sources, including fixed fees. Source tests are not provider activation.

Before enabling analysis, set a positive `EXTERNAL_MONTHLY_BUDGET_EUR_CENTS` no greater
than2500, the **aggregate** `EXTERNAL_FIXED_MONTHLY_EUR_CENTS` for all enabled sources,
and `AI_CALL_RESERVATION_EUR_CENTS`. The reservation must cover the documented worst-case
cost of the exact pinned model and bounded request (image/text inputs, maximum output,
taxes and conservative exchange-rate margin). Revalidate the quote before changing the
model, input/output bounds, tariff or provider. Do not describe reservations as actual invoices.
The approved envelope is a maximum, not an obligation to spend it.

The worker reserves the full amount in PostgreSQL immediately before each HTTP attempt.
All provider identities share a locked monthly row. Concurrent calls cannot over-admit;
duplicate attempt tokens cannot authorize another call. A restart cannot raise an existing
month's ceiling or forget fixed fees. Unknown outcomes, errors and user/content erasure do
not refund a potentially charged attempt. Only an opaque hash and aggregate financial fields
are stored, without user, image, item or job identifiers. The normal per-user quota remains a
separate check. Exhaustion ends an analysis with `AI_LIMIT_REACHED` before provider I/O.

The fence bounds admitted **reservations**, so live activation additionally requires verified
cost upper bounds, an own provider credential used only through this worker, and a real
authorized provider response. Do not enable another paid adapter until it uses the same
reservation mechanism and its fixed/per-call fees fit the remaining envelope. Current
Scrydex and PriceCharting paid sources remain disabled; no subscription has been purchased.
Do not silently increase the budget or substitute fabricated market prices.


## Initial own OpenAI activation quote (8November2026)

Pinned model: `gpt-5.4-mini-2026-03-17`, verified against the official model page
https://developers.openai.com/api/docs/models/gpt-5.4-mini and image-token rules
https://developers.openai.com/api/docs/guides/images-vision . Standard global input
USD0.75/million, outputUSD4.50/million. No regional uplift, tools or fixed paid
subscription is enabled. `detail:high` is bounded at2500patches per image with a
1.2multiplier (allow one rounding token); at most4images therefore <=12004image
tokens even if processing upstream changes the current640px outputs. Bounded
categories (100x64ASCII),20candidate titles (200Unicode characters each), IDs,
JSON framing, fixed instruction and wire schema fit conservatively below48000
text tokens; total conservative input bound60000tokens. Maximum output8192.
Thus upper standard charge <=60000*0.75/1e6+8192*4.5/1e6 = USD0.081864.

Reserve EUR0.25 before each attempt. At an intentionally conservative conversion
allowance of EUR2 perUSD and25%additional tax/fee headroom, the boundEUR0.20466
remains below the reservation. Stop/requote before any tariff/model/input/output
change, a conversion rate above that allowance or additional fixed fees. This
calculation is admission headroom, not the actual provider invoice or liveFXquote.
November includes EUR0.25fixed aggregate reservation for the one own synthetic
operator probe (552input/112output), so at most99additional25centattempts fit.
Future months have zero current subscription fees but retain configured fixed
headroom conservatively until deliberately re-evaluated. No real user photographs
were used for this probe. The key is restricted to Responses and stored only in
protected operator/backend configuration, never client code. Actual worker/user
flow and matching release activation must still be verified independently.

Owner explicitly deferred all paid market-data subscriptions until real users
exist; keep these integrations disabled and omit fabricated live valuations.
