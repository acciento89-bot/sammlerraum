# Sammlerraum functional and operational finish implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; one whole-change review at the end. Owner explicitly opts out of intermediate design questions and authorizes completion.

**Goal:** Finish the live product beyond the approved navy/gold design, with broad collecting categories, reliable notifications/recovery and actual bounded paid-service activation.
**Architecture:** Extend existing domain/contracts and operator-only setup, keep current privacy and independent service boundaries. Preserve current customer records and installed identity integrations.
**Tech Stack:** Existing Next.js/TypeScript/PostgreSQL/worker, current Hetzner Portainer deployment.
**Spec:** docs/superpowers/specs/2026-09-19-sammlerraum-design.md plus owner steering8November: broad collecting categories and Sonstiges, approved Premium4.99EUR/month39.99EUR/year, aggregate external AI/marketdata spend<=25EUR/calendar month.

## Global constraints
- Preserve approved visuals, DE/EN, 320px+ mobile, private defaults and actual access controls.
- No fabricated catalogue entries, public members, market values, service readiness or email delivery.
- Keep original two starter definitions/identities and operator additions unchanged; additions are idempotent and transactional.
- No purchase or customer test transactions. Providers must fit the aggregate25EUR/month cap including fixed fees; do not activate a service that cannot enforce this.
- Source/public evidence contain no credentials, user content or private backups. One existing own Portainer stack; no other apps or automations.

## Review focus
- Re-running category initialization must preserve custom fields, retired condition choices and existing referenced IDs.
- Invalid category selection must never create a partially saved uncategorized item or reveal inaccessible collection existence.
- Notifications must recheck recipient consent and not leak private collection data in emails.
- Backup scheduling must not take an inconsistent DB/media snapshot or restore production accidentally.
- Billing and external spend must be enforced server-side, separate test/live, and cannot silently exceed the approved cap.

### Task1: Close visual-release regression
- [ ] Reproduce exact Lighthouse failure without lowering thresholds; retain failing report.
- [ ] Fix the English generic link text and ensure audit runtime serves the same public artwork as installed image.
- [ ] Verify actual Lighthouse SEO and existing affected compiled/public tests. Keep failed prior CI as historical.

### Task2: Complete collecting categories
- [ ] Add tests for broad bilingual registry (36 collecting areas, unique stable keys/slugs, final Sonstiges/Other).
- [ ] Add corresponding authored catalogue templates/fields and safe condition options, preserving original cards/vinyl definitions exactly; expand initializer integration proof for arbitrary registry size/idempotency.
- [ ] Expose all areas in discoverable public overview and actual item category selection, including initial capture. Keep mixed collections supported.
- [ ] Exercise normal API creation/filtering and mobile/desktop category selection, retain screenshots. Run operator dry-run then additive production initialization only after tested source deployment.

### Task3: Deliver notification emails
- [ ] Read existing consent/queue/dispatch implementation and prove own-account opt-in notification delivery through real SMTP.
- [ ] Enable only existing own mail transport for both services; verify queue lifecycle and unsubscribe/preferences without sending to customers.

### Task4: Finish recurring recovery operations
- [ ] Inspect actual own backup tooling/runtime and prepare bounded scheduler with consistent maintenance/drain and protected encrypted retention.
- [ ] Execute actual scheduled mechanism once, restore independent scratch DB/media/app and verify bytes/access.
- [ ] Keep recovery private key encrypted/protected on independent failure domain; require owner handoff if no suitable protected destination exists.

### Task5: Activate approved Premium offer and bounded external services
- [ ] Inspect existing Stripe/AI/market adapters and own provider accounts. Use service skills and primary documentation where required.
- [ ] Configure real Premium4.99EUR monthly/39.99EUR yearly offers, verified webhook and exact entitlements; no real purchase test.
- [ ] Account for provider fixed fees and metered calls under total25EUR/month; activate only services with actual credentials/license and enforceable budget. Implement necessary aggregate spend reservation tests before code.
- [ ] Show factual provider/price/availability and error states in UI; verify actual authorized provider returns, no invented market data.

### Task6: Exact-source release and handoff
- [ ] Fresh whole-branch review; one consolidated correction pass with reproducing tests.
- [ ] Run actual required checks and exact-source full CI to success; build matching immutable images and update only own services with rollback.
- [ ] Verify public/private/notification/payment configuration and category setup on actual HTTPS service. Preserve receipts and give concise finished/pending overview with remaining required owner input only.
