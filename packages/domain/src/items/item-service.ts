import { lockMutationItemParent } from "../audit/mutation-audit";
import { captureMoneyAuditSnapshot } from "../audit/money-audit";
import { LegacyMoneyError } from "@sammlerraum/contracts/legacy-money";
import type { AuditContext } from "../audit/audit-context";
import { createHash } from "node:crypto";
import { defaultMutationAudit, type MutationAuditPort } from "../audit/mutation-audit";
import { moneyTransaction } from "../money/legacy-money-transaction";
import {
  readMoneyFact,
  requireMoneyToken,
  copyMoneyFact,
  type ResolvedMoneyFact,
} from "../money/legacy-money-store";
import type { MoneySubject } from "@sammlerraum/contracts/legacy-money";
import {
  CatalogReadIdSchema,
  ItemCatalogLinkSchema,
  type ItemCatalogLink,
} from "@sammlerraum/contracts/catalog-reads";
import { CatalogSnapshotSchema, CatalogVariantSchema } from "@sammlerraum/contracts/catalog";
import { catalogTitleSummary, catalogVariantSummary } from "../catalog/catalog-summary";
import {
  CatalogReferencesChanged,
  lockCatalogParents,
  type CatalogReferences,
} from "../catalog/item-catalog-locks";
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
  ownerId: string;
  nodeId: string | null;
  storageLocationId: string | null;
  categoryTemplateId: string | null;
  conditionOptionId: string | null;
  catalogEntryId: string | null;
  catalogVariantId: string | null;
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
  deletedAt?: Date | string | null;
};

const itemSelect = {
  id: true,
  collectionId: true,
  ownerId: true,
  nodeId: true,
  storageLocationId: true,
  categoryTemplateId: true,
  conditionOptionId: true,
  catalogEntryId: true,
  catalogVariantId: true,
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
  deletedAt: true,
} as const;

type ItemWriteData = {
  collectionId: string;
  ownerId: string;
  nodeId: string | null;
  storageLocationId?: string | null;
  categoryTemplateId?: string | null;
  conditionOptionId?: string | null;
  catalogEntryId?: string | null;
  catalogVariantId?: string | null;
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
  deletedAt?: Date;
};

