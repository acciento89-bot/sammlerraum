# Phase 04 Task 1 report

Base: `7171142754c89c7a9eb3d9c20cb7bf3631fab2e1` on `work/sammlerraum-v1`.
Scoped commit: `0374221f987ac37c8879d78ea8d973c32e5ec3bf`.

Implemented `@sammlerraum/storage` with the exact `StorageProvider` four-method interface, a local persistent provider configured by an absolute root supplied by its caller, stable safe error codes, relative key validation, nested directory creation, symlink rejection at the root/parents/leaf, idempotent missing delete, and same-directory temporary write plus atomic rename. `UPLOADS_DIR` remains owned and validated by `@sammlerraum/config/server`; the storage package does not import or parse process environment. The package is registered in the workspace lockfile; its barrel export is exercised through the package self-import in the test.

## TDD evidence

- `corepack pnpm exec vitest run packages/storage/src/local-storage.test.ts`: RED, import missing, one failed suite before implementation.
- Same command after skeletal provider: RED, requested path escape rejected with `Storage not implemented` rather than `INVALID_STORAGE_KEY` (1/1 failed).
- Same command after the remaining contract tests: RED, 18/18 failed against skeleton.
- `corepack pnpm exec vitest run packages/storage`: first implementation 17 passed, 1 failed because read returned `Buffer` rather than a plain `Uint8Array`; corrected provider.
- Added trailing-slash root symlink regression: `corepack pnpm exec vitest run packages/storage/src/local-storage.test.ts -t 'trailing slash'`: RED, put unexpectedly resolved. Normalized the configured absolute root before `lstat`.
- Final `corepack pnpm exec vitest run packages/storage`: GREEN, 19/19 passed.

## Verification and self-review

- `corepack pnpm --filter @sammlerraum/storage typecheck`: passed (base tsconfig includes all workspace TS).
- `corepack pnpm exec prettier --check packages/storage && git diff --check`: passed.
- `corepack pnpm install --lockfile-only --frozen-lockfile --offline`: passed, ten workspace projects.
- Reviewed every changed file against Task 1 brief and spec §10: key escaping is rejected before filesystem access for all methods; parent/root/leaf symlinks are rejected; errors do not include system paths; temp files are private until rename and are cleaned on failure; missing delete is idempotent.

Trusted app-owned storage root is the boundary: this does not defend against another local process with filesystem write permission replacing directories between checks. No DB, Docker, push, merge, deploy, or full baseline suite was run; controller owns broader CI and progress ledger.

## Remote gate
Source165fddb28ac925a4ed7e860239d2786687a2c31d passed fullCI36317746924/job108615555313:259unit/static,109integration including22DB,22browserjourneys,migrations/lint/typecheck/build/Compose/bothDockerbuilds. IndependentreviewSPEC/QUALITYPASS with minor directory-fsync follow-up retained in progress/canonicalledger.
