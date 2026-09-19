# Collaboration, Sharing, and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collaborative collection roles/invitations, granular share links and user shares, audit events, soft deletion, and restoration of supported changes.

**Architecture:** Membership and sharing are separate models. Policies consume membership/share facts. Audit events are append-only records emitted by domain services; restoration creates a new audited change rather than deleting history.

**Tech Stack:** Prisma 7, PostgreSQL 17, Node crypto, Zod, Vitest, Next.js.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Every collaborative collection has exactly one Owner.
- Owner/Admin/Editor/Viewer permissions are server-side.
- Share links use cryptographically random tokens, optional expiry/PIN, and explicit field scopes.
- Private notes and storage locations are excluded by default.
- Audit storage must still respect account/data deletion obligations.

## Review Focus

1. Owner transfer must be atomic; never produce zero or two owners.
2. Expired/revoked share tokens must stop working immediately.
3. A Viewer must not gain edit capability from a broader share link.
4. Restore must not overwrite newer conflicting data without an explicit conflict decision.
5. Audit views must not leak values/documents the viewer cannot currently access.

---

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

### Task 5: Integrate audit emission into core mutations

**Files:**
- Modify: `packages/domain/src/items/item-service.ts`
- Modify: `packages/domain/src/collections/collection-service.ts`
- Modify: `packages/domain/src/locations/location-service.ts`
- Modify: `packages/domain/src/grading/grading-service.ts`
- Modify: `packages/domain/src/valuations/valuation-service.ts`
- Create: `packages/domain/src/audit/core-audit-integration.test.ts`

**Interfaces:**
- Consumes: audit service.
- Produces: core mutation audit coverage.

- [ ] **Step 1: Write failing mutation coverage test**

```ts
it("records item condition and location changes", async () => {
  await conditionService.setItemCondition(itemId, conditionId);
  await locationService.assignItemLocation(itemId, locationId);
  const events = await audit.listAuditEventsForResource("ITEM", itemId, actor);
  expect(events.map(e => e.action)).toEqual(
    expect.arrayContaining(["ITEM_CONDITION_CHANGED", "ITEM_LOCATION_CHANGED"])
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/audit/core-audit-integration.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Emit audit in same transaction where possible**

Add audited mutations for visibility, condition, grading, values, location, tags/custom fields, media/document link changes, role changes, import changes, archive/delete/restore.

- [ ] **Step 4: Run domain tests**

Run: `pnpm vitest run packages/domain`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat: audit core collection mutations"
```

---

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