export type ItemTransaction = {
  itemIdentifier: {
    findMany(args: {
      where: { itemId: string };
      select: typeof splitIdentifierSelect;
    }): Promise<Array<{ type: string; value: string; normalizedValue: string }>>;
    createMany(args: {
      data: Array<{ itemId: string; type: string; value: string; normalizedValue: string }>;
    }): Promise<unknown>;
  };
  mediaLink: {
    findMany(args: {
      where: { itemId: string };
      select: typeof splitMediaSelect;
    }): Promise<SplitMediaLink[]>;
    createMany(args: { data: Array<SplitMediaLink & { itemId: string }> }): Promise<unknown>;
  };
  documentLink: {
    findMany(args: {
      where: { itemId: string };
      select: typeof splitDocumentSelect;
    }): Promise<SplitDocumentLink[]>;
    createMany(args: { data: Array<SplitDocumentLink & { itemId: string }> }): Promise<unknown>;
  };
  itemTag: {
    findMany(args: {
      where: { itemId: string };
      select: { tagId: true };
    }): Promise<Array<{ tagId: string }>>;
    createMany(args: { data: Array<{ itemId: string; tagId: string }> }): Promise<unknown>;
  };
  customFieldValue: {
    findMany(args: {
      where: { itemId: string };
      select: typeof splitFieldSelect;
    }): Promise<SplitFieldValue[]>;
    createMany(args: {
      data: Array<
        Omit<SplitFieldValue, "multiSelectValues" | "decimalValue"> & {
          itemId: string;
          decimalValue: string | null;
        }
      >;
    }): Promise<unknown>;
  };
  customFieldMultiSelectValue: {
    createMany(args: {
      data: Array<{
        itemId: string;
        fieldDefinitionId: string;
        optionId: string;
        position: number;
      }>;
    }): Promise<unknown>;
  };
  itemLocationHistory: {
    create(args: {
      data: {
        itemId: string;
        ownerId: string;
        fromLocationId: null;
        toLocationId: string;
        assignedById: string;
      };
    }): Promise<unknown>;
  };
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

const splitMediaSelect = {
  assetId: true,
  ownerId: true,
  purpose: true,
  position: true,
  title: true,
} as const;
const splitDocumentSelect = {
  assetId: true,
  ownerId: true,
  category: true,
  visibility: true,
  position: true,
  title: true,
} as const;
type SplitMediaLink = {
  assetId: string;
  ownerId: string;
  purpose: "GALLERY" | "DETAIL";
  position: number;
  title: string | null;
};
type SplitDocumentLink = {
  assetId: string;
  ownerId: string;
  category:
    | "PURCHASE_RECEIPT"
    | "INVOICE"
    | "AUTHENTICITY_CERTIFICATE"
    | "GRADING_PROOF"
    | "APPRAISAL"
    | "INSURANCE"
    | "PROVENANCE"
    | "WARRANTY"
    | "OTHER_PRIVATE";
  visibility: Visibility;
  position: number;
  title: string | null;
};
const splitIdentifierSelect = { type: true, value: true, normalizedValue: true } as const;
const splitFieldSelect = {
  fieldDefinitionId: true,
  collectionId: true,
  fieldType: true,
  shortTextValue: true,
  longTextValue: true,
  integerValue: true,
  decimalValue: true,
  dateValue: true,
  booleanValue: true,
  singleSelectOptionId: true,
  urlValue: true,
  moneyAmountMinor: true,
  moneyCurrency: true,
  multiSelectValues: { select: { optionId: true, position: true }, orderBy: { position: "asc" } },
} as const;
type SplitFieldValue = {
  fieldDefinitionId: string;
  collectionId: string;
  fieldType:
    | "SHORT_TEXT"
    | "LONG_TEXT"
    | "INTEGER"
    | "DECIMAL"
    | "DATE"
    | "BOOLEAN"
    | "SINGLE_SELECT"
    | "MULTI_SELECT"
    | "URL"
    | "MONEY";
  shortTextValue: string | null;
  longTextValue: string | null;
  integerValue: bigint | null;
  decimalValue: unknown;
  dateValue: Date | null;
  booleanValue: boolean | null;
  singleSelectOptionId: string | null;
  urlValue: string | null;
  moneyAmountMinor: bigint | null;
  moneyCurrency: string | null;
  multiSelectValues: Array<{ optionId: string; position: number }>;
};

function exactDecimal(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toFixed" in value && typeof value.toFixed === "function") {
    return value.toFixed();
  }
  throw new TypeError("Stored decimal has an invalid representation");
}

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
  | "ITEM_EDIT_CONFLICT"
  | "ITEM_INACTIVE"
  | "ITEM_SPLIT_INVALID"
  | "ITEM_GRADING_QUANTITY_INVALID"
  | "CATALOG_NOT_FOUND"
  | "CATALOG_VARIANT_NOT_FOUND"
  | "CATALOG_VARIANT_INACTIVE"
  | "ITEM_CATALOG_CATEGORY_MISMATCH"
  | "ITEM_CATALOG_RETRY_EXHAUSTED";

const errorMessages: Record<ItemServiceErrorCode, string> = {
  CATALOG_NOT_FOUND: "Catalog entry not found",
  CATALOG_VARIANT_NOT_FOUND: "Catalog variant not found",
  CATALOG_VARIANT_INACTIVE: "Catalog variant is inactive",
  ITEM_CATALOG_CATEGORY_MISMATCH:
    "Unlink and explicitly change personal category before choosing this entry",
  ITEM_CATALOG_RETRY_EXHAUSTED: "Catalog link changed concurrently; retry the operation",
  COLLECTION_NOT_FOUND: "Collection not found",
  COLLECTION_NODE_NOT_FOUND: "Collection node not found",
  ITEM_NOT_FOUND: "Item not found",
  ITEM_EDIT_CONFLICT: "The item changed after the editing view was loaded",
  ITEM_INACTIVE: "Item is archived or disposed",
  ITEM_SPLIT_INVALID: "Split quantity must be positive and less than the current quantity",
  ITEM_GRADING_QUANTITY_INVALID:
    "Remove grading records before changing physical specimen quantity",
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
    WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${actorUserId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new ItemServiceError("COLLECTION_NOT_FOUND");
}

/** Shared metadata writers retain their own actor; ownership is a separate current DB fact.
 * The parent UPDATE fence is acquired before the item. Owner producers likewise lock their
 * parent before the item, so later audit append cannot invert this resource order.
 */
async function lockEditableCollection(
  transaction: ItemTransaction,
  collectionId: string,
  actorUserId: string,
): Promise<string> {
  const visible = await transaction.$queryRaw<
    { id: string }[]
  >`SELECT c.id FROM "Collection" c WHERE c.id=${collectionId}::uuid AND c."deletedAt" IS NULL AND (c."ownerId"=${actorUserId} OR EXISTS(SELECT 1 FROM "CollectionMember" m WHERE m."collectionId"=c.id AND m."userId"=${actorUserId} AND m.role IN ('ADMIN','EDITOR')))`;
  if (!visible.length) throw new ItemServiceError("COLLECTION_NOT_FOUND");
  const [parent] = await transaction.$queryRaw<
    { ownerId: string }[]
  >`SELECT "ownerId" FROM "Collection" WHERE id=${collectionId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  if (!parent) throw new ItemServiceError("COLLECTION_NOT_FOUND");
  if (parent.ownerId !== actorUserId) {
    const [role] = await transaction.$queryRaw<
      { allowed: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM "CollectionMember" WHERE "collectionId"=${collectionId}::uuid AND "userId"=${actorUserId} AND role IN ('ADMIN','EDITOR')) AS allowed`;
    if (!role?.allowed) throw new ItemServiceError("COLLECTION_NOT_FOUND");
  }
  return parent.ownerId;
}

