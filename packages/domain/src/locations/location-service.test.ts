import { randomUUID } from "node:crypto";

import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createItemQuery, type ItemQueryDatabase } from "../items/item-query";
import { createLocationService, type LocationDatabase } from "./location-service";

const ownerId = "owner-user";
const locationId = "00000000-0000-4000-8000-000000000001";
const childId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000003";
const collectionId = "00000000-0000-4000-8000-000000000004";

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: locationId,
    parentId: null,
    name: "Living room",
    type: "ROOM",
    visibility: "PRIVATE",
    qrToken: "a".repeat(43),
    ...overrides,
  };
}

describe("location service", () => {
  it("creates a private owner-scoped location with a stable cryptographic token", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: ownerId }]),
      storageLocation: {
        findUnique: vi.fn(),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data);
          return location({ name: data.name, type: data.type, qrToken: data.qrToken });
        }),
      },
    };
    const service = createLocationService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as LocationDatabase,
      ownerId,
    );

    const created = await service.createLocation({ name: "  Living room  ", type: "ROOM" });

    expect(created).toMatchObject({ name: "Living room", visibility: "PRIVATE" });
    expect(created.qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(writes[0]).toMatchObject({ ownerId, parentId: null, visibility: "PRIVATE" });
  });

  it("rejects a storage location hierarchy cycle", async () => {
    const transaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: ownerId }])
        .mockResolvedValueOnce([
          { id: locationId, ownerId, cycle: false },
          { id: childId, ownerId, cycle: false },
        ]),
      storageLocation: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: locationId, ownerId })
          .mockResolvedValueOnce({ id: locationId, ownerId })
          .mockResolvedValueOnce({ id: childId, ownerId }),
        updateMany: vi.fn(),
      },
    };
    const service = createLocationService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as LocationDatabase,
      ownerId,
    );

    await expect(service.moveLocation(locationId, childId)).rejects.toMatchObject({
      code: "LOCATION_HIERARCHY_CYCLE",
    });
    expect(transaction.storageLocation.updateMany).not.toHaveBeenCalled();
  });

  it("assigns a location and appends movement history in one transaction", async () => {
    const calls: string[] = [];
    const transaction = {
      $queryRaw: vi.fn(async () => {
        calls.push("lock-item");
        return [{ id: itemId, ownerId, storageLocationId: null }];
      }),
      storageLocation: {
        findUnique: vi.fn(async () => {
          calls.push("find-location");
          return { id: locationId, ownerId };
        }),
      },
      collectibleItem: {
        updateMany: vi.fn(async () => {
          calls.push("update-item");
          return { count: 1 };
        }),
      },
      itemLocationHistory: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("create-history");
          return { id: childId, movedAt: new Date("2026-09-20T12:00:00.000Z"), ...data };
        }),
      },
    };
    const service = createLocationService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as LocationDatabase,
      ownerId,
    );

    await expect(service.assignItemLocation(itemId, locationId)).resolves.toMatchObject({
      itemId,
      fromLocationId: null,
      toLocationId: locationId,
      assignedById: ownerId,
    });
    expect(calls).toEqual(["lock-item", "find-location", "update-item", "create-history"]);
  });

  it("rolls back the item assignment when history persistence fails", async () => {
    let storedLocation: string | null = null;
    const database = {
      $transaction: async <T>(operation: (tx: Record<string, unknown>) => Promise<T>) => {
        const prior = storedLocation;
        try {
          return await operation({
            $queryRaw: async () => [{ id: itemId, ownerId, storageLocationId: prior }],
            storageLocation: { findUnique: async () => ({ id: locationId, ownerId }) },
            collectibleItem: {
              updateMany: async () => {
                storedLocation = locationId;
                return { count: 1 };
              },
            },
            itemLocationHistory: { create: async () => Promise.reject(new Error("history failed")) },
          });
        } catch (error) {
          storedLocation = prior;
          throw error;
        }
      },
    };
    const service = createLocationService(database as unknown as LocationDatabase, ownerId);

    await expect(service.assignItemLocation(itemId, locationId)).rejects.toThrow("history failed");
    expect(storedLocation).toBeNull();
  });

  it("returns only direct contents of an owned location", async () => {
    const database = {
      storageLocation: {
        findFirst: vi.fn().mockResolvedValue(location()),
        findMany: vi.fn().mockResolvedValue([location({ id: childId, parentId: locationId })]),
      },
      collectibleItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: itemId, title: "Penny Black", quantity: 1, collectionId },
        ]),
      },
    };
    const service = createLocationService(database as unknown as LocationDatabase, ownerId);

    await expect(service.getLocationContents(locationId)).resolves.toMatchObject({
      location: { id: locationId },
      childLocations: [{ id: childId }],
      items: [{ id: itemId, title: "Penny Black" }],
    });
  });
});

