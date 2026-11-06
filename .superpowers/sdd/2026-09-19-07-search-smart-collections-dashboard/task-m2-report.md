# M2 implementation and verification record — 6 November 2026

Parent:13b2bb6b24718eb86cef61a9442570029f96df91, the locally verified media follow-up to M1. Root is the sole mutator/runtime owner. P7.14 permits local pipelining; dependent push/completion remains held until both exact parent CI runs succeed. No main merge or production operation. Count41/91 unchanged.

## Implemented boundary

Three typed interpretation tables, nullable native generations, durable custom deletion tombstones, event shape/immutability/content-transition guards, flattened lineage, native FK erasure and immutable proposal/rollback payload envelopes. Current raw writers are covered by native triggers without silently gaining authoring evidence. The caller-owned-transaction store provides authorized fresh fact tokens, same-transaction assertion/copy, original historical revocation and explicit self-evidence erasure. Real operator authority uses the existing persisted role helper; no private-owner bypass or role/credential framework.

Canonical token encoding is bounded2048 ASCII bytes, fatalUTF8, strict-schema and exact canonical re-encoding. Required nullable originEvidenceErasedAt is a pre-release contract refinement perL1.9, not a claim of live token compatibility. ReadCommitted callers retain their existing transaction; no nested transaction or forced isolation is introduced. `copyMoneyFact` returns its resulting view rather than void to avoid an unnecessary follow-up read; no caller uses this as independent authorization. `readMoneyAssertion` supplies a private historical equality precondition; paged HTTP history remainsM3.

Native metadata changes must advance the parent's MVCC tuple while changing no domain value: a real simultaneous-classification test exposed the insufficiency of a row lock alone under RepeatableRead. Custom raw writes do likewise; purchase BASELINE in a BEFORE trigger must not recurse. L1.11 records that ruling and the fresh raw-only destination requirement for COPY. Receipt JSON is natively bounded2048 serialized bytes; semantic pinned-unit validation is separately mandatory in the producer resolver. Native partial evidence-shape checks do not independently establish policy validity or authenticate an end user.

## Actual failures and closure

- Missing generation/trigger behavior produced native RED before implementation.
- Direct domain pg import and missing direct Zod dependency were fixture/dependency failures, not product RED. Corrected by a guarded db-owned fixture helper and an explicit already-cached Zod4.1.11 dependency/frozen importer lock. No new library/version or credential.
- Actual User SET NULL+parent CASCADE exposed immediate-FK intermediate ordering. Personal parent FKs are SQL-owned deferred; all native cases force constraints immediate before rollback. No invalid final state is concealed.
- Canonical malformed selected money was incorrectly MISSING, and oversized variant arrays were incorrectly NOT_FOUND. Both now fail closed as data integrity.
- Concurrent classification previously surfaced SEARCH_INVARIANT instead of one winner plus a conflict; unknown copy previously retained independently interpreted destination meaning. Both meaningful expanded REDs are retained and corrected.
- An oversized otherwise shaped receipt was accepted natively. Its real RED is corrected by the native serialized-byte bound.
- The first schema-version regression tried to UPDATE an immutable catalog revision and was correctly rejected by the existing guard; that fixture failure is kept separately. A correctly INSERTed malformed synthetic snapshot then genuinely reproduced acceptance of a string lookalike version. The resolver now requires numeric1 exactly.
- Actual pre-migration purchase/custom zero values in historical ZZZ currency remain raw0, null physical generation, zero events and UNKNOWN/NO_EVIDENCE; no zero-as-missing or current-scale inference.

## Verification and remaining gates

Completed results, immutable review source and exact CI evidence will be appended after the commands and independent review actually finish. The pure suite intentionally skips native cases without explicit enablement; the focused native commands execute real PostgreSQL17.11 migrations/queries with no skips. New native files are explicitly allowlisted in CI. The test helper accepts an optional synthetic pre-money-migration seed callback, never a caller-selected schema or production database.

M3–M7, public migration regression, independent review, exact CI and all remaining V1 gates remain open until separately evidenced. No new UI, authoring HTTP path, financial coverage, captured valuation history or live migration is claimed by this milestone.

Pre-review frozen candidate local evidence:68focusedPASS/0skip (`serial-accepted.log`), including40real native cases;1342purePASS/541explicit native skips/96pass files (`pure-final.log`); whole lintPASS (`lint-final.log`), whole production buildPASS (`build-final.log`), whole typesPASS (`typecheck3.log`, followed by the final whole build including the final fixture/snapshot-source refinement). Prisma validate and explicit generatePASS. All DB work so far uses owned isolated synthetic schemas; the common public test schema still has no M2 migration. These checks establish a review candidate, not final M2 acceptance or production readiness.
