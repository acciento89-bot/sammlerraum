# Sammlerraum visual completion implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The owner explicitly requests autonomous execution without intermediate approval questions.

**Goal:** Replace the sparse presentation with a cohesive, responsive collector experience and deliver actual rendered screenshots in chat.
**Architecture:** Preserve Next.js routes, current authorization, privacy and all existing APIs. Add a reusable visual language, original first-party editorial imagery, localized marketing content and a clear authenticated navigation shell. Real collection data remain real; illustrative examples are explicitly labelled.
**Tech Stack:** Existing Next.js, React, next-intl, CSS, original optimized WebP images. No new runtime dependency.
**Spec:** docs/superpowers/specs/2026-09-19-sammlerraum-design.md. Original mockup unavailable; the owner confirms the GitHub concept as source. Visual choices below are implementation decisions, not a recovered original.

## Global constraints
- DE/EN parity; mobile 390px and desktop 1440px; keyboard operable navigation.
- Private-first policy, legal links, canonical/hreflang/robots and auth flows remain intact.
- No fabricated user numbers, prices, market values or live provider claims.
- Existing paid services remain disabled until actual activation and proof; visual completion does not imply full operating acceptance.
- Reuse dependency caches and avoid simulator/device creation.

## Review focus
- Long German labels and 320px screens must not overflow.
- Navigation must expose every existing authenticated route and active state.
- Illustrative marketing images must not masquerade as user holdings or real valuations.
- Empty accounts need clear actions, never fake portfolio metrics.
- Header, drawer and reduced-motion interactions must remain keyboard accessible.

### Task 1: Presentation foundation and public experience
Files: globals.css, locale layout, home page, marketing components, messages/de.json and en.json; new visual components and public artwork.
- [ ] Record baseline selected tests and add a failing behavioral check for locale-safe navigation and first-party artwork mappings.
- [ ] Implement responsive typography, spacing, controls, cards, public navigation, original editorial imagery, home, feature and category presentation, and auth framing.
- [ ] Run selected tests, typecheck, production compilation and real desktop/mobile rendering.
- [ ] Commit verified presentation changes.

### Task 2: Authenticated workspace
Files: new (app)/layout.tsx and workspace navigation; existing collection/detail/dashboard components and CSS.
- [ ] Add failing route-state tests for nested item, collection, account and management sections.
- [ ] Implement grouped sidebar, mobile navigation, clean content headings, dashboard quick actions, image-aware item/collection presentation and empty states without changing data policies.
- [ ] Exercise existing critical paths against a disposable local fixture; capture dashboard, collection, item, search, auth and public pages on desktop/mobile.
- [ ] Commit verified workspace changes.

### Task 3: Review, release and evidence
- [ ] Review complete diff, links, responsive layout, accessibility and image sizes; fix material findings.
- [ ] Run appropriate regression checks once on final source and build immutable release.
- [ ] Deploy to existing Sammlerraum stack only after release proof, retain rollback, verify normal public and owned account paths.
- [ ] Update product ledger accurately; provide real screenshots in chat. Track any still inactive operating services separately and continue them.

## Owner correction during implementation
The initial warm editorial/serif direction was explicitly rejected as too similar to LeihNest. It is not approved and must not ship. Replace it with a modern collector-gallery direction: bold sans-serif, cool cobalt/lavender/graphite, original studio collectible imagery, object cards, dark workspace sidebar and clear utility controls. Existing functions and privacy constraints remain unchanged.

## Concrete reference supplied by owner
Use the attached `Sammlerraum_ Deine Welt zum Sammeln.png` as the visual authority: navy persistent sidebar, gold active navigation and CTAs, global search bar, panoramic collecting hero, four benefit links, feed cards plus a right-hand context/category/tip column. The preceding lavender gallery proposal is superseded. Do not copy licensed characters, invented member counts or fake user activity from the reference. Use original artwork and clearly editorial content until real community data are available. Existing authenticated community keeps its real policy-filtered feed.
