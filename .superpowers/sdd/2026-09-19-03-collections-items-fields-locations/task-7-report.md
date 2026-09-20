# Task 7 report

## TDD evidence

- Tests-only snapshot: `2a7a63903295113ff0527de501c5311c52603480`.
- Corrected auth-fixture snapshot: `04cd66043facf72604ec97c76a7d622b04420199`.
- Initial CI `35538632152` was not accepted as behavior RED because auth rate-limit buckets were exhausted before the feature boundary.
- Valid feature RED: CI `35539057867`, job `106153245432`. Both collectors completed real HTTP 200 sign-in and reached the localized profile route, then failed because the localized collections headings did not exist.
- Production implementation began only after that valid RED.
- Self-review reproduced an old money-boundary bug: `9007199254740990` minor units rendered as `90071992547409.91` and parsed back one cent higher.
- Isolated money RED: CI `35541104290`, job `106158800685`. Max-minus-one expected `90071992547409.90`, received `90071992547409.91`; overall 223 passed, 1 failed.
- Money GREEN: CI `35541233171`, job `106159163627`. All three money tests and all 224 unit tests passed. Input uses BigInt cent accumulation/range checking; display uses integer quotient/remainder.

## Implementation

- Authenticated DE/EN pages for collection listing/detail and item create/edit.
- Responsive collection creation/settings/soft deletion and accessible nested hierarchy updates.
- Definition/value controls for all ten custom-field types with canonical option labels, Decimal strings, dates, booleans, URLs, and money objects.
- Nested private-by-default locations, location moves, and assignment without unchanged reassignments.
- Item create/edit/archive/delete with separate public description/private notes, explicit purchase price per unit, canonical dates, visibility, trade status, and quantity.
- Multiple identifiers and tags.
- Manual EAN/UPC/ISBN is always available. BarcodeDetector is progressive enhancement; output remains a proposal until confirmation.
- Multi-endpoint saves retain the created item ID for retry; successful location assignment updates its retry baseline.
- Desktop/mobile E2E also covers scanner confirmation, editing, archiving, and inactive save state.

## Recovery and verification evidence

Local exec disconnected during implementation, so work continued through atomic GitHub checkpoint trees.

- CI `35539878520`: unit passed; formatting finding.
- Formatter diagnostic CI `35540178029`, job `106156292758`: emitted twelve exact files; outputs persisted byte-for-byte; diagnostic removed.
- CI `35540346353`: lint passed; browser names under server-only typechecks corrected.
- CI `35540491109`: package typechecks passed; two exact-optional web errors corrected.
- CI `35540686118`: unit/lint/type/build/database/auth passed; initial heading locator ambiguity corrected.
- CI `35541369868`: all 224 unit tests and lint passed; unchecked regex capture corrected.
- CI `35541518501`: every gate through existing authentication journeys passed. Both Task 7 projects reached the collections list; navigation timed out because the exact accessible name is `Pokémon Privat` / `Pokémon Private`, including the visible privacy label. The test now matches that full localized name and asserts the preceding POST returned 201. Tree-item locators are exact so nested descendants cannot create partial-name ambiguity.

- CI `35542044956` reached the Task 7 flows after all earlier gates passed; exact collection creation and navigation passed.
- CI `35542386162`, job `106162268056`, stopped at lint after adding explicit tree-item accessibility and bounded failure diagnostics; no behavior result was claimed.
- Formatter diagnostic CI `35542518284`, job `106162635021`, emitted exactly one changed file, `apps/web/e2e/collections-items.spec.ts`; that formatter output is persisted byte-for-byte.
- Ruling: while local exec remains unavailable, the workflow retains an explicit-source formatter diagnostic that runs only when the original lint step has already failed. It does not make lint or later gates pass. A clean candidate must still pass the ordinary lint/full gate; remove the diagnostic if it causes unexpected cost or behavior.

A fresh full regular CI run is required before completion.
