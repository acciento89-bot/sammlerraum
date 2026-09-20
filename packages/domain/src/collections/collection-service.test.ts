import { randomUUID } from "node:crypto";

import { createPrismaClient } from "@sammlerraum/db/create-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCollectionService, type CollectionDatabase } from "./collection-service";

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
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "trusted-user-id",
    );

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
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "owner-user-id",
    );

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
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "trusted-user-id",
    );

    await expect(
      service.createCollectionNode({ collectionId, parentId, name: "  Antike  " }),
    ).resolves.toEqual({
      id: "00000000-0000-4000-8000-000000000002",
      collectionId,
      parentId,
      name: "Antike",
      visibility: "PRIVATE",
    });
    expect(created).toEqual([{ collectionId, parentId, name: "Antike", visibility: "PRIVATE" }]);
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
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "trusted-user-id",
    );

    await expect(
      service.createCollectionNode({ collectionId, parentId: foreignParentId, name: "Wrong" }),
    ).rejects.toMatchObject({
      code: "COLLECTION_NODE_NOT_FOUND",
      message: "Collection node not found",
    });
  });

  it("rejects malformed input before persistence and unauthorized collections before node writes", async () => {
    let collectionCreates = 0;
    let nodeCreates = 0;
    const transaction = {
      collectionNode: {
        findUnique: async () => null,
        create: async () => {
          nodeCreates += 1;
          return undefined as never;
        },
        updateMany: async () => ({ count: 0 }),
      },
      $queryRaw: async () => [],
    };
    const database = {
      collection: {
        create: async () => {
          collectionCreates += 1;
          return undefined as never;
        },
      },
      $queryRaw: async () => [],
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
        operation(transaction),
    };
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "trusted-user-id",
    );

    await expect(service.createCollection({ name: "   " })).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      service.createCollectionNode({
        collectionId: "00000000-0000-4000-8000-000000000010",
        name: "Nicht erlaubt",
      }),
    ).rejects.toMatchObject({ code: "COLLECTION_NOT_FOUND" });
    await expect(
      service.moveCollectionNode("not-a-uuid", { parentId: null }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(collectionCreates).toBe(0);
    expect(nodeCreates).toBe(0);
  });

  it("returns the collection root and full node path with the strictest visibility", async () => {
    const collectionId = "00000000-0000-4000-8000-000000000010";
    const nodeId = "00000000-0000-4000-8000-000000000003";
    const database = {
      collection: { create: async () => undefined as never },
      $queryRaw: async () => [
        {
          collectionVisibility: "PUBLIC",
          nodeId: "00000000-0000-4000-8000-000000000001",
          parentId: null,
          nodeCollectionId: collectionId,
          nodeVisibility: "UNLISTED",
          cycle: false,
          depth: 2,
        },
        {
          collectionVisibility: "PUBLIC",
          nodeId: "00000000-0000-4000-8000-000000000002",
          parentId: "00000000-0000-4000-8000-000000000001",
          nodeCollectionId: collectionId,
          nodeVisibility: "PUBLIC",
          cycle: false,
          depth: 1,
        },
        {
          collectionVisibility: "PUBLIC",
          nodeId,
          parentId: "00000000-0000-4000-8000-000000000002",
          nodeCollectionId: collectionId,
          nodeVisibility: "PRIVATE",
          cycle: false,
          depth: 0,
        },
      ],
      $transaction: async () => undefined as never,
    };
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "trusted-user-id",
    );

    await expect(service.getAncestorVisibility(collectionId, nodeId)).resolves.toEqual({
      visibilityPath: ["PUBLIC", "UNLISTED", "PUBLIC", "PRIVATE"],
      effectiveVisibility: "PRIVATE",
    });
  });

  it("does not claim public visibility when an ancestor is unlisted", async () => {
    const collectionId = "00000000-0000-4000-8000-000000000010";
    const nodeId = "00000000-0000-4000-8000-000000000001";
    const database = {
      collection: { create: async () => undefined as never },
      $queryRaw: async () => [
        {
          collectionVisibility: "PUBLIC",
          nodeId,
          parentId: null,
          nodeCollectionId: collectionId,
          nodeVisibility: "UNLISTED",
          cycle: false,
          depth: 0,
        },
      ],
      $transaction: async () => undefined as never,
    };
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "trusted-user-id",
    );

    await expect(service.getAncestorVisibility(collectionId, nodeId)).resolves.toEqual({
      visibilityPath: ["PUBLIC", "UNLISTED"],
      effectiveVisibility: "UNLISTED",
    });
  });

  it("returns root visibility when no collection node applies", async () => {
    const collectionId = "00000000-0000-4000-8000-000000000010";
    const database = {
      collection: { create: async () => undefined as never },
      $queryRaw: async () => [
        {
          collectionVisibility: "PUBLIC",
          nodeId: null,
          parentId: null,
          nodeCollectionId: null,
          nodeVisibility: null,
          cycle: null,
          depth: null,
        },
      ],
      $transaction: async () => undefined as never,
    };
    const service = createCollectionService(
      database as unknown as CollectionDatabase,
      "trusted-user-id",
    );

    await expect(service.getAncestorVisibility(collectionId, null)).resolves.toEqual({
      visibilityPath: ["PUBLIC"],
      effectiveVisibility: "PUBLIC",
    });
  });

  it("fails closed for missing, cyclic, cross-collection, or broken ancestry", async () => {
    const collectionId = "00000000-0000-4000-8000-000000000010";
    const nodeId = "00000000-0000-4000-8000-000000000001";
    const rootOnly = {
      collectionVisibility: "PUBLIC",
      nodeId: null,
      parentId: null,
      nodeCollectionId: null,
      nodeVisibility: null,
      cycle: null,
      depth: null,
    };
    const cases = [
      { rows: [], code: "COLLECTION_NOT_FOUND" },
      { rows: [rootOnly], code: "COLLECTION_NODE_NOT_FOUND" },
      {
        rows: [
          {
            ...rootOnly,
            nodeId,
            nodeCollectionId: collectionId,
            nodeVisibility: "PUBLIC",
            cycle: true,
            depth: 1,
          },
        ],
        code: "COLLECTION_HIERARCHY_INVALID",
      },
      {
        rows: [
          {
            ...rootOnly,
            nodeId,
            nodeCollectionId: "00000000-0000-4000-8000-000000000099",
            nodeVisibility: "PUBLIC",
            cycle: false,
            depth: 0,
          },
        ],
        code: "COLLECTION_HIERARCHY_INVALID",
      },
      {
        rows: [
          {
            ...rootOnly,
            nodeId,
            parentId: "00000000-0000-4000-8000-000000000099",
            nodeCollectionId: collectionId,
            nodeVisibility: "PUBLIC",
            cycle: false,
            depth: 0,
          },
        ],
        code: "COLLECTION_HIERARCHY_INVALID",
      },
    ];

    for (const fixture of cases) {
      const database = {
        collection: { create: async () => undefined as never },
        $queryRaw: async () => fixture.rows,
        $transaction: async () => undefined as never,
      };
      const service = createCollectionService(
        database as unknown as CollectionDatabase,
        "trusted-user-id",
      );
      await expect(service.getAncestorVisibility(collectionId, nodeId)).rejects.toMatchObject({
        code: fixture.code,
      });
    }
  });
});

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;

