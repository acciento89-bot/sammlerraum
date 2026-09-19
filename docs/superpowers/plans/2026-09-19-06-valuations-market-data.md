# Valuations and Market Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement canonical money handling, manual valuation history, external market-price points from multiple providers, source comparison, and idempotent scheduled synchronization.

**Architecture:** Personal valuations and external market observations use separate tables and services. Providers implement a stable adapter interface. External points are append-only observations keyed by provider/source identity and observation time.

**Tech Stack:** Prisma 7, PostgreSQL 17, pg-boss, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Money is stored as integer minor units plus ISO 4217 currency.
- Manual estimates and external market observations are distinct.
- New values append history; they do not silently overwrite prior points.
- Offer prices, sold prices, medians, and catalog values retain their type.
- No external provider is scraped unless terms/licensing explicitly permit it.

## Review Focus

1. DE comma decimal input and EN dot decimal input must normalize to the same minor-unit value.
2. A retried sync for the same provider observation must not duplicate a data point.
3. A price tied to the wrong catalog variant must not be silently attached to an item.
4. Mixed currencies must never be summed without an explicit conversion policy.
5. Missing provider data must remain missing, not be replaced by invented estimates.

---

### Task 1: Add canonical money parsing and manual valuations

**Files:**
- Create: `packages/domain/src/money/money.ts`
- Create: `packages/domain/src/money/money.test.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/valuations/valuation-service.ts`
- Create: `packages/domain/src/valuations/valuation-service.test.ts`

**Interfaces:**
- Produces: `Money { amountMinor: bigint; currency: string }`, `parseLocalizedMoney`, `addManualValuation`.

- [ ] **Step 1: Write failing locale test**

```ts
it.each([
  ["de", "1.234,56", 123456n],
  ["en", "1,234.56", 123456n]
])("parses %s money canonically", (locale, input, expected) => {
  expect(parseLocalizedMoney(input, locale as "de" | "en", "EUR").amountMinor).toBe(expected);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/money/money.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement money + valuation model**

Add `Valuation` with type `MANUAL`, amount minor, currency, observedAt, note, actor. Never update an old row when a new manual estimate is added.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name valuations
pnpm vitest run packages/domain/src/money packages/domain/src/valuations
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/money packages/domain/src/valuations packages/db
git commit -m "feat: add canonical money and manual valuations"
```

---

### Task 2: Define external market provider interface and observations

**Files:**
- Create: `packages/market-data/package.json`
- Create: `packages/market-data/src/types.ts`
- Create: `packages/market-data/src/provider-registry.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/market-data/market-data-service.ts`
- Create: `packages/domain/src/market-data/market-data-service.test.ts`

**Interfaces:**
- Produces:
  - `MarketDataProvider.fetch(request): Promise<MarketObservation[]>`
  - `recordObservations(providerId, observations)`.

- [ ] **Step 1: Write failing observation-type test**

```ts
it("preserves sold median separately from asking price", async () => {
  await service.recordObservations("test", [
    { externalId: "a", kind: "SOLD_MEDIAN", amountMinor: 42000n, currency: "EUR", observedAt },
    { externalId: "b", kind: "ASKING_PRICE", amountMinor: 49900n, currency: "EUR", observedAt }
  ]);
  const rows = await repo.forCatalogVariant(variantId);
  expect(rows.map(r => r.kind)).toEqual(expect.arrayContaining(["SOLD_MEDIAN", "ASKING_PRICE"]));
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/market-data/market-data-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement interface and model**

Observation kinds: `LAST_SOLD`, `SOLD_AVERAGE`, `SOLD_MEDIAN`, `ASKING_PRICE`, `PRICE_RANGE`, `CATALOG_VALUE`, `DEALER_PRICE`.

Persist provider ID, external observation ID, source URL/reference when licensed, catalog entry/variant, condition/grading qualifiers, currency, amount/range, observedAt, fetchedAt, confidence metadata.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name market_observations
pnpm vitest run packages/domain/src/market-data
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/market-data packages/domain/src/market-data packages/db
git commit -m "feat: add external market observation model"
```

---

### Task 3: Add idempotent market sync jobs

**Files:**
- Create: `apps/worker/src/jobs/sync-market-data.ts`
- Create: `apps/worker/src/jobs/sync-market-data.test.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `market.sync { providerId, catalogVariantId }`.
- Produces: deduplicated observations.

- [ ] **Step 1: Write failing retry test**

```ts
it("does not duplicate provider observations on job retry", async () => {
  await handler(payload);
  await handler(payload);
  expect(await repo.countForExternalId("sale-123")).toBe(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/sync-market-data.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement sync handler**

Use provider observation external ID + provider ID as idempotency key. Reject/flag observations whose returned variant qualifiers do not match the requested catalog variant sufficiently.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/worker/src/jobs/sync-market-data.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs apps/worker/src/main.ts
git commit -m "feat: synchronize market data idempotently"
```

---

### Task 4: Add source comparison API and item valuation summary

**Files:**
- Create: `packages/domain/src/valuations/valuation-query.ts`
- Create: `packages/domain/src/valuations/valuation-query.test.ts`
- Create: `apps/web/src/app/api/v1/items/[itemId]/valuations/route.ts`

**Interfaces:**
- Produces: `getItemValuationSummary(itemId, actor)`.

- [ ] **Step 1: Write failing mixed-currency test**

```ts
it("does not calculate a combined total across mixed currencies", async () => {
  const summary = await query.getItemValuationSummary(itemId, actor);
  expect(summary.aggregate).toBeNull();
  expect(summary.currencyConflict).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/valuations/valuation-query.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement transparent comparison**

Return manual latest + history and external observations grouped by provider/kind/currency. Do not compute a blended value unless all required inputs share currency and a later explicit aggregation method exists.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/valuations`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/valuations apps/web/src/app/api/v1/items
git commit -m "feat: compare manual and market valuations"
```

---

### Task 5: Add valuation history UI contracts and localization

**Files:**
- Create: `packages/contracts/src/valuations.ts`
- Create: `apps/web/src/app/[locale]/(app)/items/[itemId]/values/page.tsx`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`
- Create: `apps/web/src/app/[locale]/(app)/items/[itemId]/values/page.test.tsx`

**Interfaces:**
- Consumes: valuation API.
- Produces: localized source-separated valuation history page.

- [ ] **Step 1: Write failing rendering test**

```tsx
it("labels asking price and sold median as different source types", async () => {
  render(<ValuationPage data={fixture} locale="de" />);
  expect(screen.getByText("Angebotspreis")).toBeInTheDocument();
  expect(screen.getByText("Median verkaufter Artikel")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/src/app/[locale]/\(app\)/items/[itemId]/values/page.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement page**

Use `Intl.NumberFormat` by locale/currency. Render provider, observation type, timestamp, qualifier, and history separately.

- [ ] **Step 4: Run tests/build**

Run:
```bash
pnpm vitest run packages/domain/src/valuations apps/web/src/app/[locale]/\(app\)/items/[itemId]/values
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/valuations.ts apps/web
git commit -m "feat: show transparent valuation history"
```