async function lockOwnedItem(
  transaction: ItemTransaction,
  itemId: string,
  actorUserId: string,
): Promise<StoredItem> {
  await lockMutationItemParent(transaction, itemId, actorUserId);
  const rows = await transaction.$queryRaw<StoredItem[]>`
    SELECT
      item."id",
      item."collectionId",
      item."ownerId",
      item."nodeId",
      item."storageLocationId",
      item."categoryTemplateId",
      item."conditionOptionId",
      item."catalogEntryId",
      item."catalogVariantId",
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
    WHERE item."id" = ${itemId}::uuid
      AND collection."ownerId" = ${actorUserId}
      AND item."ownerId" = ${actorUserId}
      AND item."deletedAt" IS NULL
      AND collection."deletedAt" IS NULL
    FOR UPDATE OF item
  `;
  const item = rows[0];
  if (!item) throw new ItemServiceError("ITEM_NOT_FOUND");
  return item;
}

async function ensureNoGrading(transaction: ItemTransaction, itemId: string): Promise<void> {
  const [row] = await transaction.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM "Grading" WHERE "itemId" = ${itemId}::uuid) AS present
  `;
  if (row!.present) throw new ItemServiceError("ITEM_GRADING_QUANTITY_INVALID");
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

/** Strict input validation belongs to the caller; owner/parent checks remain here. */
export async function readOwnedItemInTransaction(
  transaction: ItemTransaction,
  actorUserId: string,
  itemIdInput: string,
): Promise<CollectibleItem> {
  const id = CollectibleItemSchema.shape.id.parse(itemIdInput);
  return toItem(await lockOwnedItem(transaction, id, actorUserId));
}

type ItemMutationAuditOptions = {
  auditPort?: MutationAuditPort;
  auditContext?: AuditContext;
  collaborativeCollectionId?: string;
  collaborativePreconditions?: { expectedUpdatedAt: string; expectedLatestSequence: string | null };
};
export async function createItemInTransaction(
  transaction: ItemTransaction,
  actorUserId: string,
  data: ReturnType<typeof CreateItemInputSchema.parse>,
  auditOptions: ItemMutationAuditOptions = {},
): Promise<CollectibleItem> {
  if (
    auditOptions.collaborativeCollectionId !== undefined &&
    (data.privateNotes !== null ||
      data.purchaseAmountMinor !== null ||
      data.purchaseCurrency !== null)
  )
    throw new ItemServiceError("ITEM_NOT_FOUND");
  const auditPort = auditOptions.auditPort ?? defaultMutationAudit,
    audit = await auditPort.begin(
      transaction,
      actorUserId,
      () => new ItemServiceError("COLLECTION_NOT_FOUND"),
      auditOptions.auditContext,
    );
  let ownerId = actorUserId;
  if (auditOptions.collaborativeCollectionId !== undefined) {
    if (auditOptions.collaborativeCollectionId !== data.collectionId)
      throw new ItemServiceError("COLLECTION_NOT_FOUND");
    ownerId = await lockEditableCollection(transaction, data.collectionId, actorUserId);
  } else await lockOwnedCollection(transaction, data.collectionId, actorUserId);
  await ensureNodeInCollection(transaction, data.nodeId, data.collectionId);
  const item = await transaction.collectibleItem.create({
    data: {
      collectionId: data.collectionId,
      ownerId,
      nodeId: data.nodeId,
      title: data.title,
      publicDescription: data.publicDescription,
      privateNotes: data.privateNotes,
      quantity: data.quantity,
      acquisitionType: data.acquisitionType,
      acquisitionDate:
        data.acquisitionDate === null ? null : new Date(`${data.acquisitionDate}T00:00:00.000Z`),
      purchaseAmountMinor:
        data.purchaseAmountMinor === null ? null : BigInt(data.purchaseAmountMinor),
      purchaseCurrency: data.purchaseCurrency,
      visibility: data.visibility,
      tradeStatus: data.tradeStatus,
    },
    select: itemSelect,
  });
  const created = toItem(item);
  await auditPort.append(transaction, audit, {
    resourceType: "ITEM",
    resourceId: item.id,
    action: "ITEM_CREATED",
    before: null,
    after: { ...itemAuditSnapshot(created), visibility: created.visibility },
  });
  return created;
}

export async function updateItemInTransaction(
  transaction: ItemTransaction,
  actorUserId: string,
  itemIdInput: string,
  input: UpdateItemInput,
  auditOptions: ItemMutationAuditOptions = {},
): Promise<CollectibleItem> {
  const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
  const data = input; // Validated by the legacy or explicit-money service before entering this body.
  if (
    auditOptions.collaborativeCollectionId !== undefined &&
    ["privateNotes", "purchaseAmountMinor", "purchaseCurrency", "disposedAt"].some((field) =>
      Object.hasOwn(data, field),
    )
  )
    throw new ItemServiceError("ITEM_NOT_FOUND");
  const auditPort = auditOptions.auditPort ?? defaultMutationAudit,
    audit = await auditPort.begin(
      transaction,
      actorUserId,
      () => new ItemServiceError("ITEM_NOT_FOUND"),
      auditOptions.auditContext,
    );
  const ownerId =
    auditOptions.collaborativeCollectionId === undefined
      ? actorUserId
      : await lockEditableCollection(
          transaction,
          auditOptions.collaborativeCollectionId,
          actorUserId,
        );
  const existing = await lockOwnedItem(transaction, itemId, ownerId);
  if (
    auditOptions.collaborativeCollectionId !== undefined &&
    existing.collectionId !== auditOptions.collaborativeCollectionId
  )
    throw new ItemServiceError("ITEM_NOT_FOUND");
  if (auditOptions.collaborativePreconditions) {
    const [state] = await transaction.$queryRaw<
      { updatedAt: string; latestSequence: string | null }[]
    >`SELECT to_char(i."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",(SELECT max(e.sequence)::text FROM "AuditEvent" e WHERE e."resourceType"='ITEM' AND e."resourceId"=i.id) AS "latestSequence" FROM "CollectibleItem" i WHERE i.id=${itemId}::uuid`;
    if (
      !state ||
      state.updatedAt !== auditOptions.collaborativePreconditions.expectedUpdatedAt ||
      state.latestSequence !== auditOptions.collaborativePreconditions.expectedLatestSequence
    )
      throw new ItemServiceError("ITEM_EDIT_CONFLICT");
  }
  ensureActive(existing);
  if (data.nodeId !== undefined) {
    await ensureNodeInCollection(transaction, data.nodeId, existing.collectionId);
  }

  const update: ItemUpdateData = {};
  if (data.nodeId !== undefined) update.nodeId = data.nodeId;
  if (data.title !== undefined) update.title = data.title;
  if (data.publicDescription !== undefined) update.publicDescription = data.publicDescription;
  if (data.privateNotes !== undefined) update.privateNotes = data.privateNotes;
  if (data.quantity !== undefined) {
    if (data.quantity !== existing.quantity) await ensureNoGrading(transaction, existing.id);
    update.quantity = data.quantity;
  }
  if (data.acquisitionType !== undefined) update.acquisitionType = data.acquisitionType;
  if (data.acquisitionDate !== undefined) {
    update.acquisitionDate =
      data.acquisitionDate === null ? null : new Date(`${data.acquisitionDate}T00:00:00.000Z`);
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
  const saved = toItem(
    await transaction.collectibleItem.update({
      where: { id: existing.id },
      data: update,
      select: itemSelect,
    }),
  );
  const before = itemAuditSnapshot(existing),
    after = itemAuditSnapshot(saved);
  if (JSON.stringify(before) !== JSON.stringify(after))
    await auditPort.append(transaction, audit, {
      resourceType: "ITEM",
      resourceId: itemId,
      action: "ITEM_DETAILS_CHANGED",
      before,
      after,
    });
  if ((existing.disposedAt === null ? null : toTimestamp(existing.disposedAt)) !== saved.disposedAt)
    await auditPort.append(transaction, audit, {
      resourceType: "ITEM",
      resourceId: itemId,
      action: "ITEM_DISPOSED",
      before: {
        disposedAt: existing.disposedAt === null ? null : toTimestamp(existing.disposedAt),
        tradeStatus: existing.tradeStatus,
      },
      after: { disposedAt: saved.disposedAt, tradeStatus: saved.tradeStatus },
    });
  if (existing.visibility !== saved.visibility)
    await auditPort.append(transaction, audit, {
      resourceType: "ITEM",
      resourceId: itemId,
      action: "ITEM_VISIBILITY_CHANGED",
      before: { visibility: existing.visibility },
      after: { visibility: saved.visibility },
    });
  return saved;
}

function catalogLinkAuditSnapshot(item: StoredItem | CollectibleItem) {
  return {
    catalogEntryId: item.catalogEntryId,
    catalogVariantId: item.catalogVariantId,
    categoryTemplateId: item.categoryTemplateId,
  };
}
function itemAuditSnapshot(item: StoredItem | CollectibleItem) {
  const hash = (text: string | null) =>
    text === null ? null : createHash("sha256").update(text).digest("hex");
  return {
    collectionId: item.collectionId,
    nodeId: item.nodeId,
    title: item.title,
    quantity: item.quantity,
    acquisitionType: item.acquisitionType,
    acquisitionDate: item.acquisitionDate === null ? null : toDateOnly(item.acquisitionDate),
    tradeStatus: item.tradeStatus,
    publicDescriptionHash: hash(item.publicDescription),
    privateNotesHash: hash(item.privateNotes),
  };
}
export function createItemService(
  database: ItemDatabase,
  actorUserId: string,
  options: {
    now?: () => Date;
    auditPort?: MutationAuditPort;
    captureMoneyAudit?: typeof captureMoneyAuditSnapshot;
  } = {},
) {
  const now = options.now ?? (() => new Date());
  const auditPort = options.auditPort ?? defaultMutationAudit;
  const captureMoney = options.captureMoneyAudit ?? captureMoneyAuditSnapshot;

  async function createItem(input: CreateItemInput): Promise<CollectibleItem> {
    const data = CreateItemInputSchema.parse(input);
    return database.$transaction(
      async (tx) => {
        const audit = await auditPort.begin(
          tx,
          actorUserId,
          () => new ItemServiceError("COLLECTION_NOT_FOUND"),
        );
        const created = await createItemInTransaction(tx, actorUserId, data, {
          auditPort,
          auditContext: audit,
        });
        if (data.purchaseAmountMinor !== null) {
          const after = await captureMoney(
            moneyTransaction(tx),
            { family: "PURCHASE", itemId: created.id },
            actorUserId,
          );
          await auditPort.append(tx, audit, {
            resourceType: "ITEM",
            resourceId: created.id,
            action: "ITEM_MONEY_CHANGED",
            before: null,
            after,
          });
        }
        return created;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  async function updateItem(itemIdInput: string, input: UpdateItemInput): Promise<CollectibleItem> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput),
      data = UpdateItemInputSchema.parse(input);
    return database.$transaction(
      async (tx) => {
        const audit = await auditPort.begin(
          tx,
          actorUserId,
          () => new ItemServiceError("ITEM_NOT_FOUND"),
        );
        let before: Awaited<ReturnType<typeof captureMoney>> | null = null;
        if (data.purchaseAmountMinor !== undefined) {
          try {
            before = await captureMoney(
              moneyTransaction(tx),
              { family: "PURCHASE", itemId },
              actorUserId,
            );
          } catch (error) {
            if (error instanceof LegacyMoneyError && error.code === "MONEY_NOT_FOUND")
              throw new ItemServiceError("ITEM_NOT_FOUND");
            throw error;
          }
        }
        const saved = await updateItemInTransaction(tx, actorUserId, itemId, data, {
          auditPort,
          auditContext: audit,
        });
        if (data.purchaseAmountMinor !== undefined) {
          const after = await captureMoney(
            moneyTransaction(tx),
            { family: "PURCHASE", itemId },
            actorUserId,
          );
          if (JSON.stringify(before) !== JSON.stringify(after))
            await auditPort.append(tx, audit, {
              resourceType: "ITEM",
              resourceId: itemId,
              action: "ITEM_MONEY_CHANGED",
              before,
              after,
            });
        }
        return saved;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  async function archiveItem(itemIdInput: string): Promise<CollectibleItem> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
    return database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new ItemServiceError("ITEM_NOT_FOUND"),
        );
        const existing = await lockOwnedItem(transaction, itemId, actorUserId);
        if (existing.archivedAt !== null) throw new ItemServiceError("ITEM_INACTIVE");
        const archived = toItem(
          await transaction.collectibleItem.update({
            where: { id: existing.id },
            data: { archivedAt: now(), tradeStatus: "NOT_FOR_TRADE" },
            select: itemSelect,
          }),
        );
        await auditPort.append(transaction, audit, {
          resourceType: "ITEM",
          resourceId: itemId,
          action: "ITEM_ARCHIVED",
          before: { archivedAt: null, tradeStatus: existing.tradeStatus },
          after: { archivedAt: archived.archivedAt, tradeStatus: archived.tradeStatus },
        });
        return archived;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function deleteItem(itemIdInput: string): Promise<void> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
    await database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new ItemServiceError("ITEM_NOT_FOUND"),
        );
        const existing = await lockOwnedItem(transaction, itemId, actorUserId);
        await transaction.collectibleItem.update({
          where: { id: existing.id },
          data: { deletedAt: now(), tradeStatus: "NOT_FOR_TRADE" },
          select: itemSelect,
        });
        await auditPort.append(transaction, audit, {
          resourceType: "ITEM",
          resourceId: itemId,
          action: "ITEM_DELETED",
          before: { deleted: false },
          after: { deleted: true },
        });
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

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const audit = await auditPort.begin(
              transaction,
              actorUserId,
              () => new ItemServiceError("ITEM_NOT_FOUND"),
            );
            const [discovered] = await transaction.$queryRaw<CatalogReferences[]>`
          SELECT item."catalogEntryId",item."catalogVariantId"
          FROM "CollectibleItem" item JOIN "Collection" collection ON collection.id=item."collectionId"
          WHERE item.id=${itemId}::uuid AND item."ownerId"=${actorUserId} AND collection."ownerId"=${actorUserId}
            AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
        `;
            if (!discovered) throw new ItemServiceError("ITEM_NOT_FOUND");
            const parents = await lockCatalogParents(transaction, discovered);
            const item = await lockOwnedItem(transaction, itemId, actorUserId);
            if (
              item.catalogEntryId !== discovered.catalogEntryId ||
              item.catalogVariantId !== discovered.catalogVariantId ||
              (item.catalogEntryId !== null && parents.entry === null) ||
              (item.catalogVariantId !== null && parents.variant === null)
            ) {
              // Abort releases the item lock before discovering any replacement parent.
              throw new CatalogReferencesChanged();
            }
            ensureActive(item);
            await ensureNoGrading(transaction, item.id);
            if (splitQuantity.data >= item.quantity) {
              throw new ItemServiceError("ITEM_SPLIT_INVALID");
            }

            const [identifiers, tags, fields, media, documents] = await Promise.all([
              transaction.itemIdentifier.findMany({
                where: { itemId: item.id },
                select: splitIdentifierSelect,
              }),
              transaction.itemTag.findMany({ where: { itemId: item.id }, select: { tagId: true } }),
              transaction.customFieldValue.findMany({
                where: { itemId: item.id },
                select: splitFieldSelect,
              }),
              transaction.mediaLink.findMany({
                where: { itemId: item.id },
                select: splitMediaSelect,
              }),
              transaction.documentLink.findMany({
                where: { itemId: item.id },
                select: splitDocumentSelect,
              }),
            ]);

            // Capture actual current generation/meaning while the source is locked.
            // Missing money has no evidence to duplicate; present unknown money stays unknown.
            const money = moneyTransaction(transaction);
            const moneySources: Array<{ subject: MoneySubject; fact: ResolvedMoneyFact }> = [];
            const captureMoney = async (subject: MoneySubject) => {
              const view = await readMoneyFact(money, subject, { userId: actorUserId });
              moneySources.push({
                subject,
                fact: await requireMoneyToken(
                  money,
                  subject,
                  { userId: actorUserId },
                  view.factToken,
                ),
              });
            };
            if (item.purchaseAmountMinor !== null)
              await captureMoney({ family: "PURCHASE", itemId: item.id });
            for (const field of fields)
              if (field.fieldType === "MONEY" && field.moneyAmountMinor !== null)
                await captureMoney({
                  family: "CUSTOM",
                  itemId: item.id,
                  fieldDefinitionId: field.fieldDefinitionId,
                });

            // Reference triggers lock assets too. Lock the complete shared set in UUID order
            // before either bulk insert so parallel splits and avatar replacement agree.
            const assetIds = [
              ...new Set([...media, ...documents].map((link) => link.assetId)),
            ].sort();
            for (const assetId of assetIds) {
              await transaction.$queryRaw`SELECT id FROM "MediaAsset" WHERE id = ${assetId}::uuid ORDER BY id FOR UPDATE`;
            }

            const source = await transaction.collectibleItem.update({
              where: { id: item.id },
              data: { quantity: item.quantity - splitQuantity.data },
              select: itemSelect,
            });
            const created = await transaction.collectibleItem.create({
              data: {
                collectionId: item.collectionId,
                ownerId: item.ownerId,
                nodeId: item.nodeId,
                storageLocationId: item.storageLocationId ?? null,
                categoryTemplateId: item.categoryTemplateId,
                conditionOptionId: item.conditionOptionId,
                catalogEntryId: item.catalogEntryId,
                catalogVariantId: item.catalogVariantId,
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
            if (identifiers.length > 0) {
              await transaction.itemIdentifier.createMany({
                data: identifiers.map(({ type, value, normalizedValue }) => ({
                  itemId: created.id,
                  type,
                  value,
                  normalizedValue,
                })),
              });
            }
            if (tags.length > 0) {
              await transaction.itemTag.createMany({
                data: tags.map(({ tagId }) => ({ itemId: created.id, tagId })),
              });
            }
            if (fields.length > 0) {
              await transaction.customFieldValue.createMany({
                data: fields.map(({ multiSelectValues: _selections, ...value }) => ({
                  ...value,
                  decimalValue: exactDecimal(value.decimalValue),
                  itemId: created.id,
                })),
              });
              const selections = fields.flatMap(({ fieldDefinitionId, multiSelectValues }) =>
                multiSelectValues.map(({ optionId, position }) => ({
                  itemId: created.id,
                  fieldDefinitionId,
                  optionId,
                  position,
                })),
              );
              if (selections.length > 0) {
                await transaction.customFieldMultiSelectValue.createMany({ data: selections });
              }
            }
            // Native child writes assigned their own generations. Bind each copy to
            // those actual returned facts in this same enclosing split transaction.
            for (const sourceMoney of moneySources) {
              const target: MoneySubject =
                sourceMoney.subject.family === "CUSTOM"
                  ? { ...sourceMoney.subject, itemId: created.id }
                  : { family: "PURCHASE", itemId: created.id };
              const view = await readMoneyFact(money, target, { userId: actorUserId });
              const destination = await requireMoneyToken(
                money,
                target,
                { userId: actorUserId },
                view.factToken,
              );
              await copyMoneyFact(money, sourceMoney.fact, destination, { userId: actorUserId });
            }
            if (media.length > 0) {
              await transaction.mediaLink.createMany({
                data: media.map((link) => ({ ...link, itemId: created.id })),
              });
            }
            if (documents.length > 0) {
              await transaction.documentLink.createMany({
                data: documents.map((link) => ({ ...link, itemId: created.id })),
              });
            }
            if (item.storageLocationId != null) {
              await transaction.itemLocationHistory.create({
                data: {
                  itemId: created.id,
                  ownerId: item.ownerId,
                  fromLocationId: null,
                  toLocationId: item.storageLocationId,
                  assignedById: actorUserId,
                },
              });
            }
            await auditPort.append(transaction, audit, {
              resourceType: "ITEM",
              resourceId: itemId,
              action: "ITEM_SPLIT",
              before: { quantity: item.quantity, createdItemId: null },
              after: { quantity: source.quantity, createdItemId: created.id },
            });
            await auditPort.append(transaction, audit, {
              resourceType: "ITEM",
              resourceId: created.id,
              action: "ITEM_CREATED",
              before: null,
              after: { ...itemAuditSnapshot(created), visibility: created.visibility },
            });
            return SplitQuantityResultSchema.parse({
              source: toItem(source),
              created: toItem(created),
            });
          },
          { isolationLevel: "ReadCommitted" },
        );
      } catch (error) {
        if (!(error instanceof CatalogReferencesChanged)) throw error;
      }
    }
    throw new ItemServiceError("ITEM_CATALOG_RETRY_EXHAUSTED");
  }

  async function unlinkItemFromCatalog(itemIdInput: string): Promise<CollectibleItem> {
    const itemId = CatalogReadIdSchema.parse(itemIdInput);
    return database.$transaction(
      async (tx) => {
        const audit = await auditPort.begin(
          tx,
          actorUserId,
          () => new ItemServiceError("ITEM_NOT_FOUND"),
        );
        const existing = await lockOwnedItem(tx, itemId, actorUserId);
        ensureActive(existing);
        const saved = toItem(
          await tx.collectibleItem.update({
            where: { id: existing.id },
            data: { catalogEntryId: null, catalogVariantId: null },
            select: itemSelect,
          }),
        );
        const before = catalogLinkAuditSnapshot(existing),
          after = catalogLinkAuditSnapshot(saved);
        if (JSON.stringify(before) !== JSON.stringify(after))
          await auditPort.append(tx, audit, {
            resourceType: "ITEM",
            resourceId: itemId,
            action: "ITEM_CATALOG_LINK_CHANGED",
            before,
            after,
          });
        return saved;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function linkItemToCatalog(
    itemIdInput: string,
    entryIdInput: string,
    variantIdInput: string | null = null,
  ): Promise<CollectibleItem> {
    const itemId = CatalogReadIdSchema.parse(itemIdInput);
    const catalogEntryId = CatalogReadIdSchema.parse(entryIdInput);
    const catalogVariantId =
      variantIdInput === null ? null : CatalogReadIdSchema.parse(variantIdInput);
    return database.$transaction(
      async (tx) => {
        const audit = await auditPort.begin(
          tx,
          actorUserId,
          () => new ItemServiceError("ITEM_NOT_FOUND"),
        );
        const { entry, variant } = await lockCatalogParents(tx, {
          catalogEntryId,
          catalogVariantId,
        });
        const existing = await lockOwnedItem(tx, itemId, actorUserId);
        ensureActive(existing);
        if (!entry) throw new ItemServiceError("CATALOG_NOT_FOUND");
        if (catalogVariantId !== null && !variant)
          throw new ItemServiceError("CATALOG_VARIANT_NOT_FOUND");
        if (
          existing.categoryTemplateId !== null &&
          existing.categoryTemplateId !== entry.categoryTemplateId
        )
          throw new ItemServiceError("ITEM_CATALOG_CATEGORY_MISMATCH");
        if (
          existing.catalogEntryId === catalogEntryId &&
          existing.catalogVariantId === catalogVariantId
        )
          return toItem(existing);
        if (variant && !variant.active) throw new ItemServiceError("CATALOG_VARIANT_INACTIVE");
        const saved = toItem(
          await tx.collectibleItem.update({
            where: { id: existing.id },
            data: {
              catalogEntryId,
              catalogVariantId,
              categoryTemplateId: existing.categoryTemplateId ?? entry.categoryTemplateId,
            },
            select: itemSelect,
          }),
        );
        const before = catalogLinkAuditSnapshot(existing),
          after = catalogLinkAuditSnapshot(saved);
        if (JSON.stringify(before) !== JSON.stringify(after))
          await auditPort.append(tx, audit, {
            resourceType: "ITEM",
            resourceId: itemId,
            action: "ITEM_CATALOG_LINK_CHANGED",
            before,
            after,
          });
        return saved;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function getItemCatalogLink(itemIdInput: string): Promise<ItemCatalogLink> {
    const itemId = CatalogReadIdSchema.parse(itemIdInput);
    return database.$transaction(
      async (tx) => {
        // One MVCC statement keeps revision, retained identity and personal assignment coherent.
        const [row] = await tx.$queryRaw<
          Array<
            CatalogReferences & {
              itemId: string;
              categoryTemplateId: string | null;
              revision: number | null;
              snapshot: unknown;
              variantAuthored: unknown;
              variantActive: boolean | null;
            }
          >
        >`
        SELECT item.id AS "itemId",item."categoryTemplateId",item."catalogEntryId",item."catalogVariantId",
               entry.revision,revision.snapshot,variant.authored AS "variantAuthored",variant.active AS "variantActive"
        FROM "CollectibleItem" item JOIN "Collection" collection ON collection.id=item."collectionId"
        LEFT JOIN "CatalogEntry" entry ON entry.id=item."catalogEntryId"
        LEFT JOIN "CatalogRevision" revision ON revision."entryId"=entry.id AND revision.revision=entry.revision
        LEFT JOIN "CatalogVariant" variant ON variant.id=item."catalogVariantId" AND variant."entryId"=item."catalogEntryId"
        WHERE item.id=${itemId}::uuid AND item."ownerId"=${actorUserId} AND collection."ownerId"=${actorUserId}
          AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
      `;
        if (!row) throw new ItemServiceError("ITEM_NOT_FOUND");
        const snapshot =
          row.catalogEntryId === null ? null : CatalogSnapshotSchema.parse(row.snapshot);
        const variant =
          row.catalogVariantId === null
            ? null
            : CatalogVariantSchema.parse({
                ...(row.variantAuthored as object),
                id: row.catalogVariantId,
                attributes: [],
              });
        return ItemCatalogLinkSchema.parse({
          itemId: row.itemId,
          categoryTemplateId: row.categoryTemplateId,
          catalogEntryId: row.catalogEntryId,
          catalogVariantId: row.catalogVariantId,
          entry:
            snapshot === null
              ? null
              : {
                  id: snapshot.id,
                  revision: row.revision,
                  text: catalogTitleSummary(snapshot.text),
                },
          variant:
            variant === null
              ? null
              : { ...catalogVariantSummary(variant), active: row.variantActive },
        });
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  return {
    createItem,
    updateItem,
    archiveItem,
    deleteItem,
    splitQuantityItem,
    linkItemToCatalog,
    unlinkItemFromCatalog,
    getItemCatalogLink,
  };
}
