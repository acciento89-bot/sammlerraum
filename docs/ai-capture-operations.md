# Advisory photo capture

The item editor links to **Photo analysis / Fotoanalyse**. The owner chooses one to four processed gallery photos and explicitly requests analysis. Documents, original filenames, private notes and arbitrary remote image URLs are excluded. Processed photos are decoded and re-encoded without metadata before they are sent.

The result is advisory and does not establish authenticity, price, rarity, condition, grading or provenance. No personal item changes occur while the analysis runs. A separate review lets the owner select title, category, individual visible identifiers and an independent catalog candidate. Manufacturer, series and year require an explicit compatible personal field destination. Existing identifiers are retained. Creating a destination field does not apply its suggestion.

Confirmation checks current item ownership, current selected photo links, the immutable result and an optimistic item/field/catalog baseline in one real audited transaction. A changed baseline must be reloaded and selected again. The final decision is immutable and identical retries do not apply it twice. Rejecting every suggestion preserves the item and its custom values.

## Deployment configuration

Source configuration defaults to **off**. Enabling requires `AI_ANALYSIS_ENABLED=true`, an explicit `AI_OPENAI_API_KEY`, a compatible explicit `AI_OPENAI_MODEL` and a positive `AI_MONTHLY_REQUEST_LIMIT`. There is deliberately no default model, implicit paid activation or production credential in the repository. Activation and deployment are separate operational actions.

The current monthly limit is per requesting owner and reserves one request at admission. A stable request nonce prevents a transport retry from consuming another reservation. Failed or cancelled admitted requests still count. Later billing policy can consume the same usage interface without changing advisory item semantics.

The worker dispatches only an opaque analysis-job UUID. One durable attempt corresponds to one provider call; SDK retries are disabled. Durable transient retries are limited to three attempts. Current ownership, source links and the active claim are rechecked; revoked sources fail permanently. Expired claims can be recovered, and stale workers cannot publish a result. Cancellation invalidates the claim; a still-settling transport is awaited rather than treated as stopped merely because it was aborted.

Provider-reported token counts remain nullable. Append-only reports retain a late response's usage even if its original attempt was abandoned. Unknown counts are not reported as free/zero cost, and this feature does not estimate prices. Usage endpoints are scoped exclusively to the authenticated owner.

## Verification and operation

Native tests use guarded disposable PostgreSQL schemas. The official SDK adapter uses fake HTTP only. Compiled browser tests use a dedicated synthetic opt-in configuration and manually invoke the real worker with a fake provider over owned stored image bytes; they never start a background AI worker or call OpenAI. The CI workflow explicitly runs these checks.

Existing migrations are immutable; changes are additive. Keep private image/job/usage/decision erasure within the existing owner deletion process. Media assets retain their existing restrictive cleanup rules. Test fixtures explicitly remove only their own links, variants and assets before erasing their synthetic users.
