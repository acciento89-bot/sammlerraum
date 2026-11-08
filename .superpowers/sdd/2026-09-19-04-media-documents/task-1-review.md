# Phase 04 Task 1 review — `7171142..0374221`

**SPEC: PASS. QUALITY: PASS with one Minor durability note.** No Critical or Important findings.

The exact four-method `StorageProvider` interface is exported. The local implementation accepts the caller-supplied absolute `UPLOADS_DIR` root, rejects malformed relative keys before filesystem access, checks root/parent/leaf symlinks, keeps missing delete idempotent, and publishes writes with a same-directory temporary file and rename. Package registration and export conventions match the workspace. Media authorization, MIME verification, EXIF handling, and reference/retention policy belong to later tasks; this provider neither exposes a public file route nor implements those policies. The configured app-owned root is the trusted OS boundary; concurrent replacement by another local process with write access is outside this review's threat model.

## Finding

- **Minor — crash durability is weaker than the synced file suggests** (`packages/storage/src/local-storage.ts:129–135`, `163–169`). `handle.sync()` flushes the temporary file, but the parent directory is not synced after `rename`; newly created parent directories and `unlink` entries are also not synced. A sudden power loss can therefore lose a successful `put` directory entry, or resurrect a successfully deleted entry, even though same-process visibility and atomic replacement work. If the provider promises power-loss durability for a DB link committed after `put`, sync the affected directory entries (including directory creation as needed) and test/document the supported filesystem boundary. Otherwise document that persistence means process restart and that crash recovery reconciles storage with DB state. This does not block the Task 1 interface or ordinary local persistence requirement.

Evidence reviewed: task brief, current phase rulings, scoped diff, relevant design §10, config and package conventions, and implementer report. The reported 19/19 storage tests plus typecheck, formatting, and frozen-lock checks were accepted without rerunning suites. No source edits were made.
