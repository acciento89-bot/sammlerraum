# Phase 05 integration review

Reviewed BASE `8e4fb144ab47c74ea02d0dbb4895dec34b38d1d5` through HEAD `548fdfdbb60997d3b17000f25d45d02c8464660c`. Final product source is `4d70f3102b1039fda8754969448d7b0689f09435`; the completion commit is evidence/documentation only. This is the whole-phase integration seat, not a repetition of the seven task reviews. The binding input was `phase-review-context.md`, the Phase 05 plan, canonical spec sections 13/14, supplied complete/code review packages, and the recorded task/fix evidence.

**Verdict: With fixes. Critical 0; Important 2.** The principal persistence, ownership and concurrency contracts integrate well. Two review-UI gaps prevent complete moderation/revision inspection and should be corrected before the phase gate closes. The minor items below are explicitly retained for controller triage.

## Strengths

- Canonical writes and personal facts remain separate. Proposal composition uses explicit canonical fields; create/update item contracts do not provide a bypass for catalog/category/condition writes. Canonical reads have no private-item/account joins. The unchanged public-item query explicitly selects and returns its existing whitelist, and both anonymous and authenticated non-owner item reads use that projection (`packages/domain/src/items/item-query.ts:48`, `:148`; `apps/web/src/lib/collection-item-routes.ts:298`). The added private read routes use fresh sessions, authoritative owners and no-store responses.
- The moderation transaction holds persisted authority, then proposal, then canonical entry. CAS precedes no-op detection. Conflict is persisted before the public wrapper raises its 409. Canonical changes, decisions and rollback audit share the transaction. The approved byte-equivalent rollback exception still records actor/reason/target/result separately. SQL grant revocation waits on the actual grant lock rather than a cached client capability (`packages/domain/src/authz/application-role.ts:10`; `packages/domain/src/catalog/proposal-service.ts:220`; `packages/domain/src/catalog/catalog-service.ts:251`).
- Link/split operations acquire entry and variant parents before the item, and split revalidates discovered references with bounded transaction retries. Other item, grading and condition mutations use the same authoritative item row. No category-change path acquires a replacement canonical parent after the item lock. Native subset SET NULL and partial-null CHECKs preserve personal category/item identity; real canonical histories intentionally restrict hard deletion.
- Condition semantics are immutable in their actual scalar label/key/band storage; retired choices remain readable and split-compatible. Grading remains owner/provider/certificate scoped, exact-value/explicit-scale data with native quantity-one enforcement. No condition/category/link save rewrites grading or personal purchase/location/notes.
- The actual UI has separate sibling forms, saved-ID gating, all seven proposal operations and real moderation/rollback producers. The prior unsaved-condition draft issue is addressed by primitive saved-value dependencies. Acknowledged grading creation retains its identity before sibling refresh, avoiding the covered duplicate-on-retry bug.
- The initializer is explicit, dry-run by default, atomic and idempotent for the approved authored starter identities. It preserves retirements and appended metadata. Its source-checkout CLI dry-run evidence is real. No canonical entries, grants or personal demo facts are installed implicitly.
- Recorded CI is substantive: the primary exact-source run `39081210503` / job `117538331002` is SUCCESS, and its retained tail shows all 65 production browser cases (2 + 7 + 36 + 4 + 16), both image builds and final-image Sharp execution. The controller also reports same-source run `39081207654` / job `117538323220` SUCCESS. The truncated retained tail is not used to invent an unseen DB-test count. Existing task reports and focused rereviews establish the DB/lint/type/build/migration gates. The DE mobile history and DE desktop owner screenshots were inspected: readable wrapping and visibly separate personal/reference sections support the UI evidence, without proving the edge cases below.

## Important findings

### I1 — Keep a proposal reviewable/rejectable when its reference enrichment is unavailable

**Files:** `apps/web/src/components/catalog/proposal-manager.tsx:80`–`:108`, especially `:102`–`:105`; producer seam `packages/domain/src/catalog/proposal-service.ts:101`–`:118`.

