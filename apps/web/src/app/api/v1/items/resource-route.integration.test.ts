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

      const customFields = dependencies.createCustomFieldService(ownerId);
      const decimalCases = [
        {
          definition: await customFields.createFieldDefinition({
            collectionId: collection.id,
            name: "Tiny decimal",
            type: "DECIMAL",
          }),
          value: "0.0000001",
        },
        {
          definition: await customFields.createFieldDefinition({
            collectionId: collection.id,
            name: "Precise decimal",
            type: "DECIMAL",
          }),
          value: "99999999999999999999.999999999999999999",
        },
      ];
      for (const decimalCase of decimalCases) {
        await customFields.setFieldValue(item.id, decimalCase.definition.id, decimalCase.value);
      }
      const decimalRead = await itemHandlers.GET_ITEM(
        new Request(`https://sammlerraum.example/api/v1/items/${item.id}`),
        item.id,
      );
      const decimalBody = (await decimalRead.json()) as {
        metadata: {
          customFieldValues: Array<{ fieldDefinitionId: string; value: unknown }>;
        };
      };
      for (const decimalCase of decimalCases) {
        const returned = decimalBody.metadata.customFieldValues.find(
          (value) => value.fieldDefinitionId === decimalCase.definition.id,
        );
        expect(returned?.value).toBe(decimalCase.value);
        await expect(
          customFields.setFieldValue(item.id, decimalCase.definition.id, returned?.value),
        ).resolves.toMatchObject({ value: decimalCase.value });
      }

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

  it("splits a populated item and preserves owner metadata, location count, and typed values", async () => {
    const ownerId = randomUUID();
    await prisma!.user.create({
      data: {
        id: ownerId,
        name: "Split owner",
        email: `${ownerId}@example.test`,
        emailVerified: true,
      },
    });
    try {
      const collection = await prisma!.collection.create({
        data: { ownerId, name: "Split collection" },
      });
      const dependencies = createManagementRouteDependencies(
        prisma!,
        { api: { getSession: async () => ({ user: { id: ownerId } }) } },
        "https://sammlerraum.example",
      );
      const handlers = createItemRouteHandlers(dependencies);
      const item = await dependencies.createItemService(ownerId).createItem({
        collectionId: collection.id,
        title: "Interchangeable stamps",
        quantity: 10,
        purchaseAmountMinor: 299,
        purchaseCurrency: "EUR",
      });
      await dependencies
        .createIdentifierService(ownerId)
        .setItemIdentifiers(item.id, [{ type: "EAN", value: "0012345678905" }]);
      await dependencies.createTagService(ownerId).setItemTags(item.id, ["Numbered"]);
      const fields = dependencies.createCustomFieldService(ownerId);
      const decimal = await fields.createFieldDefinition({
        collectionId: collection.id,
        name: "Precision",
        type: "DECIMAL",
      });
      const money = await fields.createFieldDefinition({
        collectionId: collection.id,
        name: "Value",
        type: "MONEY",
      });
      const multi = await fields.createFieldDefinition({
        collectionId: collection.id,
        name: "Features",
        type: "MULTI_SELECT",
        options: ["Signed", "Numbered"],
      });
      await fields.setFieldValue(item.id, decimal.id, "99999999999999999999.999999999999999999");
      await fields.setFieldValue(item.id, money.id, { amountMinor: 12005, currency: "EUR" });
      await fields.setFieldValue(item.id, multi.id, ["Numbered", "Signed"]);
      const location = await dependencies
        .createLocationService(ownerId)
        .createLocation({ name: "Drawer" });
      await dependencies.createLocationService(ownerId).assignItemLocation(item.id, location.id);

      const response = await handlers.SPLIT_ITEM(
        new Request(`https://sammlerraum.example/api/v1/items/${item.id}/split`, {
          method: "POST",
          headers: { origin: "https://sammlerraum.example", "content-type": "application/json" },
          body: JSON.stringify({ quantity: 3 }),
        }),
        item.id,
      );
      expect(response.status).toBe(201);
      const { result } = (await response.json()) as { result: { created: { id: string } } };
      type OwnerRead = {
        item: { quantity: number; purchaseAmountMinor: number };
        metadata: {
          location: { id: string } | null;
          identifiers: Array<{ type: string; value: string }>;
          tags: string[];
          customFieldValues: Array<{ fieldDefinitionId: string; type: string; value: unknown }>;
        };
      };
      const read = async (id: string): Promise<OwnerRead> => {
        const ownerResponse = await handlers.GET_ITEM(
          new Request(`https://sammlerraum.example/api/v1/items/${id}`),
          id,
        );
        expect(ownerResponse.status).toBe(200);
        return ownerResponse.json() as Promise<OwnerRead>;
      };
      const [source, created] = await Promise.all([read(item.id), read(result.created.id)]);
      expect([source.item.quantity, created.item.quantity]).toEqual([7, 3]);
      expect(source.item.purchaseAmountMinor).toBe(299);
      expect(created.item.purchaseAmountMinor).toBe(299);
      expect(created.metadata.location?.id).toBe(location.id);
      expect(
        created.metadata.identifiers.map(({ type, value }: { type: string; value: string }) => ({
          type,
          value,
        })),
      ).toEqual(
        source.metadata.identifiers.map(({ type, value }: { type: string; value: string }) => ({
          type,
          value,
        })),
      );
      expect(created.metadata.tags).toEqual(source.metadata.tags);
      expect(created.metadata.customFieldValues).toEqual(source.metadata.customFieldValues);
      expect(created.metadata.customFieldValues).toEqual(
        expect.arrayContaining([
          {
            fieldDefinitionId: decimal.id,
            type: "DECIMAL",
            value: "99999999999999999999.999999999999999999",
          },
          {
            fieldDefinitionId: money.id,
            type: "MONEY",
            value: { amountMinor: 12005, currency: "EUR" },
          },
          { fieldDefinitionId: multi.id, type: "MULTI_SELECT", value: ["Numbered", "Signed"] },
        ]),
      );
      const rows = await prisma!.collectibleItem.findMany({
        where: { collectionId: collection.id },
      });
      expect(rows.reduce((count, row) => count + row.quantity, 0)).toBe(10);
      expect(
        rows
          .filter((row) => row.storageLocationId === location.id)
          .reduce((count, row) => count + row.quantity, 0),
      ).toBe(10);
      expect(
        await prisma!.itemLocationHistory.findMany({ where: { itemId: result.created.id } }),
      ).toMatchObject([{ fromLocationId: null, toLocationId: location.id, assignedById: ownerId }]);
      expect(
        await prisma!.itemLocationHistory.count({ where: { itemId: result.created.id } }),
      ).toBe(1);
    } finally {
      await prisma!.itemLocationHistory.deleteMany({ where: { assignedById: ownerId } });
      await prisma!.user.delete({ where: { id: ownerId } });
    }
  });
});
