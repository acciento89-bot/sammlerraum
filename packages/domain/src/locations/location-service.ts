import { randomBytes } from "node:crypto";

import {
  CreateLocationInputSchema,
  ItemLocationHistorySchema,
  LocationContentsSchema,
  StorageLocationSchema,
  type CreateLocationInput,
  type ItemLocationHistory,
  type LocationContents,
  type LocationType,
  type StorageLocation,
} from "@sammlerraum/contracts/locations";
import type { Visibility } from "@sammlerraum/contracts/collections";

const locationSelect = {
  id: true,
  parentId: true,
  name: true,
  type: true,
  visibility: true,
  qrToken: true,
} as const;

const historySelect = {
  id: true,
  itemId: true,
  fromLocationId: true,
  toLocationId: true,
  assignedById: true,
  movedAt: true,
} as const;

type LocationIdentity = { id: string; ownerId: string };
type OwnedItem = { id: string; ownerId: string; storageLocationId: string | null };
type StoredHistory = Omit<ItemLocationHistory, "movedAt"> & { movedAt: Date | string };

type LocationTransaction = {
  storageLocation: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; ownerId: true };
    }): Promise<LocationIdentity | null>;
    create(args: {
      data: {
        ownerId: string;
        parentId: string | null;
        name: string;
        type: LocationType;
        visibility: Visibility;
        qrToken: string;
      };
      select: typeof locationSelect;
    }): Promise<StorageLocation>;
    updateMany(args: {
      where: { id: string; ownerId: string };
      data: { parentId: string | null };
    }): Promise<{ count: number }>;
  };
  collectibleItem: {
    updateMany(args: {
      where: { id: string; ownerId: string };
      data: { storageLocationId: string | null };
    }): Promise<{ count: number }>;
  };
  itemLocationHistory: {
    create(args: {
      data: {
        itemId: string;
        ownerId: string;
        fromLocationId: string | null;
        toLocationId: string | null;
        assignedById: string;
      };
      select: typeof historySelect;
    }): Promise<StoredHistory>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export type LocationDatabase = {
  storageLocation: {
    findFirst(args: {
      where: { id: string; ownerId: string };
      select: typeof locationSelect;
    }): Promise<StorageLocation | null>;
    findMany(args: {
      where: { parentId: string; ownerId: string };
      select: typeof locationSelect;
      orderBy: { name: "asc" };
    }): Promise<StorageLocation[]>;
  };
  collectibleItem: {
    findMany(args: {
      where: { storageLocationId: string; ownerId: string };
      select: { id: true; collectionId: true; title: true; quantity: true };
      orderBy: { title: "asc" };
    }): Promise<Array<{ id: string; collectionId: string; title: string; quantity: number }>>;
  };
  $transaction<T>(
    operation: (transaction: LocationTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};

export type LocationServiceErrorCode =
  | "LOCATION_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "LOCATION_HIERARCHY_CYCLE"
  | "LOCATION_HIERARCHY_INVALID"
  | "ITEM_LOCATION_UNCHANGED";

export class LocationServiceError extends Error {
  constructor(readonly code: LocationServiceErrorCode) {
    super(
      code === "LOCATION_HIERARCHY_CYCLE"
        ? "Location hierarchy cycle"
        : code === "LOCATION_HIERARCHY_INVALID"
          ? "Location hierarchy is invalid"
          : code === "ITEM_NOT_FOUND"
            ? "Item not found"
            : code === "ITEM_LOCATION_UNCHANGED"
              ? "Item location is unchanged"
              : "Location not found",
    );
    this.name = "LocationServiceError";
  }
}

async function lockOwner(transaction: LocationTransaction, ownerId: string): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "user" WHERE "id" = ${ownerId} FOR UPDATE
  `;
  if (rows.length !== 1) throw new LocationServiceError("LOCATION_NOT_FOUND");
}

async function findOwnedLocation(
  transaction: LocationTransaction,
  id: string,
  ownerId: string,
): Promise<LocationIdentity> {
  const value = await transaction.storageLocation.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!value || value.ownerId !== ownerId) throw new LocationServiceError("LOCATION_NOT_FOUND");
  return value;
}

function toHistory(row: StoredHistory): ItemLocationHistory {
  return ItemLocationHistorySchema.parse({
    ...row,
    movedAt:
      typeof row.movedAt === "string"
        ? new Date(row.movedAt).toISOString()
        : row.movedAt.toISOString(),
  });
}

export function createLocationService(database: LocationDatabase, actorUserId: string) {
  async function createLocation(input: CreateLocationInput): Promise<StorageLocation> {
    const data = CreateLocationInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        await lockOwner(transaction, actorUserId);
        if (data.parentId !== null) {
          await findOwnedLocation(transaction, data.parentId, actorUserId);
        }
        const created = await transaction.storageLocation.create({
          data: {
            ownerId: actorUserId,
            parentId: data.parentId,
            name: data.name,
            type: data.type,
            visibility: data.visibility,
            qrToken: randomBytes(32).toString("base64url"),
          },
          select: locationSelect,
        });
        return StorageLocationSchema.parse(created);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function moveLocation(
    locationIdInput: string,
    parentIdInput: string | null,
  ): Promise<void> {
    const locationId = StorageLocationSchema.shape.id.parse(locationIdInput);
    const parentId =
      parentIdInput === null ? null : StorageLocationSchema.shape.id.parse(parentIdInput);
    await database.$transaction(
      async (transaction) => {
        const staleSource = await transaction.storageLocation.findUnique({
          where: { id: locationId },
          select: { id: true, ownerId: true },
        });
        if (!staleSource || staleSource.ownerId !== actorUserId) {
          throw new LocationServiceError("LOCATION_NOT_FOUND");
        }
        await lockOwner(transaction, actorUserId);
        await findOwnedLocation(transaction, locationId, actorUserId);
        if (parentId !== null) await findOwnedLocation(transaction, parentId, actorUserId);

        const descendants = await transaction.$queryRaw<
          Array<{ id: string; ownerId: string; cycle: boolean }>
        >`
          WITH RECURSIVE descendants AS (
            SELECT "id", "ownerId", ARRAY["id"] AS path, false AS cycle
            FROM "StorageLocation"
            WHERE "id" = ${locationId}::uuid AND "ownerId" = ${actorUserId}
            UNION ALL
            SELECT child."id", child."ownerId", parent.path || child."id",
                   child."id" = ANY(parent.path)
            FROM "StorageLocation" child
            JOIN descendants parent ON child."parentId" = parent."id"
              AND child."ownerId" = parent."ownerId"
            WHERE NOT parent.cycle
          )
          SELECT "id", "ownerId", cycle FROM descendants
        `;
        if (
          descendants.length === 0 ||
          descendants.some((row) => row.cycle || row.ownerId !== actorUserId)
        ) {
          throw new LocationServiceError("LOCATION_HIERARCHY_INVALID");
        }
        if (parentId !== null && descendants.some((row) => row.id === parentId)) {
          throw new LocationServiceError("LOCATION_HIERARCHY_CYCLE");
        }
        const result = await transaction.storageLocation.updateMany({
          where: { id: locationId, ownerId: actorUserId },
          data: { parentId },
        });
        if (result.count !== 1) throw new LocationServiceError("LOCATION_NOT_FOUND");
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function assignItemLocation(
    itemIdInput: string,
    locationIdInput: string | null,
  ): Promise<ItemLocationHistory> {
    const itemId = StorageLocationSchema.shape.id.parse(itemIdInput);
    const locationId =
      locationIdInput === null ? null : StorageLocationSchema.shape.id.parse(locationIdInput);
    return database.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<OwnedItem[]>`
          SELECT item."id", item."ownerId", item."storageLocationId"
          FROM "CollectibleItem" item
          WHERE item."id" = ${itemId}::uuid AND item."ownerId" = ${actorUserId}
          FOR UPDATE
        `;
        const item = rows[0];
        if (!item) throw new LocationServiceError("ITEM_NOT_FOUND");
        if (item.storageLocationId === locationId) {
          throw new LocationServiceError("ITEM_LOCATION_UNCHANGED");
        }
        if (locationId !== null) await findOwnedLocation(transaction, locationId, actorUserId);
        const update = await transaction.collectibleItem.updateMany({
          where: { id: item.id, ownerId: actorUserId },
          data: { storageLocationId: locationId },
        });
        if (update.count !== 1) throw new LocationServiceError("ITEM_NOT_FOUND");
        const history = await transaction.itemLocationHistory.create({
          data: {
            itemId: item.id,
            ownerId: actorUserId,
            fromLocationId: item.storageLocationId,
            toLocationId: locationId,
            assignedById: actorUserId,
          },
          select: historySelect,
        });
        return toHistory(history);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function getLocationContents(locationIdInput: string): Promise<LocationContents> {
    const locationId = StorageLocationSchema.shape.id.parse(locationIdInput);
    const location = await database.storageLocation.findFirst({
      where: { id: locationId, ownerId: actorUserId },
      select: locationSelect,
    });
    if (!location) throw new LocationServiceError("LOCATION_NOT_FOUND");
    const [childLocations, items] = await Promise.all([
      database.storageLocation.findMany({
        where: { parentId: locationId, ownerId: actorUserId },
        select: locationSelect,
        orderBy: { name: "asc" },
      }),
      database.collectibleItem.findMany({
        where: { storageLocationId: locationId, ownerId: actorUserId },
        select: { id: true, collectionId: true, title: true, quantity: true },
        orderBy: { title: "asc" },
      }),
    ]);
    return LocationContentsSchema.parse({ location, childLocations, items });
  }

  return { createLocation, moveLocation, assignItemLocation, getLocationContents };
}
