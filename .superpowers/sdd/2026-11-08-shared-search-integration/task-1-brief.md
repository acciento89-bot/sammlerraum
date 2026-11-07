### Task 1: Reusable canonical bulk read authorization ports

**Files:** Create domain/sharing/share-read-access.ts and search/scoped-read-context.ts with focused native tests; adapt sharing/share-service.ts mechanically to the same canonical helpers. Keep existing grant/PIN behavior intact.

- [ ] TDD allowed member, verified recipient and token grants, wrong target/actor, deleted parents, current creator, durable revocation and PIN/session/expiry over actual source producers.
- [ ] Extract/reuse canonical authorized/unlock/checkPinAccess helpers; provide a callback-scoped trusted context in the caller's bounded transaction with fixed candidate scope, field capabilities and post-consume revalidation. No client-created capabilities.
- [ ] Run original share/membership/authorization regressions and new native cases, types; retain RED/GREEN and commit.

