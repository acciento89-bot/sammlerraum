import { createCollaborationManagementService } from "./management-service";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMembershipService } from "./membership-service";
import { createCollaborativeCollectionService } from "./collection-authoring-service";
import { createCollectionService } from "../collections/collection-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual Admin collection and hierarchy authoring",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("lets current Admin edit collection and nodes under their own actor, while Editor and Admin deletion remain denied", async () => {
      const owner = randomUUID(),
        admin = randomUUID(),
        editor = randomUUID();
      for (const id of [owner, admin, editor])
        await db.user.create({
          data: {
            id,
            name: "Admin authoring fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Original collection" },
        }),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: admin, role: "ADMIN", expectedRevision: 0 },
      );
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: editor, role: "EDITOR", expectedRevision: 1 },
      );
      const service = createCollaborativeCollectionService(db, admin, c.id);
      await service.updateCollection({ name: "Renamed by actual Admin" });
      const node = await service.createNode({ name: "Admin-created shelf" });
      await service.updateNode(node.id, { name: "Renamed shelf", visibility: "PUBLIC" });
      expect(await db.collection.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
        name: "Renamed by actual Admin",
        ownerId: owner,
      });
      expect(await db.collectionNode.findUniqueOrThrow({ where: { id: node.id } })).toMatchObject({
        name: "Renamed shelf",
        visibility: "PUBLIC",
      });
      expect(
        await db.auditEvent.findFirstOrThrow({
          where: { resourceId: c.id, action: "COLLECTION_DETAILS_CHANGED" },
        }),
      ).toMatchObject({ actorId: admin, source: "USER" });
      expect(
        await db.auditEvent.findFirstOrThrow({
          where: { resourceId: node.id, action: "NODE_CREATED" },
        }),
      ).toMatchObject({ actorId: admin });
      await expect(
        createCollaborativeCollectionService(db, editor, c.id).updateCollection({
          name: "Forbidden Editor name",
        }),
      ).rejects.toThrow();
      await expect(createCollectionService(db, admin).deleteCollection(c.id)).rejects.toThrow();
      expect((await db.collection.findUniqueOrThrow({ where: { id: c.id } })).deletedAt).toBeNull();
    });
    it("rejects stale collection confirmations and current-role withdrawal without touching later state", async () => {
      const owner = randomUUID(),
        admin = randomUUID();
      for (const id of [owner, admin])
        await db.user.create({
          data: {
            id,
            name: "Admin current-version fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Original Admin confirmation" },
        }),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: admin, role: "ADMIN", expectedRevision: 0 },
      );
      const source = createCollaborativeCollectionService(db, admin, c.id),
        workspace = await createCollaborationManagementService(db).getWorkspace(
          { userId: admin },
          { collectionId: c.id },
        ),
        expected = {
          expectedUpdatedAt: workspace.collection.updatedAt,
          expectedLatestSequence: workspace.collection.latestSequence,
        };
      await source.updateCollection({ name: "New Admin name" }, expected);
      await expect(source.createNode({ name: "Stale node" }, expected)).rejects.toMatchObject({
        code: "COLLECTION_EDIT_CONFLICT",
      });
      await members.removeMember(
        { userId: owner },
        { collectionId: c.id, userId: admin, expectedRevision: 1 },
      );
      await expect(source.updateCollection({ name: "Revoked Admin name" })).rejects.toMatchObject({
        code: "COLLECTION_NOT_FOUND",
      });
      expect((await db.collection.findUniqueOrThrow({ where: { id: c.id } })).name).toBe(
        "New Admin name",
      );
      expect(await db.collectionNode.count({ where: { collectionId: c.id } })).toBe(0);
    });
  },
);
