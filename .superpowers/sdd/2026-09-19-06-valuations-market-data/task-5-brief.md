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

---
