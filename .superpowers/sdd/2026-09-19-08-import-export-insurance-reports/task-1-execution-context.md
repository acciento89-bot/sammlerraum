# Phase08 Task1 — staged import jobs, mapping profiles and previews

Preparation during the final M7 browser gate. Source GO is conditional on root acceptance of the complete M7 local gates; there is no Task1 implementation yet. Existing approved product spec §17 and Phase08 implementation plan Task1 are authoritative. Root remains the sole source/runtime owner; no production migration, deployment, provider or real-data operation follows from this context.

## Finite scope

Implement the three actual persisted models (`ImportJob`, `ImportRow`, `ImportMappingProfile`), strict contracts and `createImportJob`, `buildImportPreview`, `saveImportProfile` service operations. A preview never changes inventory. Source parsing is Task2; actual import commit, writer authorization/CAS and durable retry handling are Task3. CSV/XLSX upload APIs and the localized import UI remain their later tasks. Do not call the whole import feature finished from these model/service tests.

Use the current PostgreSQL/Prisma model and policy architecture. Add a new migration; never alter already-applied migrations. Actor IDs are nonempty text, not necessarily UUIDs. Job/profile/item IDs are UUIDs. A job belongs to one authenticated owner and live owned target collection. References must not reveal foreign jobs, profiles, items or collection counts. Profile updates use expected revisions; the job stores a frozen mapping snapshot, so editing a reusable profile cannot reinterpret an existing preview.

Persist source format/name, declared bytes/SHA-256, a server-generated private source key, verification state, locale, job state/progress, mapping/preview revision and timestamps. A declaration is not proof that source bytes were verified. The parser may only advance an uploaded source after checking actual bytes/checksum. Task1 creates the pending upload intent; it does not write source files or add new media types to the existing image/document pipeline. Later source retention/deletion must explicitly handle these keys.

Persist each source row number, bounded raw string/null cells, stable job/source/row identity, preview state, normalized mapped values, row errors, exact duplicate candidates, decision and eventual commit receipt. Unique job/row and commit-key constraints are prerequisites for Task3; they are not themselves a claim of retry-safe inventory writes. No item is overwritten implicitly.

## Preview semantics and integration

Map columns explicitly by index, never infer money units/scales from cell formatting. Titles/quantities use existing item constraints. Optional identifiers reuse the existing identifier normalization authority; extract/export that pure parser if needed instead of copying its rules. Duplicate detection uses exact normalized identifiers against live owned items in the chosen collection, not fuzzy title guesses. Distinct specimens with the same title remain distinct. Ambiguous matches require a user choice; never silently choose the first candidate.

Use the M7 import validator for explicitly selected canonical money input and pin its preview result. Historical raw input stays explicitly UNKNOWN. Date parsing must use a selected date grammar; do not use permissive Date.parse. Any invalid row carries structured row errors and can be skipped, not silently coerced.

A complete valid unmatched row offers CREATE/SKIP. An existing-match row offers SKIP/MERGE/CREATE_SEPARATE and requires an explicit target for MERGE. Invalid rows offer SKIP only. Persist the preview generation and source/mapping identity. Future commits must revalidate the persisted decision and current target; Task1 does not execute them.

Large preview processing must be resumable in bounded batches with honest progress. No partial set is advertised as a complete preview. Source/row limits and parser batch scheduling belong to Task2; Task1 must expose a clean internal parsed-row boundary rather than accepting an unbounded client array. Retrying the same preview generation must not append duplicate rows or reset a committed row.

## Required evidence

Start with a genuine failing overwrite-protection test. Then prove actual PostgreSQL ownership, frozen profiles/previews, stable row identity, deterministic duplicate conflicts, concurrent stale revisions, invalid money/date/quantity row errors, bounded progress and zero inventory mutation. Pure tests must cover normalization and strict contracts; native tests must use the real three models and service functions. Review the whole completed Task1 candidate independently once. Root owns serial database/browser validation, the final report, precise executed/skipped counts and feature-branch publication. Advance the 91-task ledger only after Task1 itself is implemented, tested, reviewed and committed; M7 alone leaves 41/91 unchanged.

## Root source GO after M7 local acceptance

All M7 local gates above are now complete: final sourcebf65d08, independent whole and scoped reviews PASS,812 full native at192 plus9 final native closure,1465 final pure, types/lint/build and400+8 actual-built browser PASS. Root authorizes Task1 local source under the existing user instruction to continue. Preserve M7 source and evidence commits; no Task1 publication before required predecessor remote gates. Stop affected work on a real dependency failure. Root remains sole implementer and runtime owner.
