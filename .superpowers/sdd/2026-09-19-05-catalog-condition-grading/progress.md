# SDD ledger — plan: docs/superpowers/plans/2026-09-19-05-catalog-condition-grading.md

Phase05 starts at8e4fb144ab47c74ea02d0dbb4895dec34b38d1d5 on existing isolated feature branch work/sammlerraum-v1. Canonical ledger confirms Phases01–04 complete,27/91. Do not repeat them. User2026-10-17 explicitly authorizes continuous progress until2026-10-18 09:00 Europe/Berlin; stop starting long work after08:45, secure verified/WIP separately by09:00. Heartbeat sammlerraum-bis-9-uhr-weiterbauen is active for this chat. No source merge/deploy/live provider actions. Feature pushes and main ledger-only sync already authorized.

## Binding requirements

Global catalog must never absorb ownership, personal price/location/notes. Personal items remain valid without catalog links. Ordinary users submit proposals instead of canonical writes. Condition and external grading are independent. Retain source/license provenance. Full spec sections5.3–5.7,13,14 bind this plan, including revision rollback, proposal moderation and category-specific original condition labels.

## Preflight interface/file-pair scan

| Tasks | Shared file/interface | Finding / resolution |
|---|---|---|
|1,2|schema/category template→entry attributes|Task1 owns typed definitions; Task2 validates canonical attribute values against them and snapshots template references.|
|1,3|schema/definitions→proposal patch|Proposal payloads validate against same definitions; no private arbitrary payload merge.|
|1,4|schema/category→condition scheme|Task4 references template category; personal item category must be optional and usable without a catalog link.|
|1,5|schema/shared model|Additive migrations, no overlapping implementers.|
|1,6|schema/category→item/catalog link|Entry/variant compatibility validated; item remains standalone.|
|1,7|definitions→localized catalog UI|Stable keys separate from DE/EN labels; render localized label/fallback, never use translated label as identity.|
|2,3|schema/catalog service/revisions→moderation|Canonical mutation and optimistic base revision must commit atomically. Task3 adds required real moderator authority, not a client boolean.|
|2,4|schema/category/entry→condition|Conditions are category-specific, never generic catalog text; Task4 preserves uncataloged items.|
|2,5|schema/global reference→personal grading|No personal grading copied into canonical revision snapshots.|
|2,6|schema/entry variants→optional item relations|Variant must belong to entry; deletion unlinks/redirects and preserves item.|
|2,7|entry/revision DTO→catalog detail|Safe public projection and bounded lookup; no owner/private DTO reuse.|
|3,4|schema/proposal→condition authority|Catalog moderation cannot overwrite personal condition.|
|3,5|schema/proposal→grading authority|Catalog moderation cannot overwrite personal grading.|
|3,6|canonical changes→existing item links|Approval preserves referential compatibility, rejects stale changes.|
|3,7|proposal commands/API→forms|Plan omits decision/detail endpoints and auth source; supply minimal required routes and persisted operator-granted moderator authority.|
|4,5|schema/item→condition vs grading|Independent relations and writes; changing one preserves other.|
|4,6|item category→catalog category|Link/unlink must define compatible category handling and preserve existing personal facts.|
|4,7|condition service→editor APIs|Task7 consumes routes not listed by Task4; supporting bounded owner-only API belongs with producer/consumer task.|
|5,6|item links/splitting→grading|Splitting new personal facts must be reviewed deliberately; catalog linking never changes grading.|
|5,7|grading service→editor APIs|Task7 needs owner CRUD routes; provider-scoped certificate identity must not rely on grade text or global certificate number alone.|
|6,7|search/link commands→linker/detail UI|Supply minimal search/detail/link/unlink routes, exact Origin mutations, authoritative ownership and nullable links.|

## Per-task consistency scan

|Task|Internal consistency / finding|
|---|---|
|1|Test calls validateAttributeValue missing from interface list; included. Model migration and package exports/supporting realDB test are necessary even if omitted from file list.|
|2|Test addVariant vs interface addCatalogVariant; expose coherent service contract and use it consistently. Immutable snapshots include variants, identifiers and provenance; required rollback cannot be left out of phase.|
|3|Stale revision test requires canonical row locking and atomic state transition. Add proposal schema migration despite missing explicit migrate step. Proposer/source/decision audit retained.|
|4|categoryId has no prior model; category template is identity, item optional category/condition relation required. Exact label plus optional1–5 band remain distinct.|
|5|Provider-scoped certificate test differs only provider; normalize provider identity separately from displayed grade and test same-provider behavior. Optional numeric grade must remain exact decimal representation.|
|6|Plan lists linking tests/routes but not schema migration; optional composite-compatible references and delete behavior belong here.|
|7|Consumes unlisted API routes and explicit browser project/CI registration; supporting routes and CI wiring required, not speculative extra features. Preserve existing warm-paper design, DE/EN and mobile/keyboard accessibility.|

## Rulings

