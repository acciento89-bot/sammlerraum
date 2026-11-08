### Task 8: Add printable storage labels and scan-to-location flow

**Files:**
- Create: `packages/domain/src/locations/label-service.ts`
- Create: `packages/domain/src/locations/label-service.test.ts`
- Create: `apps/web/src/app/[locale]/(app)/locations/[locationId]/label/page.tsx`
- Create: `apps/web/src/app/l/[token]/page.tsx`
- Create: `apps/web/e2e/location-labels.spec.ts`

**Interfaces:**
- Consumes: storage locations and stable QR token.
- Produces: printable QR label and scan target that resolves to the authorized location view.

- [ ] **Step 1: Write failing token/privacy test**

```ts
it("resolves a valid label token but never exposes private location contents to an unauthorized actor", async () => {
  const resolved = await service.resolveLabelToken(location.labelToken);
  expect(resolved.locationId).toBe(location.id);
  await expect(service.getLocationContentsForActor(location.id, anonymousActor))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/locations/label-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement labels**

Generate QR content as `${APP_ORIGIN}/l/${token}` using a cryptographically random stable token unrelated to database sequence IDs. Printable view contains QR, human-readable location name, and short internal code; it never prints item values or private notes.

- [ ] **Step 4: Run tests/E2E**

Run:
```bash
pnpm vitest run packages/domain/src/locations/label-service.test.ts
pnpm --filter @sammlerraum/web exec playwright test e2e/location-labels.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/locations apps/web
git commit -m "feat: add printable storage QR labels"
```
