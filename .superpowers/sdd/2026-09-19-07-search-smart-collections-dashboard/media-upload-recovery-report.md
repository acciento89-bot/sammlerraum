# Upload recovery: M1 CI follow-up, 6 November 2026

Parent: 55bcabea4629c5ec2e6bc48b11f6a86813cce7b4. One exact M1 CI run failed its protected-media journey (42137536302 / 127629389709); the sibling 42137528295 succeeded. No unconditional remote acceptance is inferred from the sibling. Dependent M2 mutations were paused while investigating this failure.

The failed English desktop journey saw the gallery upload input remain disabled after an aborted asset POST. MediaUpload unconditionally awaited onChange in its error handler, even when no item-link request had started. A gallery refresh delayed independently of the failed transfer therefore prevents retry; Cancel aborts only the asset XHR and cannot cancel that unrelated refresh.

A new actual production-browser test aborts the asset POST while holding any subsequent gallery GET. On parent source it genuinely fails toBeEnabled after the action error is visible. This is product RED, not a fixture/import failure. The correction tracks whether a link request was attempted and reconciles only then. Link failure, cancellation compensation, and successful-link refresh still await authoritative listing reconciliation. The new case also verifies a successful retry actually appears in the gallery.

Isolation: the native create_worktree request remained unresolved and made no registered Git worktree; after ending that wait, an external linked worktree at the immutable parent was created. Its own frozen offline dependencies and generated Prisma client avoid pulling any uncommitted M2 source into this validation. Original M2 edits remain intact. No production data or deployment was touched.

Verification results will be recorded from completed commands. This correction does not finish M1 remote acceptance, M2, Phase 07, or V1 by itself. Count remains 41/91.

Completed local verification: whole monorepo production build PASS; web lint PASS; protected-media production browser journey 9 PASS / 0 FAIL (4.1 minutes), one worker. This includes both locales on desktop/mobile, the new retry case on both viewports, private receipt non-disclosure, and cancellation during link and refresh. Raw red/build/green/lint logs are retained without normalization. Root review: conditional is set immediately before link POST; every possibly committed link still reconciles, while pre-link rejection cannot mutate item gallery. No cancellation compensation was removed. Exact remote replacement CI remains a gate.