describe("public item query", () => {
  it("keeps protected item and storage data out of the public item DTO", async () => {
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: itemId,
          title: "Public stamp",
          publicDescription: "Visible description",
          quantity: 1,
          tradeStatus: "NOT_FOR_TRADE",
          itemVisibility: "PUBLIC",
          ownerId,
          collectionVisibility: "PUBLIC",
          nodeId: null,
          parentId: null,
          nodeVisibility: null,
          cycle: null,
          depth: null,
          privateNotes: "secret",
          storageLocationId: locationId,
          qrToken: "secret-token",
          purchaseAmountMinor: 10_000n,
        },
      ]),
    };
    const itemQuery = createItemQuery(database as unknown as ItemQueryDatabase);

    const dto = await itemQuery.getPublicItem(itemId);

    expect(dto).toEqual({
      id: itemId,
      title: "Public stamp",
      publicDescription: "Visible description",
      quantity: 1,
      tradeStatus: "NOT_FOR_TRADE",
    });
    expect(dto).not.toHaveProperty("storageLocation");
    expect(dto).not.toHaveProperty("storageLocationId");
    expect(dto).not.toHaveProperty("privateNotes");
    expect(dto).not.toHaveProperty("purchaseAmountMinor");
  });

  it.each([
    ["private item", { itemVisibility: "PRIVATE" }],
    ["unlisted collection", { collectionVisibility: "UNLISTED" }],
    ["private ancestor", { nodeVisibility: "PRIVATE", nodeId: childId, parentId: null, depth: 0 }],
    ["missing ancestor", { nodeVisibility: "PUBLIC", nodeId: childId, parentId: locationId, depth: 0 }],
    ["cyclic ancestry", { nodeVisibility: "PUBLIC", nodeId: childId, parentId: null, cycle: true, depth: 0 }],
  ])("fails closed for a %s", async (_label, override) => {
    const row = {
      id: itemId,
      title: "Hidden",
      publicDescription: null,
      quantity: 1,
      tradeStatus: "NOT_FOR_TRADE",
      itemVisibility: "PUBLIC",
      ownerId,
      collectionVisibility: "PUBLIC",
      nodeId: null,
      parentId: null,
      nodeVisibility: null,
      cycle: null,
      depth: null,
      ...override,
    };
    const itemQuery = createItemQuery({
      $queryRaw: async () => [row],
    } as unknown as ItemQueryDatabase);

    await expect(itemQuery.getPublicItem(itemId)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });
});

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createTestDatabaseClient({ databaseUrl }) : undefined;