Ruling: Continue in the existing clean isolated feature checkout — preserves reviewed work and PR — cost if wrong: reversible worktree relocation.
Ruling: Plan file lists are minimum surfaces, so additive migrations, exports, genuine integration tests, required DTOs/APIs and browser/CI wiring are included with their producing task — otherwise consumer tasks cannot work — cost if wrong: bounded route/package restructuring.
Ruling: Reuse the established ten custom-field primitive types and canonical validator for catalog definitions/values, mapping catalog-specific errors without changing existing custom-field behavior — avoids divergent precision/date/option semantics — cost if wrong: future catalog-specific validator extension.
Ruling: Category-template writes in Task1 are maintenance-only server functions with no ordinary-user route; persisted moderator authority and guarded canonical mutation are integrated before any user-facing catalog write in Tasks2/3 — no trusting submitted moderator flags — cost if wrong: additive authorization adapter refinement.
Ruling: Category identity is optional on personal items independently of catalog linkage, added with condition support; category-specific values must not disappear on unlink — honors standalone personal items — cost if wrong: additive category migration/DTO adjustment.
Ruling: Revision history includes enough immutable state for an authorized rollback recorded as a new revision, integrated in canonical mutation/moderation tasks — binding spec explicitly requires reverting bad edits — cost if wrong: slightly larger snapshot and command surface.
Ruling: Task1 templates/definitions/options use required DE/EN relational label rows, stable lowercase ASCII keys (letter then letters/digits/underscore, at most64), and at most100 definitions/100 options per definition — explicit identities and bounded maintenance input suit current two-language app — cost if wrong: future locale/limit extension and possibly schema adjustment.
Ruling: Task2 uses bounded explicit JSON fields for authored translations/provenance/canonical typed values, with relational entry/variant/definition/category identities and immutable complete JSON revision snapshots — preserves precision and avoids arbitrary private-data merges — cost if wrong: future locale/provenance/schema migration.
Ruling: Rollback retains inactive child UUID identities, with active-state projections and new-link validation excluding inactive variants — preserves future personal references while recovering prior authored state — cost if wrong: retained inactive rows and Task6 handling existing inactive links explicitly.
Ruling: Typed attribute values and namespaced identifiers may target entry or its variant, and variant UUID is identity rather than title/language/edition uniqueness — real variants can share displayed attributes — cost if wrong: later deduplication policy or target-contract extension.
Ruling: Phase05Task3 introduces the minimal persisted application MODERATOR/ADMIN authority foundation originally named by Phase10Task4, separate from collection roles and with operator-only grants — catalog moderation requires real authority now — cost if wrong: bounded role-model migration; Phase10 must reuse/extend it rather than introduce a second inconsistent global role source. Confirmed by focused dependency check of Phase10Task4; no later-phase implementation is claimed.

## Task tracking

Task1: in progress. BASE8e4fb144ab47c74ea02d0dbb4895dec34b38d1d5. Category templates and typed attributes.
Implementer p05_category_templates; preflight53b8ac6 pushed and exactremote verified. Root-owned phaseprogress edits must be preserved/excluded from implementer staging.
Task1 candidate7dce6cc pushed/exactremote verified;33focused and410full DB-enabled,lint/typecheck/build passed. Fresh review0Critical/0Important/2Minor, but SPECfalse on oversizedMULTI_SELECT wrong-member error precedence; original implementer assigned narrow fixround1 with behavioralRED/GREEN. Minor workerbuild6.8mb diagnostic retained for finaltriage. Exactsource CI39066255408/job117494459466 pending; candidate remains unchecked. Task2 context prepared only, no next implementation before Task1 review/CI/persistence gates.
Task1 fix31725b9 pushed/exactremote verified. ActualRED3fail/29pass; focusedGREEN36/36,domainlint/typecheckPASS. Scopedrereview SPEC/QUALITYApproved, M1addressed/M2acknowledged, zero newfindings. Exactsource finalCI39066522503/job117495245612 pending; no taskcompletion claim yet. Task2 implementer p05_revisioned_catalog authorized design-preflight only, no mutations/implementation until explicit rootGO+BASE after Task1 gates/persistence.
Task2: pending. Revisioned catalog/variants/identifiers.
Task3: pending. Moderated proposals.
Task4: pending. Condition schemes.
Task5: pending. Grading records.
Task6: pending. Safe personal/catalog links.
Task7: pending. Catalog/condition/grading UI and actual browser journeys.

Inherited deferred follow-ups (do not silently lose): Phase03 blank INTEGER→0 and duplicate leaf location labels; Phase04 sudden-power-loss directory-entry durability, avatar cleanup conflict generic error, harness color/stream-close diagnostics. Revisit only when naturally touched or final integration needs it. Local test PostgreSQL17.11 restarted from ../sammlerraum-db/data; source ../sammlerraum-test-env.sh, synthetic_test database only. No local Docker; CI supplies container gates. Pinned package manager npm exec --yes --package=pnpm@10.17.1 -- pnpm; ordinary PATH shim can mutate build policy. Existing runtime Node26 locally, CI Node24.

Task 1: complete (commits8e4fb14..31725b9, review clean). Exactsource CI39066522503/job117495245612SUCCESS:155DBintegration/29browser/unitlinttypecheckbuildmigrationsComposebothDocker/nativeSharp. Sourceunchangedsince31725b9. Canonical28/91/Phase05 1of7; planTask1checked. Preserve18original+4fix logs andtaskreview/rereview. Main ledger sync follows. Task2 remains design-only until rootGO afterpersistence.
