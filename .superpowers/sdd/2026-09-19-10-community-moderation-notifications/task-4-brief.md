### Task 4: Add moderation workflow

**Files:**
- Create: `packages/domain/src/moderation/moderation-service.ts`
- Create: `packages/domain/src/moderation/moderation-service.test.ts`
- Create: `apps/web/src/app/api/v1/moderation/reports/route.ts`

**Interfaces:**
- Produces: `listReports`, `resolveReport`, `hideContent`, `restoreContent`.

- [ ] **Step 1: Write failing moderator-access test**

```ts
it("keeps reported hidden comment available to authorized moderators", async () => {
  await moderation.hideContent(commentId, moderator);
  expect(await publicCommentQuery(commentId)).toBeNull();
  expect(await moderation.getCommentForReview(commentId, moderator)).toBeDefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/moderation/moderation-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement moderation status and roles**

Introduce application moderator/admin role separate from collection roles. Actions require reason and emit audit events with source `MODERATION`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/moderation`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/moderation apps/web/src/app/api/v1/moderation
git commit -m "feat: add community moderation workflow"
```

---

