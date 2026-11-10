# Category artwork and legibility implementation plan

**Goal:** Give all 36 existing collecting categories recognisable artwork and readable, unclipped bilingual labels.
**Architecture:** Keep the existing category vocabulary and routes. Supply original editorial image atlases with deterministic category coordinates; isolate the round picture from the rectangular text/content area. No catalogue, billing, auth or production user-data changes.
**Tech stack:** Existing Next.js/React, CSS, local WebP assets.
**Decision:** The owner explicitly requested autonomous implementation without further design questions. Preserve navy/cream/gold and circular motifs; put labels below pictures on a solid background. Existing only-three-photo mapping and fallback archive illustration leave most categories without subject-specific art; inherited border-radius:999px and overflow:hidden clip the whole tile.

- [x] Capture baseline desktop/mobile directory and confirm clipping/art coverage.
- [x] Generate original category artwork, grouped into four 3x3 editorial atlases; inspect each subject and record provenance/prompts. No brands, text, people or fictional user activity.
- [x] Add one complete typed category-art mapping. Render round, accessible decorative images with separate full labels/descriptions; preserve routes.
- [ ] Validate all 36 images, long German/English labels, narrow screens, keyboard focus and 200% text zoom. Run appropriate typecheck/build and existing category tests.
- [ ] Commit only this scope, deploy exact reviewed website source through existing own infrastructure, verify actual live images/readability and provide real screenshots.

Verification so far: production webpack build, TypeScript and changed-file formatting passed. Existing bilingual category-selection browser journeys passed on desktop/mobile (4/4). Independent source review confirmed all 36 keys/assets/routes and no important findings. Native Safari desktop/390px/320px views inspected; 320px exposed awkward word breaks, fixed by using rem-based responsive grid minimums. No production rollout yet. This presentation-only release preserves the existing worker/migration images and schema; only the stateless web image needs replacement, with all persistent mounts/env/networks retained.
