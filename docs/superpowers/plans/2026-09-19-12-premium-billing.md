# Premium and Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement provider-neutral premium entitlements with Stripe as the first billing adapter, server-side feature limits, checkout/portal, idempotent webhook synchronization, and DE/EN pricing/account UI.

**Architecture:** Domain code reads local entitlement state; it never asks Stripe during normal feature checks. Stripe Checkout/Portal and webhooks synchronize a local subscription record. Exact prices and numeric quotas are deployment/product configuration rather than hard-coded domain constants.

**Tech Stack:** Stripe SDK, Prisma 7, PostgreSQL 17, Zod, Vitest, Next.js.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Free remains permanently usable.
- Community basics remain available without Premium.
- Expensive features may be quota/plan-gated.
- Return URLs never grant Premium; signed webhook/local subscription state does.
- Exact price IDs/limits are configured, not embedded into client code.

## Review Focus

1. Duplicate/reordered webhooks must converge to one correct local subscription state.
2. Checkout completion redirect without a webhook must not grant Premium.
3. Expired/canceled Premium must preserve user data and downgrade capabilities safely.
4. Feature-limit checks must be server-side even if the client hides controls.
5. Stripe/customer metadata must never be trusted as authorization without local ownership checks.

---

### Task 1: Add plan/entitlement model and provider-neutral feature gate

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/billing/entitlement-service.ts`
- Create: `packages/domain/src/billing/entitlement-service.test.ts`
- Create: `packages/contracts/src/billing.ts`
- Modify: `packages/config/src/server.ts`

**Interfaces:**
- Produces:
  - `getEntitlements(subjectId): Promise<Entitlements>`
  - `assertEntitled(subjectId, feature, usage?)`.

- [ ] **Step 1: Write failing free-limit/server-gate test**

```ts
it("rejects item creation above the configured free limit", async () => {
  const service = makeEntitlementService({ FREE_ITEM_LIMIT: 50 });
  await expect(service.assertEntitled(freeUserId, "ITEM_CREATE", { currentCount: 50 }))
    .rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/billing/entitlement-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement entitlement model**

Plan keys: `FREE`, `PREMIUM`. Feature gates include item count, media count/bytes, AI usage, market-data access, extended history, advanced analytics, XLSX, expanded import profiles, advanced filters.

Required production configuration includes numeric limits where Free is bounded; tests use explicit fixture values rather than implicit defaults.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name billing_entitlements
pnpm vitest run packages/domain/src/billing
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/billing packages/contracts/src/billing.ts packages/config
git commit -m "feat: add provider-neutral premium entitlements"
```

---

### Task 2: Add Stripe billing adapter, checkout, and portal

**Files:**
- Create: `packages/billing/package.json`
- Create: `packages/billing/src/types.ts`
- Create: `packages/billing/src/stripe-provider.ts`
- Create: `packages/billing/src/stripe-provider.test.ts`
- Create: `apps/web/src/app/api/v1/billing/checkout/route.ts`
- Create: `apps/web/src/app/api/v1/billing/portal/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `BillingProvider.createCheckout`, `createPortalSession`.

- [ ] **Step 1: Write failing ownership test**

```ts
it("does not create a portal session for a customer not owned by the actor", async () => {
  await expect(service.createPortalSession(actor, foreignSubscriptionId))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/billing/src/stripe-provider.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement Stripe adapter**

Require production env:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PREMIUM_MONTHLY_PRICE_ID
STRIPE_PREMIUM_YEARLY_PRICE_ID
```

Checkout attaches immutable local subject ID metadata. Portal creation looks up locally owned Stripe customer ID; client-supplied customer IDs are ignored.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/billing`  
Expected: PASS with mocked Stripe client.

- [ ] **Step 5: Commit**

```bash
git add packages/billing apps/web/src/app/api/v1/billing .env.example
git commit -m "feat: add Stripe checkout and customer portal"
```

---

### Task 3: Add signed idempotent billing webhook

**Files:**
- Create: `apps/web/src/app/api/v1/billing/webhook/route.ts`
- Create: `packages/domain/src/billing/webhook-service.ts`
- Create: `packages/domain/src/billing/webhook-service.test.ts`

**Interfaces:**
- Consumes: verified Stripe events.
- Produces: synchronized local subscription state + processed event id.

- [ ] **Step 1: Write failing duplicate/reordered tests**

```ts
it("processes the same event id once", async () => {
  await service.applyEvent(event);
  await service.applyEvent(event);
  expect(await processedRepo.count(event.id)).toBe(1);
});

it("does not let an older subscription update overwrite a newer state", async () => {
  await service.applyEvent(newerEvent);
  await service.applyEvent(olderEvent);
  expect((await subscriptionRepo.get(subjectId)).providerUpdatedAt).toEqual(newerTimestamp);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/billing/webhook-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement webhook sync**

Verify signature before parsing. Persist processed event IDs transactionally. Map subscription status/current period to local entitlement state. Return non-2xx on transient application failure so provider retries.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/billing/webhook-service.test.ts apps/web/src/app/api/v1/billing/webhook`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/billing apps/web/src/app/api/v1/billing/webhook
git commit -m "feat: synchronize billing webhooks safely"
```

---

### Task 4: Enforce entitlements across expensive/advanced features

**Files:**
- Modify: `packages/domain/src/items/item-service.ts`
- Modify: `packages/domain/src/media/media-service.ts`
- Modify: `packages/domain/src/ai/ai-analysis-service.ts`
- Modify: `packages/domain/src/market-data/market-data-service.ts`
- Modify: `packages/domain/src/exports/export-service.ts`
- Modify: `packages/domain/src/dashboard/dashboard-service.ts`
- Create: `packages/domain/src/billing/entitlement-integration.test.ts`

**Interfaces:**
- Consumes: `assertEntitled`.
- Produces: server-enforced plan boundaries.

- [ ] **Step 1: Write failing cross-feature gate test**

```ts
it("blocks premium-only XLSX while leaving CSV available to Free", async () => {
  await expect(exportService.requestExport(freeActor, scope, "XLSX"))
    .rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
  await expect(exportService.requestExport(freeActor, scope, "CSV"))
    .resolves.toBeDefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/billing/entitlement-integration.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Apply gates**

Enforce gates inside domain services before queueing cost. Downgrade never deletes excess existing items/media; it blocks new over-limit writes and premium-only operations while preserving reads/export paths permitted by product policy.

- [ ] **Step 4: Run full domain tests**

Run: `pnpm vitest run packages/domain`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat: enforce premium entitlements server-side"
```

---

### Task 5: Add pricing, plan status, and billing UI

**Files:**
- Create: `apps/web/src/app/[locale]/pricing/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/account/billing/page.tsx`
- Create: `apps/web/e2e/billing.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: public plan display config + billing APIs.
- Produces: DE/EN pricing, checkout, portal, current plan/usage UI.

- [ ] **Step 1: Write failing redirect-does-not-grant test**

```ts
test("checkout return alone does not show Premium as active", async ({ page }) => {
  await seedFreeUserWithCheckoutSessionButNoWebhook();
  await page.goto("/de/account/billing?checkout=success");
  await expect(page.getByText("Free")).toBeVisible();
  await expect(page.getByText("Premium aktiv")).not.toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/billing.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Price amounts are obtained from server-side configured Stripe Price metadata or a synchronized public plan display record; never duplicate price strings independently in DE/EN source code. Show usage/limits, cancellation state, and preserved-data downgrade messaging.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/billing.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add localized premium billing UI"
```
