# Task 7 report

## TDD evidence

- Tests-only snapshot: `2a7a63903295113ff0527de501c5311c52603480`.
- Corrected auth-fixture snapshot: `04cd66043facf72604ec97c76a7d622b04420199`.
- Initial CI run `35538632152` was **not** accepted as behavior RED because the persistent database-backed Better Auth rate-limit buckets were exhausted before the feature boundary.
- Valid RED: CI run `35539057867`, job `106153245432`, against `04cd660`. Both seeded collectors completed real HTTP 200 password sign-in and reached the localized profile route. Desktop then failed because the `Sammlungen` heading did not exist; mobile failed because the `Collections` heading did not exist.
- Production implementation began only after that valid RED.

## Implementation

- Authenticated DE/EN pages for collection listing/detail and item create/edit.
- Responsive collection creation/settings/soft deletion and accessible nested collection tree with atomic node metadata/move updates.
- Definition controls for all ten custom-field types and canonical option labels.
- Nested private-by-default storage location creation/moves and item location assignment.
- Item create/edit/archive/delete with separate public description and private notes, canonical calendar date, Decimal string, and per-unit minor-money conversion.
- Multiple identifiers, tags, all ten custom-field value controls, and idempotent metadata replacement.
- Manual EAN/UPC/ISBN entry is always present. BarcodeDetector is progressive enhancement; detected values remain proposals until explicit confirmation.
- Multi-endpoint saves retain the created item ID. A retry patches that item rather than posting a duplicate. A successfully assigned location updates the retry baseline immediately, avoiding `ITEM_LOCATION_UNCHANGED`.

## Recovery and verification status

The local exec runtime disconnected during the first production UI checkpoint. UI work was reconstructed and continued through atomic GitHub checkpoint trees. No local compile, test, lint, build, or GREEN claim is made for connector-only UI changes. Remote CI and later restored-runtime verification remain required.
