# Legacy money: explicit authoring and structural historical reads

This first prerequisite adds contracts and an exact parser. It does not classify existing values, create database events, change rows, expose a new route, enable money filters/totals or finish the existing legacy-money UI. Persistence, authorized evidence resolution, writer/copy/rollback adapters, UI and full-scope coverage remain later milestones.

## Prospective policy

`parseLegacyMoneyAuthoring` accepts only the explicit `legacy-money-iso-2026-09-17-v1` profile. It reuses the existing165-code authority in `currencies.ts`, with exported version and original artifact SHA256. No exponent or existing valuation parser behavior changes. Deliberate future authority changes need a new profile and reviewed compatibility; the old profile is not an alias for today's table.

Decimal authoring accepts trimmed digits and one optional comma or dot decimal separator, without grouping, signs or exponent notation. Input is at most80characters. Integer arithmetic is bigint; raw results are canonical strings from0 through9007199254740991. No rounding occurs. RAW mode must match the profile's unit identity and exponent exactly. For example new AFN`1` means raw100 with exponent2; an independently asserted historical AFN raw1/exponent0 remains`1`.

The returned receipt contains only normalized decimal/raw values and the immutable parser profile/hash, not the user's original locale text. A receipt schema is structural validation, not proof of provenance. Clients submit authoring/intents, never trusted receipts. Later services must validate any stored receipt against the pinned policy, its actual raw fact and authorized transaction before relying on it.

## Historical syntax and declared units

`HistoricalCurrencySchema` accepts structural uppercase three-letter codes, including retired/unsupported codes. Historical numeric DTO/snapshot values retain the unchanged safe-number raw pair. Collectible-item DTO and catalog entry/variant snapshot readers use these structural schemas; prospective purchase/custom write validators remain unchanged. This separation alone does not implement later copy/rollback writer behavior or replace the legacy display's inferred-scale UI.

`formatStoredMoney` uses the explicitly supplied scale0..9 and does not consult a current currency list. The formatter does not verify the caller's evidence. Unknown values remain raw/unknown until later authorized resolution; no current code, number or matching amount attests historical meaning.

`validateLegacyUnit` requires a deliberate declaration. A supported current unit must exactly match the raw currency. An unsupported declaration produces the assertion-specific `unsupported:<UUID>` identity and `UNIT_UNSUPPORTED`, so unrelated unsupported units cannot compare or aggregate. Human evidence is labelled owner-attestation or operator-verified record with bounded private reason/reference. Schema parsing never grants ownership/moderator authority, verifies a receipt or fetches a reference.

## Wire boundaries

Subjects use fixed typed purchase/custom/catalog identities, not arbitrary table names or paths. Strict authoring, retain/clear/replace/correction, classification, revocation, receipt and private-view shapes bound integers, UUIDs, normalized private strings and opaque tokens. Decoded fact/assertion token shapes are strict canonical data with bounded sequences. Actual opaque-token canonical decoding, authorization and locked equality checks belong to the later store; tokens are not credentials.

Missing, present-unknown and interpreted zero are distinct. Interpreted views bind decimal, raw amount/scale, unit/currency, evidence basis and eligibility. Unknown views carry no invented decimal, unit or exponent. Invalid receipt/view refinements return ordinary schema failure; they do not throw merely because a numeric bound fails. The16KiB body constant is an adapter obligation for later streamed HTTP handling, not a claim that schema parsing alone caps transport memory.
