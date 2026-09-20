import {
  CollectibleItemSchema,
  CreateItemInputSchema,
  SplitQuantityInputSchema,
  SplitQuantityResultSchema,
  UpdateItemInputSchema,
  type AcquisitionType,
  type CollectibleItem,
  type CreateItemInput,
  type SplitQuantityResult,
  type TradeStatus,
  type UpdateItemInput,
  type Visibility,
} from "@sammlerraum/contracts/items";

type StoredItem = {
  id: string;
  collectionId: string;
  nodeId: string | null;
  title: string;
  publicDescription: string | null;
  privateNotes: string | null;
  quantity: number;
  acquisitionType: AcquisitionType;
  acquisitionDate: Date | string | null;
  purchaseAmountMinor: bigint | number | null;
  purchaseCurrency: string | null;
  visibility: Visibility;
  tradeStatus: TradeStatus;
  archivedAt: Date | string | null;
  disposedAt: Date | string | null;
};

const itemSelect = {
  id: true,
  collectionId: true,
  nodeId: true,
  title: true,
  publicDescription: true,
  privateNotes: true,
  quantity: true,
  acquisitionType: true,
  acquisitionDate: true,
  purchaseAmountMinor: true,
  purchaseCurrency: true,
  visibility: true,
  tradeStatus: true,
  archivedAt: true,
  disposedAt: true,
} as const;

type ItemWriteData = {
  collectionId: string;
  nodeId: string | null;
  title: string;
  publicDescription: string | null;
  privateNotes: string | null;
  quantity: number;
  acquisitionType: AcquisitionType;
  acquisitionDate: Date | null;
  purchaseAmountMinor: bigint | null;
  purchaseCurrency: string | null;
  visibility: Visibility;
  tradeStatus: TradeStatus;
};

type ItemUpdateData = Partial<Omit<ItemWriteData, "collectionId">> & {
  archivedAt?: Date;
  disposedAt?: Date;
};

