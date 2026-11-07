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

## Independent review and root closure

Independent reviewer `/root/sammlerraum_m2_review` reviewed immutable3c484dd read-only and returned0Critical/1Important(P2)/0Minor, SPECFAIL/QUALITYFAIL pending the P2. That original verdict is retained; root does not relabel it as an independent zero-finding pass.

P2 is accepted. Deterministic real ReadCommitted tests pause the actual COPY INSERT after refresh, then separately commit original CLASSIFY evidence erasure or original revocation from another transaction/owned collection. Both genuinely reproduced a PrismaP2010 instead of a money conflict. The two specific native invalidation guards now signal40001; only recognized serialization/stale-origin failure from COPY insertion becomes MONEY_CONFLICT. Other23514 constraints remain genuine invariant errors. Root's completed follow-up focused suite passes70cases, including42native cases, with zero skips. Both race cases verify destination COPY count0 and unchanged RAW_WRITER interpretation after whole-transaction rollback. A failed statement's conflict must propagate out of the caller transaction; it is not an in-place statement retry.

An additional exploratory concurrent DELETE gate timed out because the attempted deletion could not complete while the copy held its parent/FK locks. It is retained as a diagnostic, not counted as either a product RED or successful deletion-interleaving proof. Existing completed original-deletion and intermediate-deletion cases pass and establish conservative as-of/next-read behavior. No stronger instantaneous deletion guarantee is claimed.

Each independent declined behavior is explicitly adjudicated:

1. M3–M7 writers/routes/UI/coverage/transfers/captured consumers: accepted boundary; no completion credit awarded to these pending integrations.
2. Internal matching AUTHOR receipt seam: accepted; M3/M4 enforce explicit authoring intent and actual raw replacement. No client receipt is trusted by an exposed endpoint here.
3. Canonical raw reads without moderator: accepted existing public/history policy; mutation/private assertion conditions still require persisted authority.
4. Private administrator access: verified no bypass; owner/item/collection checks remain mandatory.
5. Parent id=id MVCC synchronization: accepted L1.11; no raw/domain-time/generation changes; BASELINE recursion excluded and native tests pass.
6. Cross-item origin reads without new locks: accepted intended bounded snapshot model; actual unhandled RC erasure/revocation race is separately fixed above, not silently set aside.
7. RepeatableRead observed-state semantics: accepted; later privacy/revocation changes must affect fresh reads/tokens, no post-commit instantaneous guarantee fabricated.
8. Deferred personal parent FKs: accepted SQL-owned behavior with real User/item/definition erasure and forced immediate final constraint checks.
9. Native shape versus full policy verification: accepted; domain revalidation is required before ELIGIBLE and malformed scale/unsupported-currency tests genuinely reject.
10. Trusted SQL can insert application-invalid metadata: accepted operator trust boundary; resolver fails closed instead of treating native shape as truth.
11. Bulk self-evidence erasure: accepted bounded aggregate output and caller-owned operation budget; no public bulk-classification or automatic evidence decision added.
12. Unsigned tokens: accepted equality-only preconditions with fresh actual authorization and canonical bounded decoding, never bearer credentials.
13. Shallow freezing of trusted in-process facts: accepted because the store refreshes actual authorized persisted facts and compares the actual token before mutation; no external JS object is an authority.
14. Static review cannot establish runtime/production/exact CI: accepted; root records actual executions and retains production/deployment gates. Parent13b2bb6 now has both exact CI SUCCESS:42147012409/job127660820241 and42147007611/job127660805555,31successful steps each. M2 exact CI remains pending until its own source is pushed.
15. Legal retention/external verification/account-erasure orchestration: accepted unclaimed scope; privacy content transition mechanics are implemented, surrounding orchestration remains in later authorized adapters.

Root review-fix verification:70focusedPASS/0skip,1342purePASS/543explicit native skips, full lintPASS and root tscPASS. The initial broad native regression created and migrated a separate owned test database successfully, but vitest.setup.ts intentionally overwrote DATABASE_URL with the common sammlerraum_test URL. Its79missing-column failures therefore exercised the old common schema, not the newly migrated database; that failed log is retained as fixture evidence, not a product-regression verdict. The temporary database was dropped by the owned cleanup. The common loopback cluster/data-directory guard will precede applying the frozen corrected migration there, followed by the actual complete native allowlist. Existing test isolation safeguards are not weakened.

## Root local acceptance

Corrected source45f4bc5 (full SHA in private source manifest) is locally accepted after closure of the sole P2. The actual guarded common PostgreSQL17.11 sammlerraum_test migration succeeded. The exact complete CI native allowlist then passed652tests/55files/0skips in97.82s; the following whole production build passed. Earlier70focused/1342pure/full lint/root tsc proofs remain recorded on the same corrected source. No production migration, main merge or later money cutover is claimed. The applied common-test migration checksum is now frozen; any further SQL correction must be a forward migration, never an edit to this applied file. Both upstream13b2bb6 exact CI runs are successful. M2 source/evidence can now be pushed for its own exact remote CI gate; dependent later work remains subject toP7.14. Count41/91 unchanged.
