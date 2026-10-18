### Task 6: Add the first two production market-data adapters

**Files:**
- Create: `packages/market-data/src/scrydex-provider.ts`
- Create: `packages/market-data/src/scrydex-provider.test.ts`
- Create: `packages/market-data/src/pricecharting-provider.ts`
- Create: `packages/market-data/src/pricecharting-provider.test.ts`
- Modify: `packages/market-data/src/provider-registry.ts`
- Modify: `packages/config/src/server.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Scrydex and PriceCharting credentials configured server-side.
- Produces: two production `MarketDataProvider` implementations mapped into the same internal `MarketObservation` model.

- [ ] **Step 1: Write failing adapter contract tests**

```ts
describe.each([
  ["scrydex", makeScrydexProvider(fakeScrydexClient)],
  ["pricecharting", makePriceChartingProvider(fakePriceChartingClient)]
])("%s provider", (_name, provider) => {
  it("returns canonical minor-unit observations with source identity", async () => {
    const rows = await provider.fetch(testCatalogRequest);
    expect(rows[0]).toMatchObject({
      externalId: expect.any(String),
      amountMinor: expect.any(BigInt),
      currency: expect.stringMatching(/^[A-Z]{3}$/),
      observedAt: expect.any(Date)
    });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run:
```bash
pnpm vitest run packages/market-data/src/scrydex-provider.test.ts packages/market-data/src/pricecharting-provider.test.ts
```

Expected: FAIL because production adapters do not exist.

- [ ] **Step 3: Implement Scrydex adapter**

Add required server configuration:

```text
SCRYDEX_API_KEY
SCRYDEX_TEAM_ID
```

Use the documented card endpoints with price inclusion for supported TCG catalog matches. Map raw/graded price records, currency, condition/grade qualifiers, and observed/fetched timestamps into canonical observations. Keep Scrydex source identity explicit even where its upstream price metric is itself aggregated.

Provider documentation reference for implementation review: `https://scrydex.com/docs/getting-started/prices`.

- [ ] **Step 4: Implement PriceCharting adapter**

Add:

```text
PRICECHARTING_API_TOKEN
```

Map PriceCharting product IDs/UPC/query matches and condition-specific price fields into canonical observations. Treat these as current guide values rather than inventing historical sales. Apply a provider-side request limiter that never exceeds one request per second per configured token.

Provider documentation reference for implementation review: `https://www.pricecharting.com/api-documentation`.

- [ ] **Step 5: Run adapter and market sync tests**

Run:
```bash
pnpm vitest run packages/market-data packages/domain/src/market-data apps/worker/src/jobs/sync-market-data.test.ts
```

Expected: PASS with fake HTTP clients; CI makes no paid external calls.

- [ ] **Step 6: Commit**

```bash
git add packages/market-data packages/config .env.example
git commit -m "feat: add Scrydex and PriceCharting market providers"
```
