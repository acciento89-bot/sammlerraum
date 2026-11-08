# Shared search integration design

Root implementation decisions under the user's explicit authorization to finish V1 without routine question/approval stops. This is not a claim that the user selected these technical details. Binding: original V1 visibility/share/role and search sections; Phase07 P7.1/P7.7 and its full-acceptance gates; actual Phase09 membership/granular share producers. Original fullPhase07 remains open until this integration is implemented and reviewed.

## Intent and selected approach

Provide real shared searches, counts, saved definitions and dashboard summaries without using another account's identity as a write actor or inferring fields that the reader cannot see. Existing OWNED search behavior/transport remains the default.

Considered: silently broadening OWNED to every membership/share would change existing cursor and privacy semantics; authorizing each item through individual read calls would introduce N+1 and inconsistent counts. Selected: one explicit target per scoped search, backed by a current membership collection or a current granular share. The existing owned search stays unchanged. Targets are selected through their actual workspace/share views; no implicit PUBLIC/global/shared union.

## Canonical authorization and snapshot

Extract the existing share read-access helpers into a reusable server-internal port, retaining existing create/resolve/export/PIN budget behavior. Share authorization is not copied into a second implementation. Reuse actual current collection membership facts for the membership target. Client input contains only a target reference and the strict query; owner IDs, roles, field permissions and SQL are resolved server-side.

A scoped search consumes a callback-scoped trusted read context in the existing bounded RepeatableRead query transaction: live collection/current creator ownership, current membership or exact token/recipient grant, current target subtree/item, permanent revocations, expiry and PIN/session access. Parent/grant locks follow the existing canonical lock order. Recheck current access/expiry after awaited consumption. PIN verification/rate charging uses the existing separate durable preflight; no PIN/hash/bearer token is persisted in search definitions, cursors or QueryStore history. Empty targets do not bypass authorization or field-right checks.

The item set is bulk SQL over the whole authorized target before text/filter/count/page; no per-item authorization loop. A membership explicitly permits private ancestors as its existing workspace does; an explicit share permits only its existing target/subtree. Neither is inferred from PUBLIC visibility. The new scope cannot broaden from a node/item grant to the whole collection. Owned duplicate facts remain private to their actual owner.

## Fields and inference

Walk every AST leaf before matching, including NOT/OR, and authorize its entire field family. Lack of a field grant is whole-query FILTER_UNAVAILABLE, never false/missing/zero or removal of the leaf. Text search uses only fields in that scope's read projection.

- Member basic projection follows actual CollaborativeWorkspaceItemSchema: title/public description, quantity, acquisition date, authored visibility/trade status, updated/lifecycle fields and known collection. Other personal fields require an existing explicit read capability; a role name alone does not imply access to prices, documents, private duplicate relations or metadata not exposed by the workspace.
- Share basic projection follows actual SharedItemSchema: title/public description and quantity. Share-only lifecycle defaults to ALL, because its base projection does not expose archived/disposed state; a more restrictive lifecycle is unavailable without a real grant. Shared pagination orders by disclosed item ID, not a hidden timestamp encoded in an unsigned cursor.
- Share images filter requires images permission. Document presence uses only explicitly granted document-link IDs and the purchase-receipt permission; it never probes unselected private documents. No document grant means unavailable, not a claim that the owner has no documents.
- Personal purchase/manual-value predicates require values permission and the existing complete-scope monetary provenance checks over exactly the authorized target. Preserve stored denominations and missing-versus-zero. External market queries/totals need their own actual redistribution/query rights; values permission or provider registration does not grant these.
- Private duplicate/wishlist relations and other unexposed classification/custom metadata are unavailable in a non-owner shared scope. Keep the existing actual owned capabilities intact. Ownership changes and permanent share retirement never resurrect old capabilities.

References are resolved only within disclosed/authorized scope. Supplying an unshared collection/definition ID must not reveal whether it exists. Predicate/count/page paths and field-right checks use one context; no cheaper count bypass.

## Contracts, saved definitions and summaries

Use a separate strict scoped-search transport so existing OWNED query keys and cursor binding remain unchanged. Scoped results contain only the selected read projection; no owner ID, parent IDs hidden by an item share, role grants, PIN/session material or arbitrary database rows. Bound request/filter/text/page/response sizes to the existing search limits. Scoped cursor binds actor/anonymous capability context, target/current authorization context, normalized query and page size, with only an authorized ID position.

Keep original saved definition v1 as OWNED. Add an explicit scoped v2 definition containing a symbolic membership/share target reference, query and lifecycle, never credentials or a retained permission/result set. Resolve fresh access for each saved request; missing/revoked access is unresolvable, not fallback to OWNED. Token/PIN material is supplied only through current ephemeral access. A token-backed saved definition stores only the share ID and may require reopening the original share link to regain access; saving a query is not saving a bearer credential.

Shared dashboard output has its own strict projection: actual authorized selected item/unit counts, supported distributions and explicitly granted monetary summaries. Owner-only progress and ungranted fields are explicit unavailable/null states, never invented zero totals. The same prepared selection serves rows/counts/saved/dashboard consumers.

## User-facing integration

Reuse current DE/EN responsive workspace and share views for selecting the target and searching it. Reuse AST draft/repair controls with scope capabilities: editable permitted leaves, visible repair/removal for retained unsupported leaves, and no silent removal of a saved condition. Scoped saved entries show their scope and reopen the scoped view rather than feeding a different scope into OWNED history. Access prompts are ephemeral and use the canonical share unlock flow. No secrets in URLs/history beyond the existing original share-link mechanism, no real emails/payments/providers or deployment.

## Proof boundary

Native tests must exercise allowed member/user/token-share queries and denied fields, exact node/item targets, hidden reference probes, PIN budget/session expiry, revocation/transfer/restore, authorization changes during count/page, false/zero/NOT/OR on empty scopes, saved re-resolution and dashboard parity. Retain bounded 1/50/500 scope plans/query counts and zero N+1 behavior. Preserve all existing share, owned-search, money and duplicate regression tests. Root owns serial runtime and source; one final whole-prerequisite review and one consolidated root correction. Existing draft only, no fullPhase07 count until actual completion/review/exact CI.

## Evidence-based schema adjustment during Task3

Actual native scoped-save RED on8November identified the original SmartCollection_definition_check requires definition.version1. The original assumption of no required schema change was wrong. Root adds a separate migration20261108010000_scoped_saved_searches: preserve original v1 checks, retain filterVersion1 and all prior migration bytes, and permit only exact symbolic scoped v2 keys. No PIN/token/session fields are accepted in v2, including nested target keys. Current access remains exclusively runtime authorization; stored UUIDs are not grants. No live database is changed.
