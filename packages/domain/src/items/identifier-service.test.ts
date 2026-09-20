import { randomUUID } from "node:crypto";

import { createPrismaClient } from "@sammlerraum/db/create-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createIdentifierService, type IdentifierDatabase } from "./identifier-service";
import { createTagService, type TagDatabase } from "./tag-service";

const itemId = "00000000-0000-4000-8000-000000000001";
const otherItemId = "00000000-0000-4000-8000-000000000002";

describe("item identifier service", () => {
  it("normalizes EAN values without removing meaningful leading zeroes", async () => {
    let createdIdentifiers: Array<Record<string, string>> = [];
    const createMany = vi.fn(
      async ({ data }: { data: Array<Record<string, string>> }) => {
        createdIdentifiers = data;
        return { count: data.length };
      },
    );
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: itemId }]),
      itemIdentifier: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany,
        findMany: vi.fn(async () =>
          createdIdentifiers.map((row, index) => ({
            id: `00000000-0000-4000-8000-00000000001${index}`,
            ...row,
          })),
        ),
      },
    };
    const database = {
      $transaction: vi.fn(
        async <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
      ),
    };
    const service = createIdentifierService(
      database as unknown as IdentifierDatabase,
      "trusted-owner",
    );

    const saved = await service.setItemIdentifiers(itemId, [
      { type: " ean ", value: " 0123456789012 " },
    ]);

    expect(saved).toMatchObject([
      {
        itemId,
        type: "EAN",
        value: "0123456789012",
        normalizedValue: "0123456789012",
      },
    ]);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          itemId,
          type: "EAN",
          value: "0123456789012",
          normalizedValue: "0123456789012",
        },
      ],
    });
  });

  it("atomically replaces identifiers after locking the owned item", async () => {
    const calls: string[] = [];
    const transaction = {
      $queryRaw: vi.fn().mockImplementation(async () => {
        calls.push("lock");
        return [{ id: itemId }];
      }),
      itemIdentifier: {
        deleteMany: vi.fn().mockImplementation(async () => {
          calls.push("delete");
          return { count: 1 };
        }),
        createMany: vi.fn().mockImplementation(async () => {
          calls.push("create");
          return { count: 1 };
        }),
        findMany: vi.fn().mockImplementation(async () => {
          calls.push("read");
          return [
            {
              id: "00000000-0000-4000-8000-000000000010",
              itemId,
              type: "CERTIFICATE",
              value: "AB-012",
              normalizedValue: "AB-012",
            },
          ];
        }),
      },
    };
    const database = {
      $transaction: vi.fn(
        async <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
      ),
    };
    const service = createIdentifierService(
      database as unknown as IdentifierDatabase,
      "trusted-owner",
    );

    await service.setItemIdentifiers(itemId, [{ type: "certificate", value: "AB-012" }]);

    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(calls).toEqual(["lock", "delete", "create", "read"]);
  });

  it("returns a safe not-found error and performs no writes for another owner's item", async () => {
    const deleteMany = vi.fn();
    const createMany = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      itemIdentifier: {
        deleteMany,
        createMany,
        findMany: vi.fn(),
      },
    };
    const database = {
      $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
        operation(transaction),
    };
    const service = createIdentifierService(
      database as unknown as IdentifierDatabase,
      "trusted-owner",
    );

    await expect(
      service.setItemIdentifiers(itemId, [{ type: "EAN", value: "0123456789012" }]),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND", message: "Item not found" });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("item tag service", () => {
  it("normalizes, de-duplicates, and reuses tags within the trusted owner scope", async () => {
    const upsert = vi.fn(
      async ({ create }: { create: Record<string, string> }) => ({
        id:
          create.normalizedName === "signed"
            ? "00000000-0000-4000-8000-000000000010"
            : "00000000-0000-4000-8000-000000000011",
        ownerId: create.ownerId,
        name: create.name,
        normalizedName: create.normalizedName,
      }),
    );
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: itemId }]),
      tag: { upsert },
      itemTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany,
      },
    };
    const database = {
      $transaction: vi.fn(
        async <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
      ),
    };
    const service = createTagService(database as unknown as TagDatabase, "trusted-owner");

    const saved = await service.setItemTags(itemId, [
      " Signed ",
      "signed",
      "  Mint   Condition ",
    ]);

    expect(saved).toMatchObject([
      { ownerId: "trusted-owner", name: "Signed", normalizedName: "signed" },
      {
        ownerId: "trusted-owner",
        name: "Mint Condition",
        normalizedName: "mint condition",
      },
    ]);
    expect(upsert).toHaveBeenNthCalledWith(1, {
      where: {
        ownerId_normalizedName: {
          ownerId: "trusted-owner",
          normalizedName: "signed",
        },
      },
      create: {
        ownerId: "trusted-owner",
        name: "Signed",
        normalizedName: "signed",
      },
      update: {},
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          itemId,
          tagId: "00000000-0000-4000-8000-000000000010",
        },
        {
          itemId,
          tagId: "00000000-0000-4000-8000-000000000011",
        },
      ],
    });
  });

  it("does not reveal or mutate another owner's item", async () => {
    const deleteMany = vi.fn();
    const upsert = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      tag: { upsert },
      itemTag: { deleteMany, createMany: vi.fn() },
    };
    const service = createTagService(
      {
        $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
          operation(transaction),
      } as unknown as TagDatabase,
      "trusted-owner",
    );

    await expect(service.setItemTags(otherItemId, ["Secret"])).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
      message: "Item not found",
    });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;

