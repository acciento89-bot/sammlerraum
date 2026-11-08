# Phase 04 Task 5 — independent specification and quality review

Reviewed the exact candidate from `42324f7011b1d608269ed2be4f842f60dce101a2` to `8b199e6d0d50fd20c98c0df0a1b2a6078d56ec8a`, using `review-42324f7..8b199e6.diff`. Working HEAD matched the candidate. Read Task 5 brief/context/report and the binding Phase 04 ledger rulings first. Reviewed all changed source and test hunks; accepted the report as the supplied verification evidence without re-reading raw passing logs or rerunning the full suite.

## Verdict

- **SPEC: CHANGES REQUIRED** — the filesystem staging sweep does not preserve fair progress when one path repeatedly fails, contrary to the failure/retry and bounded-fair-scan requirement.
- **QUALITY: CHANGES REQUIRED** — one reproduced Important defect; no Critical findings.
- **Open Critical: 0. Open Important: 1. Nonblocking minors: 1.**

Live PostgreSQL and CI remain pending independently of this finding. The reported 327 local passes and 41 database-gated skips are not treated as live database validation.

## R1 — Important: a failed staging-file deletion permanently starves later files

**Location:** `packages/storage/src/local-storage.ts:142–145`; the failing operation is at lines 129–140, and traversal occurs at lines 83–91.

The outer catch closes the traversal generator and deletes `cursor.walk` after any file inspection, staging-lock or unlink error. The next worker poll therefore restarts from the root. If an early directory or old reserved staging file is persistently unreadable/undeletable, every poll encounters that same failure before reaching healthy later paths. Those later crash leftovers accumulate indefinitely even though they are eligible and removable. Limiting each poll to 1000 entries does not provide fairness when errors discard its position.

**Observed reproduction on this candidate:** used the actual local-storage implementation, transpiled in memory with the installed TypeScript library, and an isolated temporary directory; no source/test files were changed. Created `a-blocked/` and `z-healthy/`, each containing an old `.storage-00000000-0000-4000-8000-000000000001.tmp` file, with modification time set to the epoch. Changed only `a-blocked/` permissions to `0500`, making its file deletion fail while the later directory remained writable. Called `cleanupLocalStorageTemporaryFiles` four times with the same cursor, `maxAgeHours: 24`, `maxEntries: 10`, and a locker that executes its callback. The result was:

```json
{"polls":4,"failures":4,"healthyOldFileStillPresent":true,"cursorReset":true}
```

Permissions were restored and the temporary fixture removed afterward. This is a direct filesystem failure reproduction, not an inference from a mock or a claim about unexecuted PostgreSQL tests. An initial direct Node TypeScript import could not run because strip-only mode rejects parameter properties; the subsequent in-memory transpilation executed the unchanged implementation successfully.

Reproduction script, run from the repository root as the normal non-root user:

```sh
node --input-type=module <<'NODE'
import ts from 'typescript';
import { mkdtemp, mkdir, writeFile, readFile, utimes, chmod, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const source = await readFile('./packages/storage/src/local-storage.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const { cleanupLocalStorageTemporaryFiles } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);
const root = await mkdtemp(join(tmpdir(), 'review-staging-fairness-'));
const blocked = join(root, 'a-blocked');
const healthy = join(root, 'z-healthy');
const name = '.storage-00000000-0000-4000-8000-000000000001.tmp';
try {
  for (const dir of [blocked, healthy]) {
    await mkdir(dir);
    await writeFile(join(dir, name), 'crashed staging');
    await utimes(join(dir, name), new Date(0), new Date(0));
  }
  await chmod(blocked, 0o500);
  const options = {
    maxAgeHours: 24, maxEntries: 10, cursor: {},
    withLock: async (_id, work) => work()
  };
  let failures = 0;
  for (let poll = 0; poll < 4; poll++) {
    try { await cleanupLocalStorageTemporaryFiles(root, options); }
    catch { failures++; }
  }
  console.log(JSON.stringify({
    polls: 4, failures,
    healthyOldFileStillPresent: await access(join(healthy, name)).then(() => true, () => false),
    cursorReset: !options.cursor.walk
  }));
} finally {
  await chmod(blocked, 0o700).catch(() => {});
  await rm(root, { recursive: true, force: true });
}
NODE
```

