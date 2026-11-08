### Task 2: Add secure invitations

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/collaboration/invitation-service.ts`
- Create: `packages/domain/src/collaboration/invitation-service.test.ts`
- Create: `apps/web/src/app/api/v1/collections/[collectionId]/invitations/route.ts`

**Interfaces:**
- Produces: `createInvitation`, `acceptInvitation`, `revokeInvitation`.

- [ ] **Step 1: Write failing intended-recipient test**

```ts
it("does not allow a different verified account to accept an email-bound invite", async () => {
  await expect(service.acceptInvitation(inviteToken, wrongUserId))
    .rejects.toMatchObject({ code: "INVITATION_RECIPIENT_MISMATCH" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/collaboration/invitation-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement invitation tokens**

Store only token hash, intended normalized email or invited user ID, role, expiry, creator, accepted/revoked timestamps. Generate token with `crypto.randomBytes(32)`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/collaboration/invitation-service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/collaboration apps/web/src/app/api/v1/collections
git commit -m "feat: add secure collection invitations"
```

---