describe.runIf(runIntegration)("identifier and tag PostgreSQL integration", () => {
  beforeAll(async () => prisma?.$connect());
  afterAll(async () => prisma?.$disconnect());

  async function createOwnerAndItem(label: string) {
    const ownerId = randomUUID();
    await prisma!.user.create({
      data: {
        id: ownerId,
        name: label,
        email: `${ownerId}@example.test`,
        emailVerified: true,
      },
    });
    const collection = await prisma!.collection.create({
      data: { ownerId, name: `${label} collection` },
    });
    const item = await prisma!.collectibleItem.create({
      data: { collectionId: collection.id, title: `${label} item` },
    });
    return { ownerId, collectionId: collection.id, itemId: item.id };
  }

  it("scopes identifier uniqueness to an item and tags to an owner", async () => {
    const first = await createOwnerAndItem("First");
    const second = await createOwnerAndItem("Second");
    const firstIdentifiers = createIdentifierService(
      prisma! as unknown as IdentifierDatabase,
      first.ownerId,
    );
    const secondIdentifiers = createIdentifierService(
      prisma! as unknown as IdentifierDatabase,
      second.ownerId,
    );
    const firstTags = createTagService(prisma! as unknown as TagDatabase, first.ownerId);
    const secondTags = createTagService(prisma! as unknown as TagDatabase, second.ownerId);
    const sameOwnerItem = await prisma!.collectibleItem.create({
      data: { collectionId: first.collectionId, title: "First owner second item" },
    });

    try {
      await expect(
        firstIdentifiers.setItemIdentifiers(first.itemId, [
          { type: "EAN", value: "0123456789012" },
        ]),
      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);
      await expect(
        secondIdentifiers.setItemIdentifiers(second.itemId, [
          { type: "EAN", value: "0123456789012" },
        ]),
      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);
      await expect(
        firstIdentifiers.setItemIdentifiers(sameOwnerItem.id, [
          { type: "EAN", value: "0123456789012" },
        ]),
      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);

      await firstTags.setItemTags(first.itemId, [" Signed "]);
      await firstTags.setItemTags(sameOwnerItem.id, ["signed"]);
      await secondTags.setItemTags(second.itemId, ["signed"]);

      const matchingTags = await prisma!.tag.findMany({
        where: { normalizedName: "signed" },
      });
      expect(matchingTags).toHaveLength(2);
      expect(new Set(matchingTags.map((tag) => tag.ownerId))).toEqual(
        new Set([first.ownerId, second.ownerId]),
      );

      await expect(
        secondIdentifiers.setItemIdentifiers(first.itemId, [
          { type: "EAN", value: "9999999999999" },
        ]),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
      await expect(secondTags.setItemTags(first.itemId, ["stolen"])).rejects.toMatchObject({
        code: "ITEM_NOT_FOUND",
      });
      await expect(
        prisma!.itemIdentifier.findMany({ where: { itemId: first.itemId } }),
      ).resolves.toMatchObject([{ normalizedValue: "0123456789012" }]);
    } finally {
      await prisma!.user.deleteMany({
        where: { id: { in: [first.ownerId, second.ownerId] } },
      });
    }
  });

  it("rolls back an identifier replacement when its insert fails", async () => {
    const fixture = await createOwnerAndItem("Rollback");
    const service = createIdentifierService(
      prisma! as unknown as IdentifierDatabase,
      fixture.ownerId,
    );

    try {
      await service.setItemIdentifiers(fixture.itemId, [
        { type: "CERTIFICATE", value: "ORIGINAL-01" },
      ]);
      const failingDatabase = {
        $transaction: async <T>(
          operation: (transaction: Record<string, unknown>) => Promise<T>,
          options: { isolationLevel: "ReadCommitted" },
        ) =>
          prisma!.$transaction(
            async (transaction) =>
              operation({
                $queryRaw: transaction.$queryRaw.bind(transaction),
                itemIdentifier: {
                  deleteMany: transaction.itemIdentifier.deleteMany.bind(
                    transaction.itemIdentifier,
                  ),
                  createMany: async () => {
                    throw new Error("fixture identifier insert failure");
                  },
                  findMany: transaction.itemIdentifier.findMany.bind(
                    transaction.itemIdentifier,
                  ),
                },
              }),
            options,
          ),
      };
      const failingService = createIdentifierService(
        failingDatabase as unknown as IdentifierDatabase,
        fixture.ownerId,
      );

      await expect(
        failingService.setItemIdentifiers(fixture.itemId, [
          { type: "CERTIFICATE", value: "REPLACEMENT-02" },
        ]),
      ).rejects.toThrow("fixture identifier insert failure");
      await expect(
        prisma!.itemIdentifier.findMany({ where: { itemId: fixture.itemId } }),
      ).resolves.toMatchObject([
        {
          type: "CERTIFICATE",
          value: "ORIGINAL-01",
          normalizedValue: "ORIGINAL-01",
        },
      ]);
    } finally {
      await prisma!.user.delete({ where: { id: fixture.ownerId } });
    }
  });
});