**Required correction:** isolate recoverable file/subdirectory failures, preserve progress beyond the failed entry, and retry failed entries on a later traversal without blocking healthy siblings. Handle errors inside recursive enumeration as well as unlink/inspection errors; merely retaining an already-closed generator will not solve traversal errors. Keep the age check, shared staging lock, symlink protections and per-poll entry budget. Add a regression with a persistent failing early path and a healthy later old file, demonstrating that the healthy file is reclaimed and the failed one is eventually retried after recovery.

## M1 — Minor: expected cleanup/link conflicts surface as generic errors

**Locations:** `packages/db/prisma/migrations/20261017120000_media_cleanup/migration.sql:29–30`; existing consumers `packages/domain/src/media/media-service.ts:227–240,286–290` and `packages/domain/src/identity/profile-service.ts:59–65,96–105`.

The new guard correctly rejects references to an asset with `cleanupStartedAt`, using SQLSTATE `23503`. However, the item-link service still accepts READY/PENDING/PROCESSING rows without examining cleanup state, and its catch only maps `P2002`. The avatar assertion likewise checks READY but not cleanup state. For an orphan whose cleanup started but whose bytes cannot yet be deleted, attempting to link it reaches the new guard and produces an unhandled persistence error instead of the existing domain-level unavailable/conflict response. The unchanged media route maps only `MediaServiceError`, so this becomes a generic error response. A check alone would not eliminate the concurrent case; retain the database guard and translate its rejection safely as well.

This does not permit an invalid reference or expose media and is nonblocking. It was identified by tracing the changed trigger through its existing callers; no live PostgreSQL error-mapping execution is claimed.

## Specification and design coverage

- Owner-only unlink runs transactionally and checks authenticated actor/target ownership. Item routes validate IDs and enforce same origin; the avatar route derives its identity from the session. New routes return 204/no-store and hide absent or foreign links.
- All media links, document links and avatar references participate in retention. Reference triggers coordinate reference writes with cleanup, clear orphan state on linking, and establish orphan time after the final reference disappears. Soft-deleted parents conservatively retain references. Quantity splitting prelocks the complete media/document asset set in UUID order and preserves shared assets.
- Candidate discovery is bounded and rotates attempted assets. `prepareDeletion` rechecks reference and retention gates under the asset lock, records cleanup state, clears processing claims and durably records original, recorded variant and deterministic derivative keys before storage deletion. Partial storage failure retains asset/variant tracking for retry. Successful deletion removes metadata only after byte deletions succeed.
- Permanent minimal key tombstones survive asset deletion with no timer expiry. Reconciliation uses the same advisory namespace and rotates failed/busy keys. Thus a late original or derivative publication after database session loss remains discoverable and removable. Tests model delayed original and real-processor derivative writes; the live database versions remain pending.
- Upload completion and image processing claims/reservations exclude cleanup-started assets. Read authorization explicitly excludes cleanup state and preserves existing live-reference authorization, so retained/unlinked and deleted assets are denied. Existing document privacy logic is not weakened.
- Production web/worker storage constructors supply the shared dedicated-session staging locker. Writers acquire it before staging creation and release after rename/final cleanup; maintenance uses the same namespace and rechecks age. The four-method generic storage contract is unchanged. The old-writer rollout precondition and fail-closed observed session-loss behavior are explicit.
- Worker startup, immediate polling, local overlap prevention, shutdown drain, bounded policy configuration and Compose forwarding are present. The migration is additive. No Task 6 UI, production data mutation or deployment is included.

The source/test inspection supports the design above, but does not substitute for executing the new SQL triggers and cross-session cases against PostgreSQL.

## Verification limits and handoff

Accepted reported evidence: 327 passing local tests / 41 DB-gated skips, successful frozen install, Prisma generation, lint, workspace typecheck and production workspace build. Did not repeat the full suite. Ran only the concrete filesystem hypothesis described under R1, using disposable temporary files and restoring permissions before removal.

The new tests cover shared references, orphan rollback, reference-first/cleanup-first races, cascade retention, delayed publication, asset/tombstone rotation, split sharing, staging exclusion, session loss, route authorization and worker lifecycle. Existing staging bounded-traversal coverage only exercises successful deletions, which explains why it misses R1. Live PostgreSQL migration replay, trigger behavior/error mapping and CI runtime gates must still pass before Task 5 is marked complete.

Unchanged dependencies were inspected only to resolve concrete integration risks: asset-lock implementation for cross-session staging exclusion; reference creator/profile callers for guard coverage and expected error handling; image repository claim/reservation operations for late resurrection; split/delete transaction boundaries for lock ordering; route error mapping for M1. No unrelated source edits, commits, subagents, pushes or production actions were performed. Only this review report was added.
