# Task5D — localized saved searches and dynamic membership

Preparation only. Source GO requires reviewed5C and a fresh root-supplied BASE with actual exports. Read original task-5-brief.md, task-5-ui-preparation.md sections1–6 and8–10, task-5-context.md, and the reviewed5C report. Reuse its builder, request state, results, private transport and bounded selectors.

## Global constraints

- Filter definitions are structured, versioned data, not arbitrary SQL or free-form query strings.
- Search never returns items the actor cannot view.
- Smart Collections contain no duplicated item rows.
- Large/complex filters have bounded depth and clause count.
- Dashboard values remain separated by currency/source where aggregation is unsafe.

## Deliverable

Implement authenticated DE/EN saved-search list/detail pages and actual create, open, full replacement, rename, save-as-new and delete flows. Reconcile current Smart Collection DTOs, revisions and wire fields from reviewed source. Persist complete normalized text/filter/lifecycle; explain live membership, owner-only access and absence of item copies. Use list20/max50 and strict detail definitions. Saved item resolution accepts onlyid/limit/cursor. Activate the real save affordance in search, preserving the distinction between applied query and local draft.

Updates and deletes send the last fetched expectedRevision. On stale409 preserve the draft and offer inspect/reopen latest or save-as-new. Confirm before discarding meaningful edits. Never fetch a revision and silently overwrite with it. Acknowledged id/revision survives a failed refresh; older callbacks cannot restore old metadata or members. Revision/definition changes clear cursor and rows. Deletion confirms the owned name, explains that items remain, defaults to Cancel, then clears cached state and returns to list. Foreign/missing/deleted404 remain indistinguishable.

Unresolvable409 displays no current count/members. Structurally valid detail may feed the normal builder for explicit repair, retaining unavailable references. Malformed stored JSON is never exposed or guessed into an editable query; use actual supported list/delete recovery with a valid summary revision. Lost mutation responses preserve drafts, disable automatic retry and reconcile through actual owned list/detail. Duplicate names cannot identify an unknown create, and ambiguous concurrent changes cannot be attributed to our request. No new idempotency or saved-body duplicate-parser claim.

Reuse generation plus AbortController per channel, opaque query tokens, bounded tab state, identity/401 clearing, actual Next history and locale behavior. All dialogs, keyboard/focus/error states and responsive controls use the existing visual system and translations. Avoid nested modals, raw JSON editing and UUID inputs. Read failures remain errors rather than empty results. Private links disable prefetch; saved URLs grant no access. No money/market/relations/sharing producer changes.

## Required proof

Capture meaningful authenticated production-browser RED before implementation. Seed one real owned active untagged item; sign in; use Tags Has all signiert and observe genuine0; save through the dialog; reopen/reload complete definition and revision; visit actual ItemForm and submit the real Tags field; wait for successful PUT /api/v1/items/[id]/tags and refreshed snapshot; return to saved detail and observe actual membership1; remove tag in the same UI and observe0. No direct tag API/service mutation or fabricated success for this journey. Run DE/EN in both configured desktop/mobile projects in search-dashboard.spec.ts. Guard and clean only fixture-owned data.

Additional finite cases: create/open/reload/full update/rename/save-as-new/delete confirmation and cancel; two-tab stale conflict; unknown create/PATCH/DELETE outcome; acknowledged mutation followed by failed refresh; unavailable-reference repair versus malformed definition; foreign/deleted privacy; redirects and401 clearing; late responses after mutation/unmount/revision replacement; locale/history with meaningful drafts. Controlled failure/delay is allowed; successful data paths remain real. Preserve full available-operator/tree round trips and the valid >50-reference cache-eviction case.

Run one frozen relevant pure/browser/types/lint/build set with pinned Node24.19/pnpm10.17.1, actual production Next server and guarded sammlerraum_test under sole-owner GO. Native backend regression follows actual shared server changes, not an automatic unrelated full/media rerun. Keep all failed attempts, exact commands/output/counts/skips, DE/EN desktop/mobile screenshots and privacy/focus/history evidence. Skipped journeys cannot establish completion.

Write task-5d-report.md and all logs/manifests inside this workspace, logs/task-5d-*. Include frozen hashes and actual build/server provenance. Separate explicit owned source/evidence commits; no push, root-ledger/checkoff, subagents, main merge or deployment. Root supplies independent SPEC+QUALITY review and exact CI. Original Task5/Phase07/count stay open for5E and remaining producer/history gates.
