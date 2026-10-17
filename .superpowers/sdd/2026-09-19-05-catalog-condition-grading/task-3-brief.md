### Task 3: Add catalog proposal moderation

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/catalog/proposal-service.ts`
- Create: `packages/domain/src/catalog/proposal-service.test.ts`
- Create: `apps/web/src/app/api/v1/catalog/proposals/route.ts`

**Interfaces:**
- Produces: `submitProposal`, `approveProposal`, `rejectProposal`.

- [ ] **Step 1: Write failing stale-revision test**

```ts
it("does not auto-apply a proposal against a stale base revision", async () => {
  await advanceCatalogRevision(entryId);
  await expect(service.approveProposal(proposalId, moderatorId))
    .rejects.toMatchObject({ code: "CATALOG_PROPOSAL_CONFLICT" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/catalog/proposal-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement proposal states**

States: `PENDING`, `APPROVED`, `REJECTED`, `CONFLICT`. Store proposer, base revision, proposed patch, source note/URL, moderator, moderation time, decision reason.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/catalog/proposal-service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/catalog/proposal-service.ts packages/domain/src/catalog/proposal-service.test.ts apps/web/src/app/api/v1/catalog
git commit -m "feat: add moderated catalog proposals"
```

---

