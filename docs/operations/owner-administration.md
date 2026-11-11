# Private owner administration

`/de/admin` and `/en/admin` show real account totals, email verification, Berlin-calendar registration windows and a paginated directory. The private API is `GET /api/v1/admin/users` with bounded `q`, `page` and `verified=all|yes|no` filters. Metrics include owner/test accounts; they do not prove ad attribution, active use or purchase revenue.

Access requires a current authenticated user, confirmed email in the database and an existing `ApplicationRoleGrant` with role `ADMIN`. `MODERATOR`, unverified, deleted and anonymous accounts are denied. Every request rechecks authority. No credentials, session tokens, private collection content or customer mutation actions are exposed. Do not make this endpoint public or cache its responses at a proxy/CDN.

## Provision the specifically authorized owner

Use the reviewed `scripts/grant-owner-admin.mjs` only from an operator context with the existing private database configuration. It accepts the owner's email as an argument, requires exactly one verified match, locks that identity, and records an audited ADMIN grant. It never creates an account or verifies an email. Do not obtain an owner identity from untrusted query parameters, public signup input or a display name.

The current standalone web image does not include operator tooling. Use the existing private migration/operator environment with reviewed source or apply the equivalent reviewed parameterized transaction through the private database console. Never copy credentials to public artifacts, add a public database port, or grant a browser-visible public role-management route. Follow action-time access confirmation requirements when using a computer UI.

If there is no verified matching account, ask the owner to complete normal signup and verification first; do not fabricate an account/password or bypass verification. After provisioning, sign in normally and open Administration from the workspace menu. Revoke by removing only the specifically authorized user's ApplicationRoleGrant, with deliberate operator authorization; do not delete the user.

## Release evidence

Run `node --test scripts/grant-owner-admin.test.mjs`, both `admin-users` Vitest suites against an isolated `_test` database, the DE/EN `admin-users.spec.ts` desktop/mobile journeys, typecheck/build and the complete mandatory CI gate on the exact release commit. Deploy only after review/gates. Verify anonymous API returns401, ordinary account403, authorized account200, private page and filtering, and current owner grant. Record actual production counts privately, not synthetic fixtures. Keep advertising paused until separately agreed.
