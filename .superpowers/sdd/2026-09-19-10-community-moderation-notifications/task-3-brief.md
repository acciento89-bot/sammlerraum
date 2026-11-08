### Task 3: Add comments, blocks, and reports

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/community/comment-service.ts`
- Create: `packages/domain/src/moderation/block-report-service.ts`
- Create: `packages/domain/src/community/comment-service.test.ts`
- Create: `packages/domain/src/moderation/block-report-service.test.ts`

**Interfaces:**
- Produces: `createComment`, `deleteOwnComment`, `moderateOwnContentComment`, `blockUser`, `reportUser`, `reportComment`.

- [ ] **Step 1: Write failing comment disable/block tests**

```ts
it("rejects comments when the item owner disabled them", async () => {
  await expect(commentService.createComment(actor, itemWithCommentsDisabled, "hello"))
    .rejects.toMatchObject({ code: "COMMENTS_DISABLED" });
});

it("a block removes direct comment permission", async () => {
  await blockService.blockUser(ownerId, actor.id);
  await expect(commentService.createComment(actor, publicItem, "hello"))
    .rejects.toMatchObject({ code: "BLOCKED_INTERACTION" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/community/comment-service.test.ts packages/domain/src/moderation/block-report-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement models/services**

Comment target is collection or item, supports optional parent comment for reply, soft-delete/hide state. Reports retain reason/category, reporter, target snapshot IDs, moderation status. Blocks are directional but policy treats either relevant direction as disabling direct interaction.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/community packages/domain/src/moderation`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/community packages/domain/src/moderation
git commit -m "feat: add comments blocks and reports"
```

---

