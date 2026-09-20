import { randomUUID } from "node:crypto";

import { createPrismaClient } from "@sammlerraum/db/create-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createItemService, type ItemDatabase } from "./item-service";

const itemId = "00000000-0000-4000-8000-000000000001";
const createdItemId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000010";
const nodeId = "00000000-0000-4000-8000-000000000020";

function itemFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    collectionId,
    nodeId: null,
    title: "Ten identical stamps",
    publicDescription: null,
    privateNotes: null,
    quantity: 10,
    acquisitionType: "PURCHASE",
    acquisitionDate: null,
    purchaseAmountMinor: null,
    purchaseCurrency: null,
    visibility: "PRIVATE",
    tradeStatus: "NOT_FOR_TRADE",
    archivedAt: null,
    disposedAt: null,
    ...overrides,
  };
}

describe("item service", () => {
  it("splits a quantity item without changing total quantity", async () => {
    const transaction = {
      $queryRaw: async () => [itemFixture()],
      collectibleItem: {
        update: async ({ data }: { data: { quantity: number } }) => ({
          ...itemFixture(),
          quantity: data.quantity,
        }),
        create: async ({ data }: { data: { quantity: number } }) => ({
          ...itemFixture({ id: createdItemId }),
          quantity: data.quantity,
        }),
      },
    };
    const database = {
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
        operation(transaction),
    };
    const service = createItemService(database as unknown as ItemDatabase, "owner-user-id");

    const result = await service.splitQuantityItem(itemId, 3);

    expect(result.source.quantity + result.created.quantity).toBe(10);
    expect(result.created.id).not.toBe(result.source.id);
  });

  it("creates a private item for the trusted owner in a node from the same collection", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const transaction = {
      $queryRaw: async () => [{ id: collectionId }],
      collectionNode: {
        findUnique: async () => ({ id: nodeId, collectionId }),
      },
      collectibleItem: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data);
          return itemFixture({
            id: createdItemId,
            nodeId,
            title: data.title,
            publicDescription: data.publicDescription,
            privateNotes: data.privateNotes,
            quantity: data.quantity,
            acquisitionType: data.acquisitionType,
            acquisitionDate: data.acquisitionDate,
            purchaseAmountMinor: data.purchaseAmountMinor,
            purchaseCurrency: data.purchaseCurrency,
            visibility: data.visibility,
            tradeStatus: data.tradeStatus,
          });
        },
      },
    };
    const database = {
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
        operation(transaction),
    };
    const service = createItemService(database as unknown as ItemDatabase, "owner-user-id");

    await expect(
      service.createItem({
        collectionId,
        nodeId,
        title: "  Penny Black  ",
        publicDescription: "  First adhesive stamp  ",
        privateNotes: "  Cabinet drawer 3  ",
        quantity: 2,
        acquisitionType: "PURCHASE",
        acquisitionDate: "2026-02-28",
        purchaseAmountMinor: 12_345,
        purchaseCurrency: "EUR",
      }),
    ).resolves.toMatchObject({
      id: createdItemId,
      title: "Penny Black",
      publicDescription: "First adhesive stamp",
      privateNotes: "Cabinet drawer 3",
      quantity: 2,
      acquisitionDate: "2026-02-28",
      purchaseAmountMinor: 12_345,
      purchaseCurrency: "EUR",
      visibility: "PRIVATE",
      tradeStatus: "NOT_FOR_TRADE",
    });
    expect(writes).toMatchObject([
      {
        collectionId,
        nodeId,
        title: "Penny Black",
        quantity: 2,
        acquisitionDate: new Date("2026-02-28T00:00:00.000Z"),
        purchaseAmountMinor: 12_345n,
        purchaseCurrency: "EUR",
        visibility: "PRIVATE",
        tradeStatus: "NOT_FOR_TRADE",
      },
    ]);
  });

  it("rejects non-canonical dates and invalid or incomplete money before persistence", async () => {
    let transactions = 0;
    const database = {
      $transaction: async () => {
        transactions += 1;
        return undefined as never;
      },
    };
    const service = createItemService(database as unknown as ItemDatabase, "owner-user-id");
    const invalidInputs = [
      { acquisitionDate: "02/28/2026" },
      { acquisitionDate: "2026-02-30" },
      { purchaseAmountMinor: 100 },
      { purchaseCurrency: "EUR" },
      { purchaseAmountMinor: -1, purchaseCurrency: "EUR" },
      { purchaseAmountMinor: Number.MAX_SAFE_INTEGER + 1, purchaseCurrency: "EUR" },
      { purchaseAmountMinor: 100, purchaseCurrency: "eur" },
      { purchaseAmountMinor: 100, purchaseCurrency: "ZZZ" },
    ];

    for (const invalid of invalidInputs) {
      await expect(
        service.createItem({ collectionId, title: "Invalid", ...invalid }),
      ).rejects.toMatchObject({ name: "ZodError" });
    }
    expect(transactions).toBe(0);
  });

  it("does not create for another owner's collection or a node from another collection", async () => {
    let creates = 0;
    const unauthorizedTransaction = {
      $queryRaw: async () => [],
      collectionNode: { findUnique: async () => null },
      collectibleItem: {
        create: async () => {
          creates += 1;
          return itemFixture();
        },
      },
    };
    const foreignNodeTransaction = {
      ...unauthorizedTransaction,
      $queryRaw: async () => [{ id: collectionId }],
      collectionNode: {
        findUnique: async () => ({
          id: nodeId,
          collectionId: "00000000-0000-4000-8000-000000000099",
        }),
      },
    };
    const unauthorized = createItemService(
      {
        $transaction: async <T>(operation: (tx: typeof unauthorizedTransaction) => Promise<T>) =>
          operation(unauthorizedTransaction),
      } as unknown as ItemDatabase,
      "owner-user-id",
    );
    const foreignNode = createItemService(
      {
        $transaction: async <T>(operation: (tx: typeof foreignNodeTransaction) => Promise<T>) =>
          operation(foreignNodeTransaction),
      } as unknown as ItemDatabase,
      "owner-user-id",
    );

    await expect(
      unauthorized.createItem({ collectionId, title: "Secret" }),
    ).rejects.toMatchObject({ code: "COLLECTION_NOT_FOUND", message: "Collection not found" });
    await expect(
      foreignNode.createItem({ collectionId, nodeId, title: "Wrong node" }),
    ).rejects.toMatchObject({ code: "COLLECTION_NODE_NOT_FOUND", message: "Collection node not found" });
    expect(creates).toBe(0);
  });

  it("rejects moving an item to a node in another collection before mutation", async () => {
    let updates = 0;
    const transaction = {
      $queryRaw: async () => [itemFixture()],
      collectionNode: {
        findUnique: async () => ({
          id: nodeId,
          collectionId: "00000000-0000-4000-8000-000000000099",
        }),
      },
      collectibleItem: {
        update: async () => {
          updates += 1;
          return itemFixture();
        },
      },
    };
    const service = createItemService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as ItemDatabase,
      "owner-user-id",
    );

    await expect(service.updateItem(itemId, { nodeId })).rejects.toMatchObject({
      code: "COLLECTION_NODE_NOT_FOUND",
    });
    expect(updates).toBe(0);
  });

  it("archives an active item at the service clock and rejects later mutations", async () => {
    const archivedAt = new Date("2026-09-20T12:34:56.000Z");
    let updates = 0;
    const activeTransaction = {
      $queryRaw: async () => [itemFixture()],
      collectibleItem: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates += 1;
          return itemFixture({ archivedAt: data.archivedAt });
        },
      },
    };
    const archivedTransaction = {
      ...activeTransaction,
      $queryRaw: async () => [itemFixture({ archivedAt })],
    };
    let transaction = activeTransaction;
    const service = createItemService(
      {
        $transaction: async <T>(operation: (tx: typeof activeTransaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as ItemDatabase,
      "owner-user-id",
      { now: () => archivedAt },
    );

    await expect(service.archiveItem(itemId)).resolves.toMatchObject({
      id: itemId,
      archivedAt: "2026-09-20T12:34:56.000Z",
    });
    transaction = archivedTransaction;
    await expect(service.updateItem(itemId, { title: "Too late" })).rejects.toMatchObject({
      code: "ITEM_INACTIVE",
    });
    await expect(service.splitQuantityItem(itemId, 1)).rejects.toMatchObject({
      code: "ITEM_INACTIVE",
    });
    expect(updates).toBe(1);
  });

  it("rejects invalid split counts against the freshly locked quantity", async () => {
    let writes = 0;
    const transaction = {
      $queryRaw: async () => [itemFixture({ quantity: 5 })],
      collectibleItem: {
        update: async () => {
          writes += 1;
          return itemFixture();
        },
        create: async () => {
          writes += 1;
          return itemFixture({ id: createdItemId });
        },
      },
    };
    const service = createItemService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as ItemDatabase,
      "owner-user-id",
    );

    for (const count of [0, -1, 1.5, 5, 6]) {
      await expect(service.splitQuantityItem(itemId, count)).rejects.toMatchObject({
        code: "ITEM_SPLIT_INVALID",
      });
    }
    expect(writes).toBe(0);
  });

  it("preserves total acquisition value by copying a per-unit purchase amount", async () => {
    const original = itemFixture({ quantity: 10, purchaseAmountMinor: 299n, purchaseCurrency: "EUR" });
    const transaction = {
      $queryRaw: async () => [original],
      collectibleItem: {
        update: async ({ data }: { data: { quantity: number } }) => ({
          ...original,
          quantity: data.quantity,
        }),
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...original,
          ...data,
          id: createdItemId,
        }),
      },
    };
    const service = createItemService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as ItemDatabase,
      "owner-user-id",
    );

    const result = await service.splitQuantityItem(itemId, 3);

    expect(result.source.purchaseAmountMinor).toBe(299);
    expect(result.created.purchaseAmountMinor).toBe(299);
    expect(
      result.source.quantity * result.source.purchaseAmountMinor! +
        result.created.quantity * result.created.purchaseAmountMinor!,
    ).toBe(2_990);
  });
});

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;

