import {
  CollectionNodeSchema,
  CollectionSchema,
  type Collection,
  type CollectionNode,
  type Visibility,
} from "@sammlerraum/contracts/collections";
import {
  CollectibleItemSchema,
  type AcquisitionType,
  type CollectibleItem,
  type TradeStatus,
} from "@sammlerraum/contracts/items";
import {
  CustomFieldDefinitionSchema,
  type CustomFieldDefinition,
  type CustomFieldType,
} from "@sammlerraum/contracts/custom-fields";
import { StorageLocationSchema, type StorageLocation } from "@sammlerraum/contracts/locations";

import { createTrustedResourceFacts, type ResourceFacts } from "../authz/types";
import { validateFieldValue } from "../custom-fields/custom-field-service";

export type ResourceQueryDatabase = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export class ResourceQueryError extends Error {
  readonly code = "NOT_FOUND";
  constructor() {
    super("Resource not found");
    this.name = "ResourceQueryError";
  }
}

type CollectionRow = Collection & { ownerId: string };
type NodeRow = CollectionNode & {
  ownerId: string;
  collectionVisibility: Visibility;
  ancestorId: string | null;
  ancestorParentId: string | null;
  ancestorVisibility: Visibility | null;
  cycle: boolean | null;
  depth: number | null;
};
type ItemRow = {
  id: string;
  collectionId: string;
  ownerId: string;
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
  collectionVisibility: Visibility;
  ancestorId: string | null;
  ancestorParentId: string | null;
  ancestorVisibility: Visibility | null;
  cycle: boolean | null;
  depth: number | null;
};

function dateOnly(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function timestamp(value: Date | string): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function safeNumber(value: bigint | number): number {
  const result = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(result)) throw new RangeError("Stored money is outside the safe range");
  return result;
}

function canonicalStoredDecimal(value: unknown): string {
  const ordinary =
    typeof value === "string"
      ? value
      : typeof value === "object" &&
          value !== null &&
          "toFixed" in value &&
          typeof value.toFixed === "function"
        ? value.toFixed()
        : null;
  if (ordinary === null) throw new TypeError("Stored decimal has an invalid representation");
  return validateFieldValue("DECIMAL", ordinary) as string;
}

function itemDto(row: ItemRow): CollectibleItem {
  return CollectibleItemSchema.parse({
    ...row,
    acquisitionDate: row.acquisitionDate === null ? null : dateOnly(row.acquisitionDate),
    purchaseAmountMinor:
      row.purchaseAmountMinor === null ? null : safeNumber(row.purchaseAmountMinor),
    archivedAt: row.archivedAt === null ? null : timestamp(row.archivedAt),
    disposedAt: row.disposedAt === null ? null : timestamp(row.disposedAt),
  });
}

function ancestry<
  T extends {
    ancestorId: string | null;
    ancestorParentId: string | null;
    ancestorVisibility: Visibility | null;
    cycle: boolean | null;
  },
>(rows: T[], expectedNode: string | null): Visibility[] {
  const nodeRows = rows.filter(
    (row): row is T & { ancestorId: string; ancestorVisibility: Visibility } =>
      row.ancestorId !== null && row.ancestorVisibility !== null,
  );
  if (
    (expectedNode !== null && nodeRows.length === 0) ||
    nodeRows.some((row) => row.cycle === true) ||
    (nodeRows.length > 0 && !nodeRows.some((row) => row.ancestorParentId === null))
  ) {
    throw new ResourceQueryError();
  }
  return nodeRows.map((row) => row.ancestorVisibility);
}