type ItemTransaction = {
  collectionNode: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; collectionId: true };
    }): Promise<{ id: string; collectionId: string } | null>;
  };
  collectibleItem: {
    create(args: { data: ItemWriteData; select: typeof itemSelect }): Promise<StoredItem>;
    update(args: {
      where: { id: string };
      data: ItemUpdateData;
      select: typeof itemSelect;
    }): Promise<StoredItem>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export type ItemDatabase = {
  $transaction<T>(
    operation: (transaction: ItemTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};

export type ItemServiceErrorCode =
  | "COLLECTION_NOT_FOUND"
  | "COLLECTION_NODE_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "ITEM_SPLIT_INVALID";

const errorMessages: Record<ItemServiceErrorCode, string> = {
  COLLECTION_NOT_FOUND: "Collection not found",
  COLLECTION_NODE_NOT_FOUND: "Collection node not found",
  ITEM_NOT_FOUND: "Item not found",
  ITEM_INACTIVE: "Item is archived or disposed",
  ITEM_SPLIT_INVALID: "Split quantity must be positive and less than the current quantity",
};

export class ItemServiceError extends Error {
  constructor(readonly code: ItemServiceErrorCode) {
    super(errorMessages[code]);
    this.name = "ItemServiceError";
  }
}

function toDateOnly(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toTimestamp(value: Date | string): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function toSafeNumber(value: bigint | number): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number)) {
    throw new RangeError("Stored purchase amount is outside the safe integer range");
  }
  return number;
}

function toItem(row: StoredItem): CollectibleItem {
  return CollectibleItemSchema.parse({
    ...row,
    acquisitionDate: row.acquisitionDate === null ? null : toDateOnly(row.acquisitionDate),
    purchaseAmountMinor:
      row.purchaseAmountMinor === null ? null : toSafeNumber(row.purchaseAmountMinor),
    archivedAt: row.archivedAt === null ? null : toTimestamp(row.archivedAt),
    disposedAt: row.disposedAt === null ? null : toTimestamp(row.disposedAt),
  });
}

async function lockOwnedCollection(
  transaction: ItemTransaction,
  collectionId: string,
  actorUserId: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Collection"
    WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${actorUserId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new ItemServiceError("COLLECTION_NOT_FOUND");
}

async function lockOwnedItem(
  transaction: ItemTransaction,
  itemId: string,
  actorUserId: string,
): Promise<StoredItem> {
  const rows = await transaction.$queryRaw<StoredItem[]>`
    SELECT
      item."id",
      item."collectionId",
      item."nodeId",
      item."title",
      item."publicDescription",
      item."privateNotes",
      item."quantity",
      item."acquisitionType",
      item."acquisitionDate",
      item."purchaseAmountMinor",
      item."purchaseCurrency",
      item."visibility",
      item."tradeStatus",
      item."archivedAt",
      item."disposedAt"
    FROM "CollectibleItem" item
    JOIN "Collection" collection ON collection."id" = item."collectionId"
    WHERE item."id" = ${itemId}::uuid AND collection."ownerId" = ${actorUserId}
    FOR UPDATE OF item
  `;
  const item = rows[0];
  if (!item) throw new ItemServiceError("ITEM_NOT_FOUND");
  return item;
}

function ensureActive(item: StoredItem): void {
  if (item.archivedAt !== null || item.disposedAt !== null) {
    throw new ItemServiceError("ITEM_INACTIVE");
  }
}

async function ensureNodeInCollection(
  transaction: ItemTransaction,
  nodeId: string | null,
  collectionId: string,
): Promise<void> {
  if (nodeId === null) return;
  const node = await transaction.collectionNode.findUnique({
    where: { id: nodeId },
    select: { id: true, collectionId: true },
  });
  if (!node || node.collectionId !== collectionId) {
    throw new ItemServiceError("COLLECTION_NODE_NOT_FOUND");
  }
}

export function createItemService(
  database: ItemDatabase,
  actorUserId: string,
  options: { now?: () => Date } = {},
) {
  const now = options.now ?? (() => new Date());

  async function createItem(input: CreateItemInput): Promise<CollectibleItem> {
    const data = CreateItemInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        await lockOwnedCollection(transaction, data.collectionId, actorUserId);
        await ensureNodeInCollection(transaction, data.nodeId, data.collectionId);
        const item = await transaction.collectibleItem.create({
          data: {
            collectionId: data.collectionId,
            nodeId: data.nodeId,
            title: data.title,
            publicDescription: data.publicDescription,
            privateNotes: data.privateNotes,
            quantity: data.quantity,
            acquisitionType: data.acquisitionType,
            acquisitionDate:
              data.acquisitionDate === null
                ? null
                : new Date(`${data.acquisitionDate}T00:00:00.000Z`),
            purchaseAmountMinor:
              data.purchaseAmountMinor === null ? null : BigInt(data.purchaseAmountMinor),
            purchaseCurrency: data.purchaseCurrency,
            visibility: data.visibility,
            tradeStatus: data.tradeStatus,
          },
          select: itemSelect,
        });
        return toItem(item);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function updateItem(
    itemIdInput: string,
    input: UpdateItemInput,
  ): Promise<CollectibleItem> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
    const data = UpdateItemInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        const existing = await lockOwnedItem(transaction, itemId, actorUserId);
        ensureActive(existing);
        if (data.nodeId !== undefined) {
          await ensureNodeInCollection(transaction, data.nodeId, existing.collectionId);
        }

        const update: ItemUpdateData = {};
        if (data.nodeId !== undefined) update.nodeId = data.nodeId;
        if (data.title !== undefined) update.title = data.title;
        if (data.publicDescription !== undefined)
          update.publicDescription = data.publicDescription;
        if (data.privateNotes !== undefined) update.privateNotes = data.privateNotes;
        if (data.quantity !== undefined) update.quantity = data.quantity;
        if (data.acquisitionType !== undefined) update.acquisitionType = data.acquisitionType;
        if (data.acquisitionDate !== undefined) {
          update.acquisitionDate =
            data.acquisitionDate === null
              ? null
              : new Date(`${data.acquisitionDate}T00:00:00.000Z`);
        }
        if (data.purchaseAmountMinor !== undefined) {
          update.purchaseAmountMinor =
            data.purchaseAmountMinor === null ? null : BigInt(data.purchaseAmountMinor);
          update.purchaseCurrency = data.purchaseCurrency ?? null;
        }
        if (data.visibility !== undefined) update.visibility = data.visibility;
        if (data.tradeStatus !== undefined) update.tradeStatus = data.tradeStatus;
        if (data.disposedAt !== undefined) {
          update.disposedAt = new Date(data.disposedAt);
          update.tradeStatus = "NOT_FOR_TRADE";
        }
        return toItem(
          await transaction.collectibleItem.update({
            where: { id: existing.id },
            data: update,
            select: itemSelect,
          }),
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function archiveItem(itemIdInput: string): Promise<CollectibleItem> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
    return database.$transaction(
      async (transaction) => {
        const existing = await lockOwnedItem(transaction, itemId, actorUserId);
        ensureActive(existing);
        return toItem(
          await transaction.collectibleItem.update({
            where: { id: existing.id },
            data: { archivedAt: now(), tradeStatus: "NOT_FOR_TRADE" },
            select: itemSelect,
          }),
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function splitQuantityItem(
    itemIdInput: string,
    splitQuantityInput: number,
  ): Promise<SplitQuantityResult> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
    const splitQuantity = SplitQuantityInputSchema.safeParse(splitQuantityInput);
    if (!splitQuantity.success) throw new ItemServiceError("ITEM_SPLIT_INVALID");

    return database.$transaction(
      async (transaction) => {
        const item = await lockOwnedItem(transaction, itemId, actorUserId);
        ensureActive(item);
        if (splitQuantity.data >= item.quantity) {
          throw new ItemServiceError("ITEM_SPLIT_INVALID");
        }

        const source = await transaction.collectibleItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity - splitQuantity.data },
          select: itemSelect,
        });
        const created = await transaction.collectibleItem.create({
          data: {
            collectionId: item.collectionId,
            nodeId: item.nodeId,
            title: item.title,
            publicDescription: item.publicDescription,
            privateNotes: item.privateNotes,
            quantity: splitQuantity.data,
            acquisitionType: item.acquisitionType,
            acquisitionDate:
              item.acquisitionDate === null ? null : new Date(item.acquisitionDate),
            purchaseAmountMinor:
              item.purchaseAmountMinor === null ? null : BigInt(item.purchaseAmountMinor),
            purchaseCurrency: item.purchaseCurrency,
            visibility: item.visibility,
            tradeStatus: item.tradeStatus,
          },
          select: itemSelect,
        });
        return SplitQuantityResultSchema.parse({ source: toItem(source), created: toItem(created) });
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  return { createItem, updateItem, archiveItem, splitQuantityItem };
}
