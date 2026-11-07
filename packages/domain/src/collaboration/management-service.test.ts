import { createMembershipService } from "./membership-service";
import { createItemService } from "../items/item-service";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCollaborationManagementService } from "./management-service";
import { createRestoreService } from "../audit/restore-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "owned collaboration management projections",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("lists safe owner setup and treats durable trash revocations as revoked without returning hashes or private content", async () => {
      const owner = randomUUID(),
        outsider = randomUUID();
      for (const id of [owner, outsider])
        await db.user.create({
          data: {
            id,
            name: "Own management fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Managed collection" },
        }),
        item = await db.collectibleItem.create({
          data: {
            ownerId: owner,
            collectionId: c.id,
            title: "Chosen item",
            privateNotes: "never-management-private-notes",
          },
        }),
        tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
      await db.collectionShare.create({
        data: {
          collectionId: c.id,
          creatorUserId: owner,
          targetKind: "ITEM",
          targetId: item.id,
          tokenHash,
          permissions: { readOnly: true },
        },
      });
      const service = createCollaborationManagementService(db),
        initial = await service.getSharingSetup({ userId: owner }, { collectionId: c.id });
      expect(initial.collection).toMatchObject({ id: c.id, name: c.name, revision: 0 });
      expect(initial.targets.items).toContainEqual({ id: item.id, name: item.title });
      expect(initial.shares[0]).toMatchObject({
        revoked: false,
        target: { kind: "ITEM", id: item.id },
      });
      expect(JSON.stringify(initial)).not.toMatch(
        new RegExp(`${tokenHash}|never-management-private-notes|tokenHash|storageKey`),
      );
      await createRestoreService(db).softDeleteItem({ userId: owner }, { itemId: item.id });
      expect(
        (await service.getSharingSetup({ userId: owner }, { collectionId: c.id })).shares[0],
      ).toMatchObject({ revoked: true });
      await expect(
        service.getSharingSetup({ userId: outsider }, { collectionId: c.id }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    });
    it("shows member names only inside current membership and transfers the global history to the actual new owner", async () => {
      const owner = randomUUID(),
        next = randomUUID(),
        outsider = randomUUID();
      for (const id of [owner, next, outsider])
        await db.user.create({
          data: {
            id,
            name: id === next ? "New named owner" : "Management user",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Transferred management history" },
        }),
        item = await createItemService(db, owner).createItem({
          collectionId: c.id,
          title: "History follows current ownership",
        }),
        members = createMembershipService(db),
        service = createCollaborationManagementService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: next, role: "EDITOR", expectedRevision: 0 },
      );
      expect(await service.getMemberDirectory({ userId: next }, c.id)).toMatchObject({
        actorRole: "EDITOR",
        members: expect.arrayContaining([
          expect.objectContaining({ userId: next, name: "New named owner", role: "EDITOR" }),
        ]),
      });
      await expect(service.getMemberDirectory({ userId: outsider }, c.id)).rejects.toMatchObject({
        code: "MEMBERSHIP_NOT_FOUND",
      });
      await expect(
        service.getSharingSetup({ userId: next }, { collectionId: c.id }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
      expect((await service.getAuditOverview({ userId: owner }, {})).events).toContainEqual(
        expect.objectContaining({ resourceId: item.id, action: "ITEM_CREATED" }),
      );
      await members.transferOwnership(
        { userId: owner },
        { collectionId: c.id, newOwnerId: next, expectedRevision: 1, confirmPrivateTransfer: true },
      );
      expect((await service.getAuditOverview({ userId: owner }, {})).events).not.toContainEqual(
        expect.objectContaining({ resourceId: item.id }),
      );
      expect((await service.getAuditOverview({ userId: next }, {})).events).toContainEqual(
        expect.objectContaining({ resourceId: item.id, actorId: owner, resourceName: item.title }),
      );
      expect((await service.getMemberDirectory({ userId: owner }, c.id)).actorRole).toBe("ADMIN");
    });

    it("opens shared metadata for current members without disclosing private notes or money and closes after removal", async () => {
      const owner = randomUUID(),
        member = randomUUID();
      for (const id of [owner, member])
        await db.user.create({
          data: {
            id,
            name: "Own workspace reader",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Current shared workspace" },
        }),
        item = await db.collectibleItem.create({
          data: {
            ownerId: owner,
            collectionId: c.id,
            title: "Shared metadata only",
            privateNotes: "workspace-private-sentinel",
            purchaseAmountMinor: 12345n,
            purchaseCurrency: "EUR",
          },
        }),
        members = createMembershipService(db),
        service = createCollaborationManagementService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: member, role: "VIEWER", expectedRevision: 0 },
      );
      expect(
        (await service.getSharedCollections({ userId: member }, {})).collections,
      ).toContainEqual(expect.objectContaining({ id: c.id, role: "VIEWER" }));
      const view = await service.getWorkspace({ userId: member }, { collectionId: c.id });
      expect(view).toMatchObject({
        actorRole: "VIEWER",
        items: expect.arrayContaining([
          expect.objectContaining({ id: item.id, title: item.title }),
        ]),
      });
      expect(JSON.stringify(view)).not.toMatch(
        /workspace-private-sentinel|privateNotes|purchaseAmountMinor|purchaseCurrency/,
      );
      await members.removeMember(
        { userId: owner },
        { collectionId: c.id, userId: member, expectedRevision: 1 },
      );
      await expect(
        service.getWorkspace({ userId: member }, { collectionId: c.id }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
      expect((await service.getSharedCollections({ userId: member }, {})).collections).toEqual([]);
    });
  },
);
