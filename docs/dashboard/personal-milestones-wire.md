# Private milestone HTTP boundary

H2 binds the reviewed authored-milestone service to four operations at three routes:

- POST `/api/v1/dashboard/milestones`: create title/date,201.
- POST `/api/v1/dashboard/milestones/query`: list limit/cursor,200.
- PATCH `/api/v1/dashboard/milestones/[id]`: full title/date/expectedRevision replacement,200.
- DELETE the same ID route: expectedRevision,200.

There is no GET/content-query or single-record read endpoint. Unsupported GET is405 at the actual Next route. All supported operations require exact same Origin, then fresh cookie session with disableCookieCache/disableRefresh, then reject URL overrides/fragments/overbound query encoding, then read body and invoke the actual owner-scoped service. Unauthorized requests do not parse private body content. Authenticated list remains explicitly all personal milestones, independent of inventory filters.

One existing lexical/stream decoder now has four additional fixed scalar shapes and their16KiB cap; original five search/reference envelopes and their limits remain unchanged. The small milestone wrapper only translates the existing closed parser error, preserving413. FatalUTF8/BOM/decoded duplicate keys/unknown or nested values/malformedJSON and non-JSON media fail closed. Quoted punctuation remains ordinary title content. Actual stream bytes are counted even when Content-Length is absent or false; oversize cancels the reader. No second permissive JSON parser or dependency was introduced.

Success/error responses are private no-store and carry requestID. Branded invalid400/notfound404/conflict409 remain distinct; dependency503/invariant500 are generic. Errors never interpolate input/title/SQL/owner/cursor values. There is no response-loss rollback guarantee or HTTP create idempotency; H3 must preserve unknown writes and require deliberate inspection rather than replay.

Source tests explicitly distinguish synthetic fresh-auth adapters from actual production-server cookie-authenticated HTTP checks. Six native-backed handler cases use real rows/CAS/privacy/paging/concurrent writes;17 pure route cases establish Origin→auth→URL/body order, cap and sanitized faults;24 new decoder and51 existing decoder cases pass. The larger affected private search/reference/saved/dashboard route gate passes158cases including pure+native. Node server type checks validate parsed response contracts instead of enabling browser globals or asserting untyped JSON.

The actual built Next server additionally passes cookie-authenticated create/list/update/stale/delete/foreign-denial/logout and unsupportedGET checks in the two configured contexts. These are real HTTP checks, not UI gestures or physical mobile tests. Existing156DE/ENdesktop/mobile collector journeys pass unchanged against the same production build. Interactive milestone editing/paging/recovery remains H3. CI explicitly enables the new native route file and HTTP suite; exact remote success is a separate observed gate. No source merge or deployment is implied.
