# Catalog moderation operations

Application authority is persisted in `ApplicationRoleGrant`, independently of collection ownership or membership. Only `MODERATOR` and `ADMIN` authorize catalog review, approval, rejection and rollback. The HTTP session supplies the exact BetterAuth user ID; submitted roles, cached client roles and email allowlists have no effect. There is no role HTTP endpoint. Never grant authority based on a user-authored email or profile claim.

## Operator grants and revocation

Use an authenticated database operator connection with independently verified exact account ID and an accountable operator identity. The examples below are parameterized SQL templates, not commands to run against a live account. `$1` is the exact existing BetterAuth user ID (case preserved), `$2` the independently chosen operator identifier, and `$3` the authored grant reason. Parameter values and operator logs must follow deployment access policies.

```sql
BEGIN;
INSERT INTO "ApplicationRoleGrant" ("userId", "role", "grantedBy", "reason")
VALUES ($1, 'MODERATOR', $2, $3)
ON CONFLICT ("userId") DO UPDATE
SET "role" = EXCLUDED."role", "grantedBy" = EXCLUDED."grantedBy",
    "reason" = EXCLUDED."reason", "grantedAt" = CURRENT_TIMESTAMP;
COMMIT;
```

For an independently approved administrator grant, substitute `ADMIN` explicitly. `grantedBy` is at most 200 characters and `reason` at most 1000; both should identify the responsible operator and purpose. This table records current grant metadata; retain operator change logs if a complete grant/revoke event history is required. Do not lock the `user` row or add canonical catalog writes to these grant transactions.

```sql
BEGIN;
DELETE FROM "ApplicationRoleGrant" WHERE "userId" = $1;
COMMIT;
```

Each protected operation reads the existing grant `FOR SHARE` inside its transaction. Ordinary operator `UPDATE`/`DELETE` waits for an already authorized operation to commit. After revocation commits, the next protected operation fails. No extra advisory protocol is required for operators. An absent grant always denies; a grant created concurrently does not retroactively authorize a denied request.

Catalog proposer/moderator/rollback-actor references and current grants restrict account deletion. Deleting an account cannot cascade away canonical provenance, proposal decisions or rollback audit records. Account-erasure workflows must preserve or anonymize the referenced audit identity through a separately designed policy. Revoking a grant removes authority while leaving earlier audit attribution intact.

## Proposals and decisions

Ordinary authenticated users submit and read their own private proposals. Moderator review has separate list/detail routes. Every decision requires a 1–1000-character authored reason; moderator approval of their own proposal is allowed when a real grant exists. There is no automatic translation or external source fetching.

Supported operations are `CREATE_ENTRY`, `UPDATE_ENTRY`, `ADD_VARIANT`, `UPDATE_VARIANT`, `ADD_IDENTIFIER`, `UPDATE_IDENTIFIER` and `REMOVE_IDENTIFIER`. New entries require explicit null target/base and receive a real entry ID/revision 1 only on approval. Existing-target operations require a catalog UUID and positive expected base revision. Corrections use strict canonical inputs; personal ownership, purchase, condition, storage and private-note fields are rejected. Summary is 1–500 characters, with optional authored safe HTTP(S) source/license provenance. A proposal's source is retained as review provenance; the canonical operation's own `sources` fields specify canonical provenance changes.

The decision transaction locks authority, then proposal, then its canonical entry. It invokes the shared canonical mutation seam and records state/result together. Approval of a stale base persists `CONFLICT`, moderator, time and reason before the public wrapper returns HTTP409. Other canonical validation failures roll back and leave `PENDING`. A decided proposal returns HTTP409 on replay; concurrent approvals cannot apply it twice. Rejection does not change canonical data. An enclosing transaction may roll back both proposal and canonical effects; transaction consumers must handle the explicit conflict outcome without throwing until they have committed it.

Rollback requires authoritative moderator access, expected revision, target revision and reason. A real restored content change creates a new monotonic revision; old snapshots remain immutable. **No-op exception:** restoring a byte-equivalent canonical snapshot preserves the current revision and rollback metadata. The separate audit still records actor, authored reason, requested expected/target revisions, result revision and time. CAS is checked first; a stale rollback creates no successful audit.

## Bounds and routes

The fixed initial quotas are 20 pending, 50 submissions per rolling 24 hours and 10,000 retained proposals per user. A transaction advisory lock namespaced to the submitter serializes quota count/insert without locking the account row. History is retained rather than silently expired. These defaults are conservative initial cost/spam policy; changes require explicit product policy review. The public service uses `ReadCommitted`. Custom transaction consumers must also use `ReadCommitted` for submission; the submission seam checks the active transaction isolation and rejects `RepeatableRead`/`Serializable` with `CATALOG_PROPOSAL_ISOLATION_UNSUPPORTED` before quota counts or writes. This prevents an older enclosing snapshot from bypassing capacity after acquiring the quota lock. Submission JSON is bounded to 64KiB UTF-8 both at the HTTP stream and domain serialization boundary. Lists default to 20, max 50, with bounded timestamp/UUID keyset cursors. Nested canonical arrays and texts retain their existing finite limits.

- `POST /api/v1/catalog/proposals`: submit; `GET`: own proposals.
- `GET /api/v1/catalog/proposals/[proposalId]`: own detail, hidden404 for foreign/missing IDs.
- `GET /api/v1/catalog/moderation/proposals` and `/[proposalId]`: moderator review.
- `POST /api/v1/catalog/proposals/[proposalId]/decision`: strict `{decision: "APPROVE" | "REJECT", reason}`.
- `POST /api/v1/catalog/entries/[entryId]/rollback`: strict `{expectedRevision, targetRevision, reason}`.

Lists accept only `state`, `limit`, `cursor`; duplicate/unknown query fields are rejected. Personal and review responses are `no-store`. Mutation Origin must exactly match the configured application origin before body consumption. Sessions disable cookie cache and refresh. Errors use request IDs and redacted standard envelopes. No role grants or external account actions were performed during implementation; PostgreSQL fixtures use synthetic accounts only.
