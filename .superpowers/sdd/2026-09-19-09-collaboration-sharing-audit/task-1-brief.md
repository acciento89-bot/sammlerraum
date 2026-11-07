### Task 1: Add collection membership roles and atomic owner transfer

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/collaboration/membership-service.ts`
- Create: `packages/domain/src/collaboration/membership-service.test.ts`
- Modify: `packages/domain/src/authz/policy.ts`

**Interfaces:**
- Produces: `addMember`, `changeRole`, `transferOwnership`, `removeMember`.

- [ ] **Step 1: Write failing ownership invariant test**

```ts
it("transfers ownership atomically and leaves exactly one owner", async () => {
  await service.transferOwnership(collectionId, oldOwnerId, newOwnerId);
  expect(await repo.countOwners(collectionId)).toBe(1);
  expect(await repo.getOwner(collectionId)).toBe(newOwnerId);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/collaboration/membership-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement roles**

Roles: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`. Use transaction and a DB-level invariant strategy so owner transfer cannot briefly leave invalid state. Only owner can transfer ownership/delete collection.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name collection_memberships
pnpm vitest run packages/domain/src/collaboration packages/domain/src/authz
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/collaboration packages/domain/src/authz
git commit -m "feat: add collaborative collection roles"
```

---

