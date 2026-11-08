# M1 — explicit legacy-money contracts and structural historical reads

Source **01c46d139bc0924c03fbdbfea0421b94a2f6ae18**, BASE **09f878b86a2ad63231b63548e0c18ebf506148e2**. One independent read-only review:0Critical/0Important/0Minor, SPEC PASS and QUALITY PASS. Root locally accepts the exact source and the individual boundaries below. Prior H3 dependency gate is complete: both exact09f878b workflows42134716114/job127619819967 and42134711158/job127619803681 SUCCESS,30successful steps each; private receipt `personal-milestones-ui-ci-09f878b.json`. New M1 exact CI follows its authorized feature push.

## Delivered scope and checks

Strict bounded contracts cover fixed subjects, canonical safe raw integers/durable sequences/UUIDs, explicit authoring and intents, private evidence/classification/revocation, decoded token contents, receipts and private views. Exact prospective comma-or-dot/no-grouping parsing uses bigint and the existing165-code authority, with explicit profile/hash/unit identity. RAW mode must match current policy; historical formatting uses supplied scale0..9 without looking up a current exponent. Unsupported declarations are assertion-specific and ineligible. Read/snapshot validators accept structural historical three-letter codes while prospective purchase/custom/catalog validation remains unchanged. No existing amount receives an interpretation, scale or generation.

The authority table literal is byte-identical to BASE, SHA256 `a3bc4d7380a3699858d374a325c47b35b79eca555cb3d1b564433ee1cb933e08`. Only version/original artifact-hash exports are added; valuation parser behavior stays unchanged. New contracts remain browser-safe and use existing Unicode helpers. Source docs explicitly distinguish structural parsing from trusted provenance and current UI behavior.

Pinned Node24.19.0/pnpm10.17.1/external cache/private test environment are used. Initial six named tests all fail behavior assertions against loadable stubs/current old read schema, not missing imports. First focused58PASS includes those6 plus existing52 cases. Expanded boundary run genuinely fails3/28 (wire decimal grammar, raw-unit binding, invalid assertion UUID), then a separate refinement probe fails because out-of-range input throws inside `safeParse`. Corrections use shared canonical IDs, strict grammar/raw-unit/evidence bindings, and guarded exact-format refinements that return validation failure instead of throwing. All original failures remain in `logs/task-m1-20261106-*`.

Final focused **82PASS0skip** =16contract+14policy+2catalog-proposal+50unchanged valuation-money cases. Actual cases include AFN new exponent2 versus explicit historical exponent0, JPY/KWD/CLF/UYW, exact max-safe boundary and one above, rejected rounding/grouping/sign/exponent inputs, strict private evidence/tokens, full entry+variant historical snapshots and unchanged prospective rejection. Final whole regular set **1337PASS/501explicitDBskips**,95passing/43gated files. Whole-workspace types/lint/build all exit0; actual transitive snapshot/item readers compile. No persistence/HTTP/UI implementation change warrants another local DB/browser sweep for this contracts-only milestone; exact CI still exercises its normal full matrix.

Immutable source/build/check and independent review receipts are private in `Artifacts/SammlerraumStatus-20261105/legacy-money-m1-{source-manifest,independent-review}.json`. No production data, provider action, schema migration or automatic classification occurs.

## Individual root adjudication of the ten review boundaries

1. Structural receipt schema alone does not prove authority membership/profile exponent. Accepted only because M2/M3 must revalidate pinned parser/hash/exponent/raw under authorization; no current consumer trusts a parsed receipt as evidence.
2. Structural private view alone does not prove current authority membership or AUTHOR scale. M2 must reject supported-looking nonmembers and machine-profile mismatches before emitting ELIGIBLE. No comparison is enabled by M1.
3. Unsupported UUID is not schema-bound to view.assertionId. M2 must define assertionId as original AUTHOR/CLASSIFY origin and enforce `unsupported:<origin assertion UUID>` through COPY. This identity requirement is retained, not waived.
4. Token shapes do not prove generation/raw/event coherence. M2 must reconstruct the actual fact and compare every field under authorized subject locks.
5. Opaque token syntax does not prove canonical encoding. Bounded canonical base64url decode/roundtrip validation remains mandatory M2.
6. Actual proposal100-path/65536-byte envelope and public projection whitelist remain mandatory M4 seams; no unused speculative adapter is claimed by the private M1 schemas.
7. Exported16KiB is a later streamed HTTP-adapter obligation, not schema transport-memory enforcement.
8. Existing Intl-based v1 authoring stays unchanged as explicitly required; new explicit prospective authoring uses the pinned policy.
9. Actual split/copy/rollback writer integration and legacy display behavior stay M3–M5 obligations. This milestone only changes historical read/snapshot syntax.
10. Review remains static/read-only; runtime evidence is root-owned. No redundant local DB/browser run is claimed, and new exact CI remains pending until observed.

Root releases M1 ownership on immutable01c46d1 or its evidence-only equivalent. A fresh scoped M2 persistence/resolver context may pipeline under P7.14 while exact M1 CI runs, holding dependent push/completion and stopping affected work on failure. No full money M1–M7/Phase07/V1 gate or extra roadmap task is closed; count41/91 stays unchanged. No main merge, production deployment, provider or stopped automation action.
