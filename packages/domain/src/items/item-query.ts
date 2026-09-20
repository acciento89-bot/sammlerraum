import {
  PublicItemSchema,
  type PublicItem,
  type TradeStatus,
  type Visibility,
} from "@sammlerraum/contracts/items";

import { authorize } from "../authz/policy";
import { createTrustedActorFacts, createTrustedResourceFacts } from "../authz/types";

type PublicItemRow = {
  id: string;
  title: string;
  publicDescription: string | null;
  quantity: number;
  tradeStatus: TradeStatus;
  itemVisibility: Visibility;
  ownerId: string;
  collectionVisibility: Visibility;
  archivedAt?: Date | string | null;
  disposedAt?: Date | string | null;
  itemNodeId: string | null;
  nodeId: string | null;
  parentId: string | null;
  nodeVisibility: Visibility | null;
  cycle: boolean | null;
  depth: number | null;
};

export type ItemQueryDatabase = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export class PublicItemQueryError extends Error {
  readonly code = "ITEM_NOT_FOUND";

  constructor() {
    super("Item not found");
    this.name = "PublicItemQueryError";
  }
}

const anonymousActor = createTrustedActorFacts({ type: "ANONYMOUS" });

export function createItemQuery(database: ItemQueryDatabase) {
  async function getPublicItem(itemIdInput: string): Promise<PublicItem> {
    const itemId = PublicItemSchema.shape.id.parse(itemIdInput);
    const rows = await database.$queryRaw<PublicItemRow[]>`
      WITH RECURSIVE item_base AS (
        SELECT
          item."id",
          item."title",
          item."publicDescription",
          item."quantity",
          item."tradeStatus",
          item."visibility" AS "itemVisibility",
          item."archivedAt",
          item."disposedAt",
          item."deletedAt",
          item."nodeId" AS "itemNodeId",
          item."collectionId",
          collection."ownerId",
          collection."visibility" AS "collectionVisibility"
        FROM "CollectibleItem" item
        JOIN "Collection" collection ON collection."id" = item."collectionId"
        WHERE item."id" = ${itemId}::uuid
          AND item."deletedAt" IS NULL
          AND collection."deletedAt" IS NULL
      ),
      ancestry AS (
        SELECT
          node."id" AS "nodeId",
          node."parentId",
          node."collectionId",
          node."visibility" AS "nodeVisibility",
          ARRAY[node."id"] AS path,
          false AS cycle,
          0 AS depth
        FROM "CollectionNode" node
        JOIN item_base item ON item."itemNodeId" = node."id"
          AND item."collectionId" = node."collectionId"

        UNION ALL

        SELECT
          parent."id",
          parent."parentId",
          parent."collectionId",
          parent."visibility",
          child.path || parent."id",
          parent."id" = ANY(child.path),
          child.depth + 1
        FROM "CollectionNode" parent
        JOIN ancestry child ON parent."id" = child."parentId"
          AND parent."collectionId" = child."collectionId"
        WHERE NOT child.cycle
      )
      SELECT
        item."id",
        item."title",
        item."publicDescription",
        item."quantity",
        item."tradeStatus",
        item."itemVisibility",
        item."ownerId",
        item."collectionVisibility",
        item."archivedAt",
        item."disposedAt",
        item."itemNodeId",
        ancestry."nodeId",
        ancestry."parentId",
        ancestry."nodeVisibility",
        ancestry.cycle,
        ancestry.depth
      FROM item_base item
      LEFT JOIN ancestry ON true
      ORDER BY ancestry.depth ASC NULLS FIRST
    `;
    const item = rows[0];
    if (!item || item.archivedAt != null || item.disposedAt != null) {
      throw new PublicItemQueryError();
    }
    const nodeRows = rows.filter(
      (row): row is PublicItemRow & { nodeId: string; nodeVisibility: Visibility } =>
        row.nodeId !== null && row.nodeVisibility !== null,
    );
    if (
      (item.itemNodeId !== null && nodeRows.length === 0) ||
      nodeRows.some((row) => row.cycle === true) ||
      (nodeRows.length > 0 && !nodeRows.some((row) => row.parentId === null))
    ) {
      throw new PublicItemQueryError();
    }
    const resource = createTrustedResourceFacts({
      type: "ITEM",
      ownerId: item.ownerId,
      visibility: item.itemVisibility,
      ancestorVisibility: [item.collectionVisibility, ...nodeRows.map((row) => row.nodeVisibility)],
      role: null,
      moderation: "VISIBLE",
      interactionBlocked: false,
      commentsEnabled: false,
    });
    if (!authorize(anonymousActor, "item.view", resource).allowed) {
      throw new PublicItemQueryError();
    }

    return PublicItemSchema.parse({
      id: item.id,
      title: item.title,
      publicDescription: item.publicDescription,
      quantity: item.quantity,
      tradeStatus: item.tradeStatus,
    });
  }

  return { getPublicItem };
}
