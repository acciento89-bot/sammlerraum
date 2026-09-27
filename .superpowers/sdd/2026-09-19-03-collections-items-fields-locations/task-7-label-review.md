# Task 7 collection selector label review

- Scope: `review-5ebd1b3..1296f2b.diff`; no suites rerun or earlier code reopened.
- **Verdict: SPEC PASS / QUALITY PASS for this narrow change. No new breakage found.** Final remote CI remains pending.

At `apps/web/src/components/items/item-form.tsx:399-416`, the added `aria-label={t("collection")}` gives the new-item collection selector the exact localized accessible name. It overrides the wrapped label's computed name, which could include the selected option text, while retaining the visible translated label. The selector's value, collection change handler, required constraint, options, and enabled state are unchanged. This resolves the exact-name locator in the two remaining desktop/mobile browser cases without weakening their recovery and draft-preservation assertions.

The diff contains only this production line and a documentation update. Reported web lint, typecheck, and 13 focused tests pass; the remote run for the published label fix has not yet completed.
