# Task 7 report

## TDD evidence

- Tests-only snapshot: `2a7a63903295113ff0527de501c5311c52603480`.
- Corrected auth-fixture snapshot: `04cd66043facf72604ec97c76a7d622b04420199`.
- Initial CI run `35538632152` was not accepted as behavior RED because database-backed auth rate-limit buckets were exhausted before the feature boundary.
- Valid feature RED: CI `35539057867`, job `106153245432`, against `04cd660`. Both collectors completed real HTTP 200 sign-in and reached the localized profile route. Desktop then failed because `Sammlungen` did not exist; mobile failed because `Collections` did not exist.
- Production implementation began only after that valid feature RED.
- Self-review reproduced a money boundary bug in the old arithmetic: `9007199254740990` minor units rendered as `90071992547409.91` and parsed back one cent higher.
- Isolated money RED: CI `35541104290`, job `106158800685`, against `9df3b183`. The max-minus-one roundtrip failed with expected `90071992547409.90`, received `90071992547409.91`; overall 223 passed, 1 failed, 20 database-gated skips.
- Money GREEN: CI `35541233171`, job `106159163627`, against `3fc2201`. All three money tests passed and the full unit suite reported 224 passed. That run then stopped at a Prettier-only warning for the helper's wrapped expression; this checkpoint applies only Prettier's obvious one-line form and leaves tests/behavior unchanged.

## Implementation

- Authenticated DE/EN pages for collection listing/detail and item create/edit.
- Responsive collection creation/settings/soft deletion and accessible nested collection tree with atomic node metadata/move updates.
- Definition and value controls for all ten custom-field types with canonical option labels, Decimal strings, dates, booleans, URLs, and money objects.
- Nested private-by-default storage locations, location moves, and item assignment without unchanged reassignments.
- Item create/edit/archive/delete with separate public description and private notes, explicit purchase price per unit, canonical calendar dates, visibility, trade status, and quantity.
- Multiple identifiers and tags.
- Manual EAN/UPC/ISBN entry is always present. BarcodeDetector is progressive enhancement; detected values remain proposals until explicit confirmation.
- Multi-endpoint saves retain a created item ID. Retry patches that item rather than posting a duplicate. A successful location request updates the retry baseline immediately.
- Desktop/mobile browser coverage also checks scanner proposal confirmation, item editing, archiving, and inactive save state.

## Recovery and verification evidence

The local exec runtime disconnected during the first production UI checkpoint. UI work was reconstructed and continued through atomic GitHub checkpoint trees.

- Candidate CI `35539878520`: unit tests passed; stopped at formatting.
- Formatter diagnostic CI `35540178029`, job `106156292758`: produced exactly twelve expected UTF-8 files. Outputs were persisted byte-for-byte and the temporary diagnostic removed.
- CI `35540346353`, job `106156735744`: lint passed; exposed E2E DOM names under server-only typechecks.
- CI `35540491109`, job `106157121355`: package typechecks passed; exposed two web exact-optional-property errors.
- CI `35540686118`, job `106157649498`: every unit, lint, typecheck, build, database, and existing auth gate passed; Task 7 reached UI and exposed a strict heading-locator ambiguity. Locators were scoped semantically.

A fresh full regular CI run is required before completion.
