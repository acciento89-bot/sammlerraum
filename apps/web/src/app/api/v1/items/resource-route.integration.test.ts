import { randomUUID } from "node:crypto";

import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCollectionRouteHandlers,
  createItemRouteHandlers,
} from "../../../../lib/collection-item-routes";
import { createManagementRouteDependencies } from "../../../../lib/management-route-dependencies";

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const prisma = runIntegration ? createTestDatabaseClient() : undefined;

describe.runIf(runIntegration)("collection/item route PostgreSQL integration", () => {
  beforeAll(async () => prisma?.$connect());
  afterAll(async () => prisma?.$disconnect());

  it("loads trusted ancestry and enforces soft deletion through real handlers and services", async () => {
    const cleanup: string[] = [];
    try {
      const ownerId = randomUUID();
      await prisma!.user.create({
        data: {
          id: ownerId,
          name: "Route owner",
          email: `${ownerId}@example.test`,
          emailVerified: true,
        },
      });
      cleanup.push(ownerId);

      const collection = await prisma!.collection.create({
        data: { ownerId, name: "Public cards", visibility: "PUBLIC" },
      });
      const privateRoot = await prisma!.collectionNode.create({
        data: { collectionId: collection.id, name: "Private root", visibility: "PRIVATE" },
      });
      const publicChild = await prisma!.collectionNode.create({
        data: {
          collectionId: collection.id,
          parentId: privateRoot.id,
          name: "Public child",
          visibility: "PUBLIC",
        },
      });
      const item = await prisma!.collectibleItem.create({
        data: {
          collectionId: collection.id,
          ownerId,
          nodeId: publicChild.id,
          title: "Hidden card",
          privateNotes: "owner only",
          visibility: "PUBLIC",
        },
      });

      let session: { user: { id: string } } | null = null;
      const dependencies = createManagementRouteDependencies(
        prisma!,
        { api: { getSession: async () => session } },
        "https://sammlerraum.example",
      );
      const itemHandlers = createItemRouteHandlers(dependencies);
      const collectionHandlers = createCollectionRouteHandlers(dependencies);

      const hidden = await itemHandlers.GET_ITEM(
        new Request(`https://sammlerraum.example/api/v1/items/${item.id}`),
        item.id,
      );
      expect(hidden.status).toBe(404);

      await prisma!.collectionNode.update({
        where: { id: privateRoot.id },
        data: { visibility: "UNLISTED" },
      });
      const unlisted = await itemHandlers.GET_ITEM(
        new Request(`https://sammlerraum.example/api/v1/items/${item.id}`),
        item.id,
      );
      expect(unlisted.status).toBe(404);

      session = { user: { id: ownerId } };
      const ownerRead = await itemHandlers.GET_ITEM(
        new Request(`https://sammlerraum.example/api/v1/items/${item.id}`),
        item.id,
      );
      expect(ownerRead.status).toBe(200);
      await expect(ownerRead.json()).resolves.toMatchObject({
        item: { id: item.id, privateNotes: "owner only" },
      });

      const deleted = await itemHandlers.DELETE_ITEM(
        new Request(`https://sammlerraum.example/api/v1/items/${item.id}`, {
          method: "DELETE",
          headers: { origin: "https://sammlerraum.example" },
        }),
        item.id,
      );
      expect(deleted.status).toBe(204);
      session = null;
      await expect(
        itemHandlers.GET_ITEM(
          new Request(`https://sammlerraum.example/api/v1/items/${item.id}`),
          item.id,
        ),
      ).resolves.toMatchObject({ status: 404 });

      const remaining = await dependencies.createItemService(ownerId).createItem({
        collectionId: collection.id,
        title: "Preserved in trash",
      });
      session = { user: { id: ownerId } };
      const collectionDelete = await collectionHandlers.DELETE_COLLECTION(
        new Request(`https://sammlerraum.example/api/v1/collections/${collection.id}`, {
          method: "DELETE",
          headers: { origin: "https://sammlerraum.example" },
        }),
        collection.id,
      );
      expect(collectionDelete.status).toBe(204);
      expect(
        await prisma!.collectibleItem.findUnique({ where: { id: remaining.id } }),
      ).not.toBeNull();
      await expect(
        dependencies.createItemService(ownerId).updateItem(remaining.id, { title: "bypass" }),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
      await expect(dependencies.loadCollection(collection.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    } finally {
      await prisma!.user.deleteMany({ where: { id: { in: cleanup } } });
    }
  });
});