export function createResourceQuery(database: ResourceQueryDatabase) {
  async function loadCollection(
    collectionId: string,
  ): Promise<{ collection: Collection; facts: ResourceFacts }> {
    const id = CollectionSchema.shape.id.parse(collectionId);
    const rows = await database.$queryRaw<CollectionRow[]>`
      SELECT "id", "ownerId", "name", "visibility"
      FROM "Collection"
      WHERE "id" = ${id}::uuid AND "deletedAt" IS NULL
    `;
    const row = rows[0];
    if (!row) throw new ResourceQueryError();
    return {
      collection: CollectionSchema.parse(row),
      facts: createTrustedResourceFacts({
        type: "COLLECTION",
        ownerId: row.ownerId,
        visibility: row.visibility,
        ancestorVisibility: [],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      }),
    };
  }

  async function loadNode(nodeId: string): Promise<{ node: CollectionNode; facts: ResourceFacts }> {
    const id = CollectionNodeSchema.shape.id.parse(nodeId);
    const rows = await database.$queryRaw<NodeRow[]>`
      WITH RECURSIVE base AS (
        SELECT node."id", node."collectionId", node."parentId", node."name", node."visibility",
               collection."ownerId", collection."visibility" AS "collectionVisibility"
        FROM "CollectionNode" node
        JOIN "Collection" collection ON collection."id" = node."collectionId"
        WHERE node."id" = ${id}::uuid AND collection."deletedAt" IS NULL
      ), ancestry AS (
        SELECT parent."id" AS "ancestorId", parent."parentId" AS "ancestorParentId",
               parent."visibility" AS "ancestorVisibility", ARRAY[parent."id"] AS path,
               false AS cycle, 0 AS depth
        FROM "CollectionNode" parent JOIN base ON base."parentId" = parent."id"
        UNION ALL
        SELECT parent."id", parent."parentId", parent."visibility", child.path || parent."id",
               parent."id" = ANY(child.path), child.depth + 1
        FROM "CollectionNode" parent JOIN ancestry child ON child."ancestorParentId" = parent."id"
        WHERE NOT child.cycle
      )
      SELECT base.*, ancestry."ancestorId", ancestry."ancestorParentId", ancestry."ancestorVisibility",
             ancestry.cycle, ancestry.depth
      FROM base LEFT JOIN ancestry ON true ORDER BY ancestry.depth ASC NULLS FIRST
    `;
    const row = rows[0];
    if (!row) throw new ResourceQueryError();
    const parentVisibility = ancestry(rows, row.parentId);
    return {
      node: CollectionNodeSchema.parse(row),
      facts: createTrustedResourceFacts({
        type: "COLLECTION",
        ownerId: row.ownerId,
        visibility: row.visibility,
        ancestorVisibility: [row.collectionVisibility, ...parentVisibility],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
      }),
    };
  }

  async function loadItem(
    itemId: string,
  ): Promise<{ item: CollectibleItem; facts: ResourceFacts }> {
    const id = CollectibleItemSchema.shape.id.parse(itemId);
    const rows = await database.$queryRaw<ItemRow[]>`
      WITH RECURSIVE base AS (
        SELECT item."id", item."collectionId", item."ownerId", item."nodeId", item."title",
               item."publicDescription", item."privateNotes", item."quantity", item."acquisitionType",
               item."acquisitionDate", item."purchaseAmountMinor", item."purchaseCurrency",
               item."visibility", item."tradeStatus", item."archivedAt", item."disposedAt",
               collection."visibility" AS "collectionVisibility"
        FROM "CollectibleItem" item
        JOIN "Collection" collection ON collection."id" = item."collectionId"
        WHERE item."id" = ${id}::uuid AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
      ), ancestry AS (
        SELECT node."id" AS "ancestorId", node."parentId" AS "ancestorParentId",
               node."visibility" AS "ancestorVisibility", ARRAY[node."id"] AS path,
               false AS cycle, 0 AS depth
        FROM "CollectionNode" node JOIN base
          ON base."nodeId" = node."id" AND base."collectionId" = node."collectionId"
        UNION ALL
        SELECT parent."id", parent."parentId", parent."visibility", child.path || parent."id",
               parent."id" = ANY(child.path), child.depth + 1
        FROM "CollectionNode" parent JOIN ancestry child ON child."ancestorParentId" = parent."id"
        WHERE NOT child.cycle
      )
      SELECT base.*, ancestry."ancestorId", ancestry."ancestorParentId", ancestry."ancestorVisibility",
             ancestry.cycle, ancestry.depth
      FROM base LEFT JOIN ancestry ON true ORDER BY ancestry.depth ASC NULLS FIRST
    `;
    const row = rows[0];
    if (!row) throw new ResourceQueryError();
    const nodeVisibility = ancestry(rows, row.nodeId);
    return {
      item: itemDto(row),
      facts: createTrustedResourceFacts({
        type: "ITEM",
        ownerId: row.ownerId,
        visibility: row.visibility,
        ancestorVisibility: [row.collectionVisibility, ...nodeVisibility],
        role: null,
        moderation: "VISIBLE",
        interactionBlocked: false,
        commentsEnabled: false,
      }),
    };
  }

  async function listCollections(ownerId: string | null): Promise<Collection[]> {
    const rows =
      ownerId === null
        ? await database.$queryRaw<Collection[]>`
          SELECT "id", "name", "visibility" FROM "Collection"
          WHERE "deletedAt" IS NULL AND "visibility" = 'PUBLIC'
          ORDER BY "name", "id"
        `
        : await database.$queryRaw<Collection[]>`
          SELECT "id", "name", "visibility" FROM "Collection"
          WHERE "deletedAt" IS NULL AND "ownerId" = ${ownerId}
          ORDER BY "name", "id"
        `;
    return rows.map((row) => CollectionSchema.parse(row));
  }

  async function listNodes(collectionId: string, ownerId: string): Promise<CollectionNode[]> {
    const id = CollectionSchema.shape.id.parse(collectionId);
    const rows = await database.$queryRaw<CollectionNode[]>`
      SELECT node."id", node."collectionId", node."parentId", node."name", node."visibility"
      FROM "CollectionNode" node JOIN "Collection" collection ON collection."id" = node."collectionId"
      WHERE node."collectionId" = ${id}::uuid AND collection."ownerId" = ${ownerId}
        AND collection."deletedAt" IS NULL
      ORDER BY node."name", node."id"
    `;
    return rows.map((row) => CollectionNodeSchema.parse(row));
  }

  async function listItems(collectionId: string, ownerId: string): Promise<CollectibleItem[]> {
    const id = CollectionSchema.shape.id.parse(collectionId);
    const rows = await database.$queryRaw<ItemRow[]>`
      SELECT item.*, collection."visibility" AS "collectionVisibility",
             NULL::uuid AS "ancestorId", NULL::uuid AS "ancestorParentId",
             NULL::"Visibility" AS "ancestorVisibility", NULL::boolean AS cycle, NULL::integer AS depth
      FROM "CollectibleItem" item JOIN "Collection" collection ON collection."id" = item."collectionId"
      WHERE item."collectionId" = ${id}::uuid AND item."ownerId" = ${ownerId}
        AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
      ORDER BY item."title", item."id"
    `;
    return rows.map(itemDto);
  }

  async function listCustomFields(
    collectionId: string,
    ownerId: string,
  ): Promise<CustomFieldDefinition[]> {
    const id = CollectionSchema.shape.id.parse(collectionId);
    const rows = await database.$queryRaw<
      Array<{
        id: string;
        collectionId: string;
        name: string;
        type: CustomFieldType;
        options: string[] | null;
      }>
    >`
      SELECT definition."id", definition."collectionId", definition."name", definition."type",
             COALESCE(array_agg(option."value" ORDER BY option."position") FILTER (WHERE option."id" IS NOT NULL), ARRAY[]::text[]) AS options
      FROM "CustomFieldDefinition" definition
      JOIN "Collection" collection ON collection."id" = definition."collectionId"
      LEFT JOIN "CustomFieldOption" option ON option."fieldDefinitionId" = definition."id"
      WHERE definition."collectionId" = ${id}::uuid AND collection."ownerId" = ${ownerId}
        AND collection."deletedAt" IS NULL
      GROUP BY definition."id" ORDER BY definition."name", definition."id"
    `;
    return rows.map((row) =>
      CustomFieldDefinitionSchema.parse({ ...row, options: row.options ?? [] }),
    );
  }

  async function listLocations(ownerId: string): Promise<StorageLocation[]> {
    const rows = await database.$queryRaw<StorageLocation[]>`
      SELECT "id", "parentId", "name", "type", "visibility", "qrToken"
      FROM "StorageLocation" WHERE "ownerId" = ${ownerId} ORDER BY "name", "id"
    `;
    return rows.map((row) => StorageLocationSchema.parse(row));
  }

  async function getItemMetadata(itemId: string, ownerId: string) {
    const id = CollectibleItemSchema.shape.id.parse(itemId);
    const [identifiers, tags, fieldValues, selectedOptions, locations] = await Promise.all([
      database.$queryRaw<
        Array<{ id: string; itemId: string; type: string; value: string; normalizedValue: string }>
      >`
        SELECT identifier."id", identifier."itemId", identifier."type", identifier."value", identifier."normalizedValue"
        FROM "ItemIdentifier" identifier
        JOIN "CollectibleItem" item ON item."id" = identifier."itemId"
        JOIN "Collection" collection ON collection."id" = item."collectionId"
        WHERE identifier."itemId" = ${id}::uuid AND item."ownerId" = ${ownerId}
          AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
        ORDER BY identifier."type", identifier."normalizedValue"
      `,
      database.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT tag."id", tag."name" FROM "Tag" tag
        JOIN "ItemTag" item_tag ON item_tag."tagId" = tag."id"
        JOIN "CollectibleItem" item ON item."id" = item_tag."itemId"
        JOIN "Collection" collection ON collection."id" = item."collectionId"
        WHERE item_tag."itemId" = ${id}::uuid AND item."ownerId" = ${ownerId}
          AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
        ORDER BY tag."normalizedName"
      `,
      database.$queryRaw<
        Array<Record<string, unknown> & { fieldDefinitionId: string; fieldType: CustomFieldType }>
      >`
        SELECT value.*, option."value" AS "singleSelectValue"
        FROM "CustomFieldValue" value
        JOIN "CollectibleItem" item ON item."id" = value."itemId"
        JOIN "Collection" collection ON collection."id" = item."collectionId"
        LEFT JOIN "CustomFieldOption" option ON option."id" = value."singleSelectOptionId"
        WHERE value."itemId" = ${id}::uuid AND item."ownerId" = ${ownerId}
          AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
        ORDER BY value."fieldDefinitionId"
      `,
      database.$queryRaw<Array<{ fieldDefinitionId: string; value: string }>>`
        SELECT selected."fieldDefinitionId", option."value"
        FROM "CustomFieldMultiSelectValue" selected
        JOIN "CustomFieldOption" option ON option."id" = selected."optionId"
        JOIN "CollectibleItem" item ON item."id" = selected."itemId"
        JOIN "Collection" collection ON collection."id" = item."collectionId"
        WHERE selected."itemId" = ${id}::uuid AND item."ownerId" = ${ownerId}
          AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
        ORDER BY selected."fieldDefinitionId", selected."position"
      `,
      database.$queryRaw<StorageLocation[]>`
        SELECT location."id", location."parentId", location."name", location."type", location."visibility", location."qrToken"
        FROM "CollectibleItem" item
        JOIN "Collection" collection ON collection."id" = item."collectionId"
        JOIN "StorageLocation" location ON location."id" = item."storageLocationId" AND location."ownerId" = item."ownerId"
        WHERE item."id" = ${id}::uuid AND item."ownerId" = ${ownerId}
          AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
      `,
    ]);
    const multiByField = new Map<string, string[]>();
    for (const option of selectedOptions) {
      const current = multiByField.get(option.fieldDefinitionId) ?? [];
      current.push(option.value);
      multiByField.set(option.fieldDefinitionId, current);
    }
    const values = fieldValues.map((row) => {
      const value =
        row.fieldType === "SHORT_TEXT"
          ? row.shortTextValue
          : row.fieldType === "LONG_TEXT"
            ? row.longTextValue
            : row.fieldType === "INTEGER"
              ? safeNumber(row.integerValue as bigint | number)
              : row.fieldType === "DECIMAL"
                ? canonicalStoredDecimal(row.decimalValue)
                : row.fieldType === "DATE"
                  ? dateOnly(row.dateValue as Date | string)
                  : row.fieldType === "BOOLEAN"
                    ? row.booleanValue
                    : row.fieldType === "SINGLE_SELECT"
                      ? row.singleSelectValue
                      : row.fieldType === "MULTI_SELECT"
                        ? (multiByField.get(row.fieldDefinitionId) ?? [])
                        : row.fieldType === "URL"
                          ? row.urlValue
                          : {
                              amountMinor: safeNumber(row.moneyAmountMinor as bigint | number),
                              currency: row.moneyCurrency,
                            };
      return { fieldDefinitionId: row.fieldDefinitionId, type: row.fieldType, value };
    });
    return {
      identifiers,
      tags: tags.map((tag) => tag.name),
      customFieldValues: values,
      location: locations[0] ? StorageLocationSchema.parse(locations[0]) : null,
    };
  }

  return {
    loadCollection,
    loadNode,
    loadItem,
    listCollections,
    listNodes,
    listItems,
    listCustomFields,
    listLocations,
    getItemMetadata,
  };
}
