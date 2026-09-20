import { describe, expect, it } from "vitest";

import { createCollectionService } from "./collection-service";

describe("collection service", () => {
  it("creates a private collection for the trusted actor by default", async () => {
    const created: Array<Record<string, unknown>> = [];
    const database = {
      collection: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return {
            id: "00000000-0000-4000-8000-000000000010",
            name: data.name,
            visibility: data.visibility,
          };
        },
      },
      $transaction: async () => undefined as never,
    };
    const service = createCollectionService(database, "trusted-user-id");

    await expect(service.createCollection({ name: "  Münzen  " })).resolves.toEqual({
      id: "00000000-0000-4000-8000-000000000010",
      name: "Münzen",
      visibility: "PRIVATE",
    });
    expect(created).toEqual([
      { ownerId: "trusted-user-id", name: "Münzen", visibility: "PRIVATE" },
    ]);
  });

  it("rejects moving a node below its own descendant", async () => {
    const parentId = "00000000-0000-4000-8000-000000000001";
    const childId = "00000000-0000-4000-8000-000000000002";
    const transaction = {
      collection: {
        findUnique: async () => ({ id: "00000000-0000-4000-8000-000000000010" }),
      },
      collectionNode: {
        findUnique: async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          collectionId: "00000000-0000-4000-8000-000000000010",
        }),
        updateMany: async () => ({ count: 1 }),
      },
      $queryRaw: async () => [{ id: childId }],
    };
    const database = {
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
        operation(transaction),
    };
    const service = createCollectionService(database, "owner-user-id");

    await expect(service.moveNode(parentId, { parentId: childId })).rejects.toMatchObject({
      code: "COLLECTION_HIERARCHY_CYCLE",
    });
  });

  it("creates a private node only below a parent in the actor's collection", async () => {
    const collectionId = "00000000-0000-4000-8000-000000000010";
    const parentId = "00000000-0000-4000-8000-000000000001";
    const created: Array<Record<string, unknown>> = [];
    const transaction = {
      collection: { findUnique: async () => ({ id: collectionId }) },
      collectionNode: {
        findUnique: async () => ({ id: parentId, collectionId }),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "00000000-0000-4000-8000-000000000002", ...data };
        },
        updateMany: async () => ({ count: 1 }),
      },
      $queryRaw: async () => [{ id: collectionId }],
    };
    const database = {
      collection: { create: async () => undefined as never },
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
        operation(transaction),
    };
    const service = createCollectionService(database, "trusted-user-id");

    await expect(
      service.createCollectionNode({ collectionId, parentId, name: "  Antike  " }),
    ).resolves.toEqual({
      id: "00000000-0000-4000-8000-000000000002",
      collectionId,
      parentId,
      name: "Antike",
      visibility: "PRIVATE",
    });
    expect(created).toEqual([
      { collectionId, parentId, name: "Antike", visibility: "PRIVATE" },
    ]);
  });

  it("rejects a parent from another collection without exposing it", async () => {
    const collectionId = "00000000-0000-4000-8000-000000000010";
    const foreignParentId = "00000000-0000-4000-8000-000000000099";
    const transaction = {
      collectionNode: {
        findUnique: async () => ({
          id: foreignParentId,
          collectionId: "00000000-0000-4000-8000-000000000020",
        }),
        create: async () => undefined as never,
        updateMany: async () => ({ count: 0 }),
      },
      $queryRaw: async () => [{ id: collectionId }],
    };
    const database = {
      collection: { create: async () => undefined as never },
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
        operation(transaction),
    };
    const service = createCollectionService(database, "trusted-user-id");

    await expect(
      service.createCollectionNode({ collectionId, parentId: foreignParentId, name: "Wrong" }),
    ).rejects.toMatchObject({
      code: "COLLECTION_NODE_NOT_FOUND",
      message: "Collection node not found",
    });
  });
});