`detail()` clears the selection, retrieves the proposal, then waits for base/current revision and category GETs before setting the selected proposal. Any failed enrichment request skips `setSelected`; the rejection form never renders. The submission boundary only verifies that an existing target entry exists. A positive but nonexistent base revision is accepted, and a CREATE_ENTRY proposal's category is only a UUID in JSON, without an existence check or FK. These are accepted, durable PENDING proposals, not corrupt database rows.

**Reproduction:** Submit an UPDATE_ENTRY proposal against a real revision-1 entry with `baseRevision: 999`, or submit CREATE_ENTRY with a well-formed nonexistent category UUID. Open it from the moderator list. The proposal detail GET succeeds, but the revision/category GET returns 404; the screen shows an error and no decision controls. Retrying the list cannot repair the missing reference. The own-proposal detail is similarly inaccessible. An ordinary API client can therefore put entries into the moderation queue that the supported moderation UI cannot dispose of, despite the rejection service itself being able to reject them without canonical validation.

**Evidence:** A read-only in-memory invocation of the actual bundled transaction service, with counts and entry existence supplied by a minimal fake transaction, accepted both inputs. This proves the service's validation behavior, not a newly run PostgreSQL or browser test. Source inspection of the strict HTTP contract, JSON storage and absence of a base/category FK confirms no later submit-path rejection. Actual output is preserved below.

**Fix:** Treat the authenticated proposal detail as the primary resource. Render it and retain authorized rejection even when optional base/category/current enrichment fails; expose unavailable context and prevent unsafe approval as appropriate. Server-side existence validation can additionally reject impossible submissions, but should not be the only repair for already accepted rows or transient enrichment failures. Add a focused real API→moderator browser regression for these cases and verify rejection persists while canonical state stays unchanged.

### I2 — Render every authored language's description in moderation and history previews

**Files:** `apps/web/src/components/catalog/catalog-facts.tsx:41`–`:58`, and variant rendering at `:140`–`:145`; consumers `proposal-facts.tsx:39` and `catalog-history.tsx:176`.

`TextFacts` substitutes the current locale's translation description for the primary description. Its expandable translations section includes the primary **title**, but never the primary **description**. When the viewer's locale has an authored translation, the original description is absent from the rendered document. Separately, `CatalogFacts` renders only each variant's primary description and localized title, with no way to inspect its other translations. The latter component is used for the before-change and rollback previews as well as canonical detail.

**Reproduction:** Use an English primary text with distinct English and German descriptions. Review that entry/variant proposal in German: the submitted primary English description cannot be inspected even after expanding translations. For a canonical variant containing both languages, preview its revision in English: the German variant description is absent entirely. This can conceal the very authored content being approved/restored; changing application locale is not a complete solution for supported languages beyond DE/EN, and a moderator should not have to infer omitted content.

**Evidence:** In-memory React server rendering of the actual components confirmed `TextFacts(de)` contains the translated marker but not the primary marker; `CatalogFacts(en)` with that text on a variant contains the primary marker but not the translation marker. Both are actual rendering probes with a deterministic translation-label hook, not screenshot guesses.

**Fix:** Keep the localized summary, but include the complete labeled primary text and each explicit translation in an inspectable section; reuse that complete presentation for variants. Add focused rendering/browser assertions for entry and variant primary/translated descriptions in proposal review and revision preview. Preserve language/edition/reference disambiguation and source visibility.

## Minor findings and retained follow-ups

### M1 — Pending catalog selection can reopen after Cancel (retained Task 7 M1)

`apps/web/src/components/catalog/catalog-linker.tsx:143` only clears `selected`. With A selected, choose B under a delayed detail GET, then Cancel; B's response passes the unchanged generation check and reopens the form. Invalidate/release the pending read on Cancel, while preventing selection-read transitions from clearing a still-running mutation's busy state. A focused delayed-read case is sufficient. This is a recoverable interaction defect, not evidence of an authorization bypass.

### M2 — Blank INTEGER now also becomes an authored catalog zero (inherited Phase 03 behavior, newly reused here)

