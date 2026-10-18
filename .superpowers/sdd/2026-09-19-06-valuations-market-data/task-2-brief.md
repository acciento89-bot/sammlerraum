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
