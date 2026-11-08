# Sammlerraum public release information

> **For agentic workers:** Use superpowers:executing-plans inline for this release correction; the original whole-phase review is already complete.

**Goal:** Make factual Sammlerraum privacy and supplier information publicly accessible before the production Google sign-in rollout.

**Architecture:** Two closed documents at `/legal/{de|en}/{privacy|imprint}` reuse the existing localized shell. This root avoids collisions with collector handles. The shared footer and bounded language navigation link to them. No new tracking, consent barrier, commercial terms, account permissions or provider activation.

**Tech Stack:** Existing Next.js/React/next-intl, Vitest and compiled Playwright projects; no dependencies.

**Spec:** Existing V1 identity/privacy requirements and Phase13Task7 actual provider readiness. Google's production OAuth policy requires an accessible linked privacy notice; the reviewed source has no such page yet.

## Global constraints

- DE/EN only; private/token/query URLs never become document navigation.
- Real public business details come from Kamilunavo's existing published imprint.
- Describe actual account, collection, consent, SMTP and provider behavior. Never claim automatic account erasure, a legal certification, an unproved retention schedule or an active paid integration.
- Provider status copy follows explicit runtime switches; no client secrets or per-user information enter documents or metadata.
- Existing accepted application source9e25543 remains the internally running baseline until a new changed-source release passes its gates. No unchanged CI rerun and no new acceptance task invented.

## Review focus

- Profile-handle routes remain intact: use a separate root route.
- Closed locale/document identifiers and unknown routes fail404.
- Disabled optional providers must not be described as active; enabled providers must not retain a false disabled claim.
- Anonymous visitors can follow both footer links, switch language on the same document, read narrow/mobile layouts, and see correct canonical metadata.
- Public text must not disclose runtime credentials, user records or private request parameters.

### Task1: Complete public release information

- [x] Add failing contract tests for the closed document/locale registry and truthful provider-state copy; observe RED.
- [x] Add failing compiled browser journeys for anonymous footer navigation, both documents, locale switching, metadata and unknown-route404; observe RED against the existing compiled baseline.
- [x] Implement the small document model, localized routes, footer and language navigation.
- [x] Run focused GREEN tests, relevant existing locale/metadata regression, types/lint, production build and actual desktop/mobile journeys; retain unique proof files.
- [ ] Commit the changed application source; run its exact mandatory release CI and prepare matching immutable release images. Do not treat the old baseline's success as proof of this changed source.

## Evidence sources checked

- Google OAuth production policy: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Existing public business information: https://kamilunavo.com/imprint
- Resend SMTP, privacy and incorporated DPA: https://resend.com/docs/send-with-smtp ; https://resend.com/legal/privacy-policy ; https://resend.com/legal/dpa
- GDPR primary text: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
- Supervisory authority: https://www.ldi.nrw.de/
