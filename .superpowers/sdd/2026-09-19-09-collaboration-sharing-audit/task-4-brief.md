### Task 4: Add append-only audit events

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/audit/audit-service.ts`
- Create: `packages/domain/src/audit/audit-service.test.ts`

**Interfaces:**
- Produces: `recordAuditEvent`, `listAuditEventsForResource`.

- [ ] **Step 1: Write failing source/actor test**

```ts
it("records before after actor and source", async () => {
  const event = await service.recordAuditEvent({
    resourceType: "ITEM",
    resourceId: itemId,
    action: "ITEM_VISIBILITY_CHANGED",
    actorId,
    source: "USER",
    before: { visibility: "PRIVATE" },
    after: { visibility: "PUBLIC" }
  });
  expect(event).toMatchObject({ actorId, source: "USER" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/audit/audit-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement audit model**

Source enum: `USER`, `IMPORT`, `AI`, `MARKET_SYNC`, `SYSTEM`, `MODERATION`. Store sanitized before/after JSON only for fields allowed by the event definition; never dump auth tokens or document bytes.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name audit_events
pnpm vitest run packages/domain/src/audit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/audit
git commit -m "feat: add append-only audit events"
```

---

