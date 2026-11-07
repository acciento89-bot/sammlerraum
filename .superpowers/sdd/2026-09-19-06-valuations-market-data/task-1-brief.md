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