describe.runIf(runIntegration)("location PostgreSQL integration", () => {
  beforeAll(async () => prisma?.$connect());
  afterAll(async () => prisma?.$disconnect());

  async function createOwner(label: string) {
    const id = randomUUID();
    await prisma!.user.create({
      data: { id, name: label, email: `${id}@example.test`, emailVerified: true },
    });
    return id;
  }

  it("rejects cycles, cross-owner parents, and concurrent inverse moves", async () => {
    const cleanup: string[] = [];
    try {
      const firstOwner = await createOwner("First");
      cleanup.push(firstOwner);
      const secondOwner = await createOwner("Second");
      cleanup.push(secondOwner);
      const service = createLocationService(prisma! as unknown as LocationDatabase, firstOwner);
      const other = createLocationService(prisma! as unknown as LocationDatabase, secondOwner);
      const a = await service.createLocation({ name: "A", type: "ROOM" });
      const b = await service.createLocation({ name: "B", type: "SHELF" });
      const foreign = await other.createLocation({ name: "Foreign", type: "BOX" });

      await expect(service.moveLocation(a.id, a.id)).rejects.toMatchObject({
        code: "LOCATION_HIERARCHY_CYCLE",
      });
      await expect(service.moveLocation(a.id, foreign.id)).rejects.toMatchObject({
        code: "LOCATION_NOT_FOUND",
      });
      await expect(
        prisma!.storageLocation.update({ where: { id: a.id }, data: { parentId: foreign.id } }),
      ).rejects.toBeDefined();

      const results = await Promise.allSettled([
        service.moveLocation(a.id, b.id),
        service.moveLocation(b.id, a.id),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toMatchObject([
        { reason: { code: "LOCATION_HIERARCHY_CYCLE" } },
      ]);
    } finally {
      await prisma!.user.deleteMany({ where: { id: { in: cleanup } } });
    }
  });

  it("enforces ownership and atomically records assignment history", async () => {
    const cleanup: string[] = [];
    try {
      const firstOwner = await createOwner("Owner");
      cleanup.push(firstOwner);
      const secondOwner = await createOwner("Other");
      cleanup.push(secondOwner);
      const collection = await prisma!.collection.create({
        data: { ownerId: firstOwner, name: "Collection" },
      });
      const item = await prisma!.collectibleItem.create({
        data: { collectionId: collection.id, ownerId: firstOwner, title: "Item" },
      });
      const own = createLocationService(prisma! as unknown as LocationDatabase, firstOwner);
      const other = createLocationService(prisma! as unknown as LocationDatabase, secondOwner);
      const ownLocation = await own.createLocation({ name: "Own", type: "CABINET" });
      const foreignLocation = await other.createLocation({ name: "Foreign", type: "BOX" });

      await expect(own.assignItemLocation(item.id, foreignLocation.id)).rejects.toMatchObject({
        code: "LOCATION_NOT_FOUND",
      });
      const history = await own.assignItemLocation(item.id, ownLocation.id);
      await expect(prisma!.collectibleItem.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
        storageLocationId: ownLocation.id,
      });
      await expect(prisma!.itemLocationHistory.findUnique({ where: { id: history.id } })).resolves.toMatchObject({
        itemId: item.id,
        toLocationId: ownLocation.id,
        assignedById: firstOwner,
      });
      await expect(
        prisma!.collectibleItem.update({
          where: { id: item.id },
          data: { storageLocationId: foreignLocation.id },
        }),
      ).rejects.toBeDefined();
    } finally {
      await prisma!.user.deleteMany({ where: { id: { in: cleanup } } });
    }
  });

  it("filters public projections through the complete collection-node ancestry", async () => {
    const cleanup: string[] = [];
    try {
      const id = await createOwner("Public owner");
      cleanup.push(id);
      const collection = await prisma!.collection.create({
        data: { ownerId: id, name: "Public", visibility: "PUBLIC" },
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
      const hidden = await prisma!.collectibleItem.create({
        data: {
          collectionId: collection.id,
          ownerId: id,
          nodeId: publicChild.id,
          title: "Hidden by ancestor",
          visibility: "PUBLIC",
        },
      });
      const visible = await prisma!.collectibleItem.create({
        data: { collectionId: collection.id, ownerId: id, title: "Visible", visibility: "PUBLIC" },
      });
      const query = createItemQuery(prisma! as unknown as ItemQueryDatabase);

      await expect(query.getPublicItem(hidden.id)).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
      await expect(query.getPublicItem(visible.id)).resolves.toEqual({
        id: visible.id,
        title: "Visible",
        publicDescription: null,
        quantity: 1,
        tradeStatus: "NOT_FOR_TRADE",
      });
    } finally {
      await prisma!.user.deleteMany({ where: { id: { in: cleanup } } });
    }
  });
});
