# Task 4 review

Reviewed `759af32048dd313dffbf07b1c92b9a9dbd49fb3f..8de56cd2ba832d8ad26fc983082e3ad4ca60c2b2` against the Task 4 brief and design section 5.7, limited to typed custom-field contracts, schema/migration, services, tests, exports, and CI integration.

## Findings

1. **IMPORTANT — the real-PostgreSQL assertion uses the wrong Prisma error code, so the required CI gate is red.** `packages/domain/src/custom-fields/custom-field-service.test.ts:484-494` expects `P2004` from a deliberate `CustomFieldValue_typedShape_check` violation. In CI run `35534182170` / job `106140127755`, PostgreSQL explicitly reported that named check violation, but the installed Prisma stack surfaced it as `P2039`; the dedicated database run therefore ended with 87 passed and 1 failed. Assert the named constraint or the structured driver cause exposed by this Prisma version, while continuing to prove that this specific invalid typed shape is rejected.
2. **MINOR — partial integration-fixture setup can leak the first owner.** `packages/domain/src/custom-fields/custom-field-service.test.ts:332-334` creates both owners before entering `try`. If the second `createOwner` fails, the first committed user never reaches `finally`. Enter `try` before setup and record each owner ID immediately after creation, as the existing identifier integration fixtures do.

## Assessment

The product implementation otherwise satisfies the scoped requirements. Definitions are collection-scoped; all ten required types use dedicated nullable columns or relational select rows; decimal and money values avoid JavaScript precision loss; service validation canonicalizes values before persistence; composite foreign keys bind item, definition, collection, type, and options; and all mutations run inside owner-scoped Prisma transactions. Missing, foreign-owner, and cross-collection value targets share `CUSTOM_FIELD_NOT_FOUND`, and no public projection was added that could expose private or unlisted metadata. The migration is additive and leaves prior migrations unchanged. Static review found no concurrency defect in the row-lock ordering, and `git diff --check` is clean.

## Verdicts

- **SPEC: PASS.** The typed-field behavior, storage model, ownership boundary, and privacy requirements are implemented; the live database log also confirms the typed-shape constraint is enforced.
- **QUALITY: FAIL.** The PostgreSQL test assertion must match the installed Prisma error representation, and fixture cleanup must cover partial setup failure.

Reported RED→GREEN stages and local verification are accepted without rerunning: 189 unit tests passed, with lint, typecheck, schema/migration diff parity, Prisma validation/generation, and the CI migration/build steps passing. The real-PostgreSQL controller gate is currently **failed**, solely at the error-code assertion above; a corrected assertion and green rerun remain required before completion.