`apps/web/src/components/catalog/catalog-form-values.ts:37` calls `integerCustomFieldValue`, whose `Number(input)` at `apps/web/src/components/items/item-form-values.ts:46` accepts empty/whitespace input as zero. Enable an INTEGER catalog attribute and leave it blank: the proposal submits an authored numeric zero rather than identifying the missing value. This is the known Phase 03 issue propagated to the new producer, so it should remain visible in the ledger. Reject blank numeric input in the shared parser and exercise both producers; an explicitly typed zero must remain valid. Starter templates currently use only short text, limiting immediate reach.

### M3 — Clearing a category during an in-flight scheme read can leave permanent loading copy

`apps/web/src/components/items/condition-editor.tsx:42`–`:65` returns early for a null category without resetting `loading`; the previous request's aborted `finally` also refuses to reset it. Delay the scheme GET, save a change to no category (and explicit clear if needed), then allow the aborted request to settle. The no-category editor retains its loading status until another category is selected or the page is reloaded. Reset loading on the empty-category branch; preserve request invalidation. The analogous empty-category branch in `proposal-composer.tsx:39` should follow the same state rule. This conclusion is from direct state flow, not an executed browser reproduction.

### M4 — Expected attribute validation failures emerge as generic HTTP 500

`apps/web/src/lib/catalog-proposal-routes.ts:25`–`:48` maps CatalogServiceError but not CategoryTemplateServiceError, which `validateAttributeValue` actually throws (`packages/domain/src/catalog/category-template-service.ts:58`–`:79`). A schema-valid proposal with an invalid typed attribute remains pending as designed; approving it reaches that validator and returns INTERNAL_ERROR/500 instead of a bounded validation response. The transaction correctly rolls back, and rejection remains possible when enrichment is valid. Map the known attribute validation failures to the normal validation envelope and verify the actual decision route. Do not broaden this mapping to unexpected infrastructure failures.

### M5 — Grading provenance textarea rejects ordinary line breaks

`apps/web/src/components/items/grading-editor.tsx:212` offers a textarea, while `packages/contracts/src/grading.ts:13` and `:39` reject every ASCII control character, including newline. Enter two short source/provenance lines and save: the otherwise valid grading receives a generic validation error. Either permit the intended newline/tab characters specifically for free-text provenance, preserving other control rejection, or present a clearly single-line field. This is recoverable by removing line breaks and does not compromise stored grading identity.

### M6 — The initializer is not present in the final worker container (explicit packaging follow-up)

`Dockerfile.worker:19` copies only `dist/worker.cjs`; the separately built `dist/initialize-catalog.cjs` is absent from the final image. `docs/catalog-starter-definitions.md:5`–`:18` documents a repository/pnpm path, not a container command. A command such as `node dist/initialize-catalog.cjs` inside that final image cannot work.

**Phase judgment:** Nonblocking for this phase because the documented source-checkout operator path is explicit, executable and has a recorded bundled dry-run, and Phase 13 explicitly owns the immutable-image production stack. Do not describe the current image build or Sharp smoke as initializer runtime proof. Retain this as a concrete Phase 13 packaging/runbook gate: copy the maintenance bundle (or provide a dedicated one-shot maintenance image), document dry-run/apply invocation with the intended DB environment, and smoke the actual packaged command. The current runbook would also benefit from explicitly naming an installed/generated, migrated repository checkout as its prerequisite.

### M7 — Warning/bundle diagnostics remain acknowledged (retained Task 7 M2 / Phase 04 noise)

The retained logs contain NO_COLOR/FORCE_COLOR, npm config and stream-close diagnostics; builds show approximately 6.9 MB worker and 5.7 MB initializer bundle indicators. The final image logs additionally retain Prisma/OpenSSL guidance and a dependency deprecation warning. These do not overturn the observed successful build/browser/Sharp gates, and no runtime failure from bundle size was established. Clean environment forwarding and assess dependency/runtime packaging at release hardening; retain historical logs. Server-only maintenance bundle size is accepted as nonblocking here, not silently called pristine.

## Checks, evidence limits and focused probes

