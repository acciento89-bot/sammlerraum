### Task 6: Add soft delete and conflict-aware restoration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/audit/restore-service.ts`
- Create: `packages/domain/src/audit/restore-service.test.ts`
- Create: `apps/web/src/app/api/v1/audit/[eventId]/restore/route.ts`

**Interfaces:**
- Produces: `softDeleteItem`, `restoreItem`, `restoreAuditEvent`.

- [ ] **Step 1: Write failing newer-change conflict test**

```ts
it("refuses restoration when a newer conflicting field change exists", async () => {
  await expect(service.restoreAuditEvent(oldVisibilityEventId, actor))
    .rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/audit/restore-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement restore rules**

Restore creates a new mutation and audit event. Supported field-level restore checks current version/updatedAt and later same-field events. Soft-deleted items have `deletedAt` and are excluded by normal queries.

- [ ] **Step 4: Run tests/build**

Run:
```bash
pnpm vitest run packages/domain/src/audit
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/audit apps/web/src/app/api/v1/audit
git commit -m "feat: add soft delete and audited restoration"
```

---

