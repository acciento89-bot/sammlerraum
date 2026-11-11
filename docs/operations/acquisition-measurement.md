# Sammlerraum acquisition measurement

Landing: `/de/sammlung-verwalten`, English `/en/collection-manager`.
Campaign marker: `utm_campaign=sammlerraum-search-30-20261112`.
Google Ads account912-970-4193, public tagAW-18427442933; confirmed registration destination d7UmCMe20LYdEPXt8dJE is primary; first item Wb_6CMq20LYdEPXt8dJE is secondary. These are public browser identifiers, not credentials. Enhanced conversions and personalized advertising remain off.

Optional basic consent: no Google tag/network or stored campaign association before explicit opt-in. Equal decline and accept; footer opens preferences; withdrawal reloads to remove runtime, clears local attribution and accessible `_gcl` cookies. Cross-tab choice changes reload; consent checked again after async boundaries and before events. Expired choice fails closed. Local choice/attribution expire30days. Never transmit email/name/raw userID, item titles, auth query strings or private URLs. Only fixed public page path and validated advertising click IDs may enter tag config; actual conversion transaction ID is HMAC-derived on server.

GET `/api/v1/acquisition/status?started=<millisecond timestamp>` requires a current authenticated cookie session. Live DB determines verification, account creation and actual first nondeleted item. Preexisting/internal/role-granted accounts excluded. Start bounded to30days and campaign rollout. Response exposes only event kind and opaque transactionID, no account/collection payload. Private no-store; foreign Origin rejected. No schema migration or new privileged access.

Google deduplication uses stable transactionIDs per account/event/campaign. gtag callbacks signify local processing, NOT successful Google receipt. The document suppresses reprocessing; reload/reconnect retries identical IDs so a temporary failure is not a permanent blacklist. Users declining or blocking measurement will be absent from Ads conversion reports; Admin counts include their real registrations. Cross-device email confirmation can lose advertising attribution. Do not infer zero signups from Ads0.

Tests: DE/EN desktop/mobile no-consent and decline flow; actual test-DB cookie-session eligibility and first item; real page tag boundary stubbed (no fake Google conversion), reload dedup/retry and withdrawal; held eligibility response plus second-tab withdrawal. CI gate explicitly requires these browser checks before deployment.

Marketing cap: new Search test maximum€30TOTAL within existing€150authorization. Other DemandGen campaign paused. No daily-budget substitute. Verify saved total, presence-only Germany, German copy, exact/phrase keywords, no search partners/Display/AI Max/URL/text expansion, explicit end date and registration-only primary goal before publication. Record Google moderation/learning status, never promise registrations or pay-only-per-signup.
