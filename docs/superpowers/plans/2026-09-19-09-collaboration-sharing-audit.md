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

- [x] **Step 1: Write failing ownership invariant test**

```ts
it("transfers ownership atomically and leaves exactly one owner", async () => {
  await service.transferOwnership(collectionId, oldOwnerId, newOwnerId);
  expect(await repo.countOwners(collectionId)).toBe(1);
  expect(await repo.getOwner(collectionId)).toBe(newOwnerId);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/collaboration/membership-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement roles**

Roles: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`. Use transaction and a DB-level invariant strategy so owner transfer cannot briefly leave invalid state. Only owner can transfer ownership/delete collection.

- [x] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name collection_memberships
pnpm vitest run packages/domain/src/collaboration packages/domain/src/authz
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/collaboration packages/domain/src/authz
git commit -m "feat: add collaborative collection roles"
```

---

Implementation verified at b3bbd78;59focused closing tests,982native,1532regular,types/lint/build and24built-browser checks pass. Independent whole-phase review follows Task7 under the current inline workflow; master reviewed-task count remains48 until that review.

### Task 2: Add secure invitations

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/collaboration/invitation-service.ts`
- Create: `packages/domain/src/collaboration/invitation-service.test.ts`
- Create: `apps/web/src/app/api/v1/collections/[collectionId]/invitations/route.ts`

**Interfaces:**
- Produces: `createInvitation`, `acceptInvitation`, `revokeInvitation`.

- [x] **Step 1: Write failing intended-recipient test**

```ts
it("does not allow a different verified account to accept an email-bound invite", async () => {
  await expect(service.acceptInvitation(inviteToken, wrongUserId))
    .rejects.toMatchObject({ code: "INVITATION_RECIPIENT_MISMATCH" });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/collaboration/invitation-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement invitation tokens**

Store only token hash, intended normalized email or invited user ID, role, expiry, creator, accepted/revoked timestamps. Generate token with `crypto.randomBytes(32)`.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/collaboration/invitation-service.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/collaboration apps/web/src/app/api/v1/collections
git commit -m "feat: add secure collection invitations"
```

---

Implementation verified at8284c06:1008native/89files,1542regular,types/lint/productionbuild and actual3-cookie API journeyPASS; scoped closing36PASS. Independent whole-phase review followsTask7; master reviewed total stays48. No live mail/provider activation.

### Task 3: Add granular share links and registered-user shares

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/sharing/share-service.ts`
- Create: `packages/domain/src/sharing/share-service.test.ts`
- Create: `packages/contracts/src/sharing.ts`
- Create: `apps/web/src/app/share/[token]/page.tsx`

**Interfaces:**
- Produces: `createShare`, `resolveShare`, `revokeShare`.

- [x] **Step 1: Write failing expiry/default-scope tests**

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

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/sharing/share-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement share model**

Targets: collection, node, or item. Recipient: public token or registered user. Options: expiry, PIN hash, images, values, selected document IDs, export permission. Store token hash only.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/sharing`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/sharing packages/contracts/src/sharing.ts apps/web/src/app/share
git commit -m "feat: add granular collection and item shares"
```

---

Implementation verified: minimal read-only collection/node/item grants, hash-only tokens, persistent PIN budget and short-lived access sessions, exact selected-field projection, actual before/after-I/O protected delivery, explicit bounded JSON export, same-origin/fresh-session API and DE/EN responsive viewer. Whole functional source:1029native/91files,1542regular,workspace production build/lint and7actual-built browser/cookie journeysPASS. Final focused22PASS adds an actual image-byte witness after the full native checkpoint. Independent whole-phase review followsTask7; reviewed total stays48. No application merge/deployment/provider activation.

### Task 4: Add append-only audit events

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/audit/audit-service.ts`
- Create: `packages/domain/src/audit/audit-service.test.ts`

**Interfaces:**
- Produces: `recordAuditEvent`, `listAuditEventsForResource`.

- [x] **Step 1: Write failing source/actor test**

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

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/audit/audit-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement audit model**

Source enum: `USER`, `IMPORT`, `AI`, `MARKET_SYNC`, `SYSTEM`, `MODERATION`. Store sanitized before/after JSON only for fields allowed by the event definition; never dump auth tokens or document bytes.

- [x] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name audit_events
pnpm vitest run packages/domain/src/audit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/audit
git commit -m "feat: add append-only audit events"
```

---

Implementation verified: actual current-owner scoped append-only history, actor/source/strict snapshots, original-actor erasure, stable item/collection/location anchors, real caller-transaction rollback, bounded bigint paging and locked foreign-resource privacy.1042native/92files,1542regular,types/lint/full build and7actual compiled browser regression casesPASS. Core producer wiring and further event definitions remainTask5, restorationTask6 and UI/API listingTask7. Independent whole-phase review pending; master reviewed48 unchanged.

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

---

### Task 7: Add collaboration, sharing, and audit UI

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/collections/[collectionId]/members/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/collections/[collectionId]/sharing/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/audit/page.tsx`
- Create: `apps/web/src/components/sharing/share-permissions-editor.tsx`
- Create: `apps/web/e2e/collaboration-sharing.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: invitation/membership/share/audit APIs.
- Produces: role management, invite acceptance, granular link sharing, revocation, audit history, supported restore UI.

- [ ] **Step 1: Write failing revoked-share E2E**

```ts
test("revoking a share invalidates the existing public link immediately", async ({ page, context }) => {
  const url = await createShareInUi(page, { images: true, values: false });
  const guest = await context.newPage();
  await guest.goto(url);
  await expect(guest.getByText(seedItemTitle)).toBeVisible();
  await revokeShareInUi(page);
  await guest.reload();
  await expect(guest.getByText(seedItemTitle)).not.toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/collaboration-sharing.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Role controls hide impossible transitions but still rely on server policy. Sharing editor starts with safe defaults, supports expiry/PIN/selected documents/export scope, and visibly distinguishes member access from share access. Audit restore shows conflict errors rather than overwriting newer data.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/collaboration-sharing.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add collaboration sharing and audit UI"
```