describe.runIf(runIntegration)("item service PostgreSQL integration", () => {
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

  it("enforces same-collection nodes and owner-only item mutations", async () => {
    const ownerId = await createOwner();
    const otherId = await createOwner();
    const owner = createItemService(prisma! as unknown as ItemDatabase, ownerId);
    const other = createItemService(prisma! as unknown as ItemDatabase, otherId);
    try {
      const collection = await prisma!.collection.create({
        data: { ownerId, name: "Owner collection" },
      });
      const foreignCollection = await prisma!.collection.create({
        data: { ownerId, name: "Foreign node collection" },
      });
      const foreignNode = await prisma!.collectionNode.create({
        data: { collectionId: foreignCollection.id, name: "Foreign node" },
      });
      const item = await owner.createItem({ collectionId: collection.id, title: "Private item" });

      await expect(other.updateItem(item.id, { title: "Stolen" })).rejects.toMatchObject({
        code: "ITEM_NOT_FOUND",
      });
      await expect(owner.updateItem(item.id, { nodeId: foreignNode.id })).rejects.toMatchObject({
        code: "COLLECTION_NODE_NOT_FOUND",
      });
      await expect(
        prisma!.collectibleItem.update({
          where: { id: item.id },
          data: { nodeId: foreignNode.id },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
      await expect(prisma!.collectibleItem.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
        title: "Private item",
        nodeId: null,
      });
    } finally {
      await prisma!.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    }
  });

  it("serializes simultaneous splits against the fresh row quantity", async () => {
    const ownerId = await createOwner();
    const service = createItemService(prisma! as unknown as ItemDatabase, ownerId);
    try {
      const collection = await prisma!.collection.create({
        data: { ownerId, name: "Concurrent quantities" },
      });
      const item = await service.createItem({
        collectionId: collection.id,
        title: "Ten stamps",
        quantity: 10,
        acquisitionType: "PURCHASE",
        purchaseAmountMinor: 299,
        purchaseCurrency: "EUR",
      });

      const results = await Promise.allSettled([
        service.splitQuantityItem(item.id, 6),
        service.splitQuantityItem(item.id, 6),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toMatchObject([
        { reason: { code: "ITEM_SPLIT_INVALID" } },
      ]);
      const rows = await prisma!.collectibleItem.findMany({
        where: { collectionId: collection.id },
        orderBy: { id: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows.reduce((total, row) => total + row.quantity, 0)).toBe(10);
      expect(rows.every((row) => row.quantity > 0)).toBe(true);
      expect(rows.reduce((total, row) => total + BigInt(row.quantity) * row.purchaseAmountMinor!, 0n)).toBe(
        2_990n,
      );
    } finally {
      await prisma!.user.delete({ where: { id: ownerId } });
    }
  });

  it("rolls back the source decrement when creating the split row fails", async () => {
    const ownerId = await createOwner();
    const service = createItemService(prisma! as unknown as ItemDatabase, ownerId);
    try {
      const collection = await prisma!.collection.create({
        data: { ownerId, name: "Rollback" },
      });
      const item = await service.createItem({
        collectionId: collection.id,
        title: "Rollback specimen",
        quantity: 10,
      });
      const failingDatabase = {
        $transaction: async <T>(
          operation: (transaction: Record<string, unknown>) => Promise<T>,
          options: { isolationLevel: "ReadCommitted" },
        ) =>
          prisma!.$transaction(
            async (transaction) =>
              operation({
                ...transaction,
                $queryRaw: transaction.$queryRaw.bind(transaction),
                collectibleItem: {
                  update: transaction.collectibleItem.update.bind(transaction.collectibleItem),
                  create: async () => {
                    throw new Error("fixture split insert failure");
                  },
                },
              }),
            options,
          ),
      };
      const failingService = createItemService(
        failingDatabase as unknown as ItemDatabase,
        ownerId,
      );

      await expect(failingService.splitQuantityItem(item.id, 3)).rejects.toThrow(
        "fixture split insert failure",
      );
      await expect(
        prisma!.collectibleItem.findUnique({ where: { id: item.id } }),
      ).resolves.toMatchObject({ quantity: 10 });
      await expect(
        prisma!.collectibleItem.count({ where: { collectionId: collection.id } }),
      ).resolves.toBe(1);
    } finally {
      await prisma!.user.delete({ where: { id: ownerId } });
    }
  });
});
