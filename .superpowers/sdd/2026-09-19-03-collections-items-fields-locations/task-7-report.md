# Task 7 report

## TDD evidence

- Tests-only snapshot: `2a7a63903295113ff0527de501c5311c52603480`.
- Corrected auth-fixture snapshot: `04cd66043facf72604ec97c76a7d622b04420199`.
- Initial CI run `35538632152` was **not** accepted as behavior RED because the persistent database-backed Better Auth rate-limit buckets were exhausted before the feature boundary.
- Valid RED: CI run `35539057867`, job `106153245432`, against `04cd660`. Both seeded collectors completed real HTTP 200 password sign-in and reached the localized profile route. Desktop then failed because the `Sammlungen` heading did not exist; mobile failed because the `Collections` heading did not exist.
- Production implementation began only after that valid RED.

## Implementation progress

- Added authenticated localized routes for collection listing/detail and item creation/detail.
- Added the collection list/create client and collection hierarchy management client.
- The collection detail includes collection update/soft deletion, nested node creation and atomic metadata/move updates, all ten custom-field definition types, nested location creation/moves, and item navigation.

## Recovery note

The local exec runtime disconnected during the first production UI checkpoint. The GitHub checkpoint reconstructs accepted files from their exact patch inputs. The failed local `collection-detail.tsx` write was regenerated through the connector in the next atomic checkpoint.

No local compile, test, lint, or build claim is made for UI changes made while the runtime is offline. Remote CI and later restored-runtime verification remain required.
