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
