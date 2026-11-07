### Task 3: Add granular share links and registered-user shares

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/sharing/share-service.ts`
- Create: `packages/domain/src/sharing/share-service.test.ts`
- Create: `packages/contracts/src/sharing.ts`
- Create: `apps/web/src/app/share/[token]/page.tsx`

**Interfaces:**
- Produces: `createShare`, `resolveShare`, `revokeShare`.

- [ ] **Step 1: Write failing expiry/default-scope tests**

```ts
it("rejects an expired share", async () => {
  await expect(service.resolveShare(expiredToken, null))
    .rejects.toMatchObject({ code: "SHARE_EXPIRED" });
});

it("excludes location private notes and policy data by default", async () => {
  const share = await service.createShare(actor, { itemId, scope: "DEFAULT" });
  expect(share.permissions).toMatchObject({
    storageLocation: false,
    privateNotes: false,
    insurance: false,
    purchaseReceipts: false
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/sharing/share-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement share model**

Targets: collection, node, or item. Recipient: public token or registered user. Options: expiry, PIN hash, images, values, selected document IDs, export permission. Store token hash only.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/sharing`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/sharing packages/contracts/src/sharing.ts apps/web/src/app/share
git commit -m "feat: add granular collection and item shares"
```

---