- Used the supplied full package and code-package inventory rather than regenerating a diff; inspected production source/contracts/migrations/UI in functional passes, named integration tests and relevant task/fix reports. The full package has 436 diff sections including repeated evidence/tracking/binaries. Historical megabytes of logs were not re-audited. This review does not claim to have rerun every earlier task audit or read every duplicate raw log.
- Named unchanged callsite checks: generic item input/public response projection; canonical mutation versus new parent locking; category-template validator exception versus moderation route mapping; shared INTEGER serializer versus new catalog producer; final Docker COPY versus initializer output; Phase 13 production-image ownership; exact-source CI's actual production project registration.
- No passing suites were rerun. No database, branch, index, checkout source, provider or production state was changed. Only this report was written. No children were dispatched.
- The focused probes bundled current modules with esbuild `write:false` and evaluated them entirely in memory. The domain probe used a fake transaction returning `read committed`, zero quota counts, an existing target entry and an in-memory proposal create result. It performed no database/network access. The rendering probe used actual React server rendering and a deterministic next-intl label stub; it did not replace the components' rendering logic.

Actual probe output:

```text
Read-only domain seam probe: [{"kind":"UPDATE_ENTRY","baseRevision":999,"accepted":true},{"kind":"CREATE_ENTRY","baseRevision":null,"accepted":true}]
TextFacts de rendering: {"primaryPresent":false,"translationPresent":true}
CatalogFacts en variant rendering: {"primaryPresent":true,"translationPresent":false}
```

The rendering input had primary English description `PRIMARY_DESCRIPTION_MARKER` and German translation description `TRANSLATED_DESCRIPTION_MARKER`. For the second rendering, that text was on a variant and the entry's own text had no descriptions/translations, so the marker absence was unambiguous. I1's missing UI selection is established by the inspected asynchronous control flow; a new actual browser regression remains part of the fix validation, not claimed as already run.

## Declined to judge as a Phase 05 blocker

- Docker/Portainer-only maintenance execution: retained as M6, because Phase 05 has an explicit source-checkout path and Phase 13 owns final production packaging; no in-image initializer success is claimed.
- Phase 03 duplicate leaf location labels: unchanged hierarchy-selection UI outside this phase; retain the existing deferred ledger item rather than silently close it.
- Phase 04 directory-entry fsync/power-loss durability: unchanged storage durability implementation, with no new write path here; retain the release-hardening follow-up. Database rollback correctness is not proof of filesystem power-loss durability.
- Phase 04 avatar cleanup conflict error presentation: unchanged avatar workflow, unrelated to the new catalog producers; retain its existing deferred item.
- Shared personal grading audit/history, restore/erasure and account audit-identity policy: explicitly assigned to later Phase 09 integration; current CRUD timestamps and soft-delete certificate reservation follow the approved policy.
- Global certificate uniqueness, grading provider aliases/automatic normalization and manufactured cross-domain condition bands: explicitly rejected by the approved design; current owner/provider scope and authored null starter bands are intentional.
- Separate canonical revision on byte-equivalent rollback: the binding ruling requires a distinct rollback audit while preserving the canonical no-op revision. The implementation follows that ruling.
- New identity when re-adding an inactive identifier tuple: documented Task 2 policy preserves historical UUID reactivation on snapshot rollback, not on a new add operation; no cross-task inconsistency found.
- Hard deletion of canonical objects still referenced by history/proposals/audits: intentionally restricted. Nullable-link deletion behavior is demonstrated with otherwise-deletable fixtures and does not imply routine destruction of canonical provenance.
- Additional locales beyond scalar DE/EN category/condition metadata, full-text indexing and cross-request search snapshots: accepted V1 scaling/schema limits; authored catalog text retains its separate language system. This does not excuse I2's omission of already supported authored text.
- Live OAuth/SMTP/provider verification and a production bootstrap/deployment: external gates outside the authorized review. No live actions were attempted.
- Exact cause of the previous development-server CI navigation timing failure: final production-runtime alignment is supported by the scoped rereview and both reported final-source CI successes. The older remote dev failure was not reproduced locally and is not relabeled as a proven application repair.

## Assessment

**Ready to close Phase 05: With fixes (I1, I2).** Persistence and transaction architecture are coherent across all seven tasks, and the existing verification is strong. Close the two complete-review/UI gaps in one consolidated fix wave, add the focused regressions, obtain scoped rereview and fresh exact-source CI if source changes, then explicitly decide which minor follow-ups remain in the ledger. Phase 06 should remain implementation-gated until that outcome.
