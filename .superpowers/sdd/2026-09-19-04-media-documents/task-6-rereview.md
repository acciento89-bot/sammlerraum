### Spec Compliance

- ✅ Scoped fix compliant. I1 is addressed by `apps/web/src/components/media/media-upload.tsx:87` and `apps/web/src/lib/media-routes.ts:101`: the client sends percent-encoded UTF-8 with an explicit marker, and the server performs exactly one marked decode. Unmarked legacy filenames remain literal, including percent sequences.
- ✅ The CI fixture change at `apps/web/e2e/media-documents.spec.ts:103` clears synthetic rate limits before each journey and at suite teardown. It remains behind the existing enabled/`_test` database gate and does not modify product authentication. The actual CI invocation uses one worker, avoiding concurrent fixture resets within this run.
- ⚠️ Review scope is only `30ff3e072ab11515de3353e665a8381cfb00a6d8..5319a745a852068508ef509314477c2e078ab123`. The earlier Task 6 checks remain closed. Full six-journey media validation and exact-source CI are controller-owned gates, not represented here as already passed.

### Strengths

- `packages/contracts/src/media.ts:3` defines one explicit encoding marker and shared length bounds. `apps/web/src/lib/media-routes.ts:103` rejects unknown encodings, oversized encoded headers, malformed percent/UTF-8 input, and oversized decoded filenames before upload persistence. `packages/domain/src/media/media-service.ts:73` retains domain validation for length, path separators, and controls while sharing the same limit.
- `apps/web/src/lib/media-routes.test.ts:268` verifies the decoded filename and legacy literal-percent compatibility; line 297 covers malformed encoding and both bounds, asserting the upload service was never called on invalid input. `apps/web/e2e/media-documents.spec.ts:112` adds a real Unicode PNG upload with an en dash, Polish letters, emoji, and literal percent sequence, verifies the persisted/listed filename, and waits for its worker-produced image in desktop/mobile projects.
- `apps/web/e2e/media-documents.spec.ts:103` limits the rate-limit workaround to synthetic test state. The observed prior CI failures are concrete: `.superpowers/sdd/2026-09-19-04-media-documents/task-6-ci-cfdea25-failure.log:1055` and `:1075` show expected 200 versus received 429 for the two media sign-ins.

### Issues

#### Critical (Must Fix)

- None introduced by this fix.

#### Important (Should Fix)

- None remaining in this scoped rereview; I1 from `task-6-review.md` is resolved.

#### Minor (Nice to Have)

- Retain prior M1: `.superpowers/sdd/2026-09-19-04-media-documents/task-6-production-browser.log:1` and `:18` contain color-environment warnings and the stream-close diagnostic. This fix does not claim to address them.

### Checks and Evidence

- Read the supplied 13 KB diff once; no source, index, HEAD, or branch changes and no test suite reruns. Only this report was written.
- Named cross-cutting risk — test rate-limit isolation: checked the existing management fixture's `_test` gate and reset pattern at `apps/web/e2e/collections-items.spec.ts:136` and `:227`. The new reset follows that pattern, with an additional teardown reset for later auth commands.
- Existing targeted evidence is recorded in `task-6-unicode-unit-green.log` (35 passed) and `task-6-unicode-browser-green.log` (two desktop/mobile Unicode journeys passed). The controller reports successful lint, typecheck, and build; no re-execution was needed to assess this patch.
- Evidence precision: the supplied diff's new Unicode browser case uploads PNG, not PDF. The shared uploader and receiver implement the fix for both image and document modes, but this report does not claim a separate Unicode PDF browser assertion. The current general Task 6 report still identifies the older `cfdea25` candidate and should be finalized by the controller/implementer with this fix and final gate results.

### Assessment

**Task quality:** Approved for this scoped rereview.

**Reasoning:** The fix resolves the reproduced browser header failure without double-decoding existing filenames or weakening server filename validation. Test-only rate-limit isolation directly addresses the captured 429 failures; no new Critical or Important issue was found.
