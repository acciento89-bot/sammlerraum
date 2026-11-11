# Sammlerraum owner administration

Requested by the owner to see actual registrations independently of advertising statistics. Implement a read-only DE/EN administration page with total, verified, today and last-seven-day registration counts, searchable paginated users, creation timestamps and verification status. Counts describe accounts, not ad attribution or paying customers. Dates explicitly use Europe/Berlin.

Use the existing ApplicationRoleGrant ADMIN authority, not a second email allowlist. Every request rechecks an authenticated verified database user and current ADMIN grant before querying user data. MODERATOR alone is insufficient. No credentials, session data, private collections or destructive actions are exposed. An operator-only grant command accepts the owner's email, requires exactly one verified match, and records the explicit owner request. No public self-promotion endpoint or automated account creation. No schema migration or new external provider.

Owner address supplied in the conversation is configured privately at operation time; never hard-code personal email in public source. Grant only an existing verified account. If none exists, owner must finish normal registration/verification first. Existing own database and deployment access are reused.

Approaches considered: existing ADMIN grants (chosen to preserve one source of authority); parallel environment email allowlist (rejected as duplicate authorization); third-party administration service (unnecessary disclosure). Implementation details delegated to the developer under the user's repeated request to proceed without further design questions.