describe.runIf(runIntegration)("collection service PostgreSQL integration", () => {
  beforeAll(async () => prisma?.$connect());
  afterAll(async () => prisma?.$disconnect());

  async function createOwner() {
    const userId = randomUUID();
    await prisma!.user.create({
      data: {
        id: userId,
        name: "Sammler",
        email: `${userId}@example.test`,
        emailVerified: true,
      },
    });
    return userId;
  }

  it("executes the recursive descendant CTE and rejects a real hierarchy cycle", async () => {
    const userId = await createOwner();
    const service = createCollectionService(prisma! as unknown as CollectionDatabase, userId);
    try {
      const collection = await service.createCollection({ name: "Münzen" });
      const parent = await service.createCollectionNode({
        collectionId: collection.id,
        name: "Antike",
      });
      const child = await service.createCollectionNode({
        collectionId: collection.id,
        parentId: parent.id,
        name: "Rom",
      });

      await expect(
        service.moveCollectionNode(parent.id, { parentId: child.id }),
      ).rejects.toMatchObject({ code: "COLLECTION_HIERARCHY_CYCLE" });
      await expect(service.getAncestorVisibility(collection.id, child.id)).resolves.toEqual({
        visibilityPath: ["PRIVATE", "PRIVATE", "PRIVATE"],
        effectiveVisibility: "PRIVATE",
      });
    } finally {
      await prisma!.user.delete({ where: { id: userId } });
    }
  });

  it("rejects a foreign parent before the composite same-collection constraint is reached", async () => {
    const userId = await createOwner();
    const service = createCollectionService(prisma! as unknown as CollectionDatabase, userId);
    try {
      const first = await service.createCollection({ name: "Erste" });
      const second = await service.createCollection({ name: "Zweite" });
      const foreignParent = await service.createCollectionNode({
        collectionId: second.id,
        name: "Fremd",
      });

      await expect(
        service.createCollectionNode({
          collectionId: first.id,
          parentId: foreignParent.id,
          name: "Ungültig",
        }),
      ).rejects.toMatchObject({ code: "COLLECTION_NODE_NOT_FOUND" });
      expect(await prisma!.collectionNode.count({ where: { collectionId: first.id } })).toBe(0);
      await expect(
        prisma!.collectionNode.create({
          data: {
            collectionId: first.id,
            parentId: foreignParent.id,
            name: "Bypass",
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
    } finally {
      await prisma!.user.delete({ where: { id: userId } });
    }
  });

  it("reads root and full ancestry without treating unlisted as public", async () => {
    const userId = await createOwner();
    const service = createCollectionService(prisma! as unknown as CollectionDatabase, userId);
    try {
      const collection = await service.createCollection({
        name: "Öffentlich",
        visibility: "PUBLIC",
      });
      const unlisted = await service.createCollectionNode({
        collectionId: collection.id,
        name: "Nur Link",
        visibility: "UNLISTED",
      });
      const publicChild = await service.createCollectionNode({
        collectionId: collection.id,
        parentId: unlisted.id,
        name: "Öffentliches Kind",
        visibility: "PUBLIC",
      });

      await expect(service.getAncestorVisibility(collection.id, publicChild.id)).resolves.toEqual({
        visibilityPath: ["PUBLIC", "UNLISTED", "PUBLIC"],
        effectiveVisibility: "UNLISTED",
      });
    } finally {
      await prisma!.user.delete({ where: { id: userId } });
    }
  });

  it("serializes concurrent inverse moves on the collection row", async () => {
    const userId = await createOwner();
    const service = createCollectionService(prisma! as unknown as CollectionDatabase, userId);
    try {
      const collection = await service.createCollection({ name: "Parallel" });
      const first = await service.createCollectionNode({
        collectionId: collection.id,
        name: "A",
      });
      const second = await service.createCollectionNode({
        collectionId: collection.id,
        name: "B",
      });

      const results = await Promise.allSettled([
        service.moveCollectionNode(first.id, { parentId: second.id }),
        service.moveCollectionNode(second.id, { parentId: first.id }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toMatchObject([
        { reason: { code: "COLLECTION_HIERARCHY_CYCLE" } },
      ]);
      await expect(service.getAncestorVisibility(collection.id, first.id)).resolves.toBeDefined();
      await expect(service.getAncestorVisibility(collection.id, second.id)).resolves.toBeDefined();
    } finally {
      await prisma!.user.delete({ where: { id: userId } });
    }
  });
});
