import { randomUUID } from "node:crypto";
import { defaultMutationAudit, type MutationAuditPort } from "../audit/mutation-audit";
import {
  AncestorVisibilitySchema,
  CollectionNodeSchema,
  CollectionSchema,
  CreateCollectionInputSchema,
  CreateCollectionNodeInputSchema,
  MoveCollectionNodeInputSchema,
  UpdateCollectionInputSchema,
  UpdateCollectionNodeInputSchema,
  type AncestorVisibility,
  type Collection,
  type CollectionNode,
  type CreateCollectionInput,
  type CreateCollectionNodeInput,
  type MoveCollectionNodeInput,
  type UpdateCollectionInput,
  type UpdateCollectionNodeInput,
  type Visibility,
} from "@sammlerraum/contracts/collections";

const collectionSelect = { id: true, name: true, visibility: true } as const;
const collectionNodeSelect = {
  id: true,
  collectionId: true,
  parentId: true,
  name: true,
  visibility: true,
} as const;

type NodeIdentity = { id: string; collectionId: string };

type AncestryRow = {
  collectionVisibility: Visibility;
  nodeId: string | null;
  parentId: string | null;
  nodeCollectionId: string | null;
  nodeVisibility: Visibility | null;
  cycle: boolean | null;
  depth: number | null;
};

type CollectionTransaction = {
  collectionNode: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; collectionId: true };
    }): Promise<NodeIdentity | null>;
    create(args: {
      data: {
        collectionId: string;
        parentId: string | null;
        name: string;
        visibility: Visibility;
      };
      select: typeof collectionNodeSelect;
    }): Promise<CollectionNode>;
    updateMany(args: {
      where: { id: string; collectionId: string };
      data: { parentId: string | null };
    }): Promise<{ count: number }>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export type CollectionDatabase = {
  collection: {
    create(args: {
      data: { ownerId: string; name: string; visibility: Visibility };
      select: typeof collectionSelect;
    }): Promise<Collection>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $transaction<T>(
    operation: (transaction: CollectionTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};

export type CollectionServiceErrorCode =
  | "COLLECTION_NOT_FOUND"
  | "COLLECTION_NODE_NOT_FOUND"
  | "COLLECTION_HIERARCHY_CYCLE"
  | "COLLECTION_HIERARCHY_INVALID";

export class CollectionServiceError extends Error {
  constructor(readonly code: CollectionServiceErrorCode) {
    super(
      code === "COLLECTION_HIERARCHY_CYCLE"
        ? "Collection hierarchy cycle"
        : code === "COLLECTION_HIERARCHY_INVALID"
          ? "Collection hierarchy is invalid"
          : code === "COLLECTION_NODE_NOT_FOUND"
            ? "Collection node not found"
            : "Collection not found",
    );
    this.name = "CollectionServiceError";
  }
}

async function lockOwnedCollection(
  transaction: CollectionTransaction,
  collectionId: string,
  actorUserId: string,
): Promise<Collection> {
  const locked = await transaction.$queryRaw<Collection[]>`
    SELECT "id","name","visibility"
    FROM "Collection"
    WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${actorUserId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  if (locked.length !== 1) {
    throw new CollectionServiceError("COLLECTION_NOT_FOUND");
  }
  return locked[0]!;
}

function nodeSnapshot(node: CollectionNode) {
  return {
    collectionId: node.collectionId,
    parentId: node.parentId,
    name: node.name,
    visibility: node.visibility,
  };
}
async function nodeAuditSnapshot(tx: CollectionTransaction, nodeId: string, collectionId: string) {
  const [row] = await tx.$queryRaw<
    CollectionNode[]
  >`SELECT id,"collectionId","parentId",name,visibility FROM "CollectionNode" WHERE id=${nodeId}::uuid AND "collectionId"=${collectionId}::uuid`;
  if (!row) throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
  return nodeSnapshot(row);
}

export function createCollectionService(
  database: CollectionDatabase,
  actorUserId: string,
  auditPort: MutationAuditPort = defaultMutationAudit,
) {
  async function createCollection(input: CreateCollectionInput): Promise<Collection> {
    const data = CreateCollectionInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new CollectionServiceError("COLLECTION_NOT_FOUND"),
        );
        const [collection] = await transaction.$queryRaw<
          Collection[]
        >`INSERT INTO "Collection" (id,"ownerId",name,visibility,"updatedAt") VALUES (${randomUUID()}::uuid,${actorUserId},${data.name},${data.visibility}::"Visibility",CURRENT_TIMESTAMP) RETURNING id,name,visibility`;
        if (!collection) throw new CollectionServiceError("COLLECTION_NOT_FOUND");
        await auditPort.append(transaction, audit, {
          resourceType: "COLLECTION",
          resourceId: collection.id,
          action: "COLLECTION_CREATED",
          before: null,
          after: { name: collection.name, visibility: collection.visibility },
        });
        return CollectionSchema.parse(collection);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function createCollectionNode(input: CreateCollectionNodeInput): Promise<CollectionNode> {
    const data = CreateCollectionNodeInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new CollectionServiceError("COLLECTION_NOT_FOUND"),
        );
        await lockOwnedCollection(transaction, data.collectionId, actorUserId);
        if (data.parentId !== null) {
          const parent = await transaction.collectionNode.findUnique({
            where: { id: data.parentId },
            select: { id: true, collectionId: true },
          });
          if (!parent || parent.collectionId !== data.collectionId) {
            throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
          }
        }
        const node = await transaction.collectionNode.create({
          data: {
            collectionId: data.collectionId,
            parentId: data.parentId,
            name: data.name,
            visibility: data.visibility,
          },
          select: collectionNodeSelect,
        });
        await auditPort.append(transaction, audit, {
          resourceType: "NODE",
          resourceId: node.id,
          action: "NODE_CREATED",
          before: null,
          after: nodeSnapshot(node),
        });
        return CollectionNodeSchema.parse(node);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function updateCollection(
    collectionIdInput: string,
    input: UpdateCollectionInput,
  ): Promise<Collection> {
    const collectionId = CollectionSchema.shape.id.parse(collectionIdInput);
    const data = UpdateCollectionInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new CollectionServiceError("COLLECTION_NOT_FOUND"),
        );
        const before = await lockOwnedCollection(transaction, collectionId, actorUserId);
        const rows = await transaction.$queryRaw<Collection[]>`
          UPDATE "Collection"
          SET
            "name" = COALESCE(${data.name ?? null}, "name"),
            "visibility" = COALESCE(${data.visibility ?? null}::"Visibility", "visibility"),
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${actorUserId} AND "deletedAt" IS NULL
          RETURNING "id", "name", "visibility"
        `;
        const updated = rows[0];
        if (!updated) throw new CollectionServiceError("COLLECTION_NOT_FOUND");
        if (before.name !== updated.name)
          await auditPort.append(transaction, audit, {
            resourceType: "COLLECTION",
            resourceId: collectionId,
            action: "COLLECTION_DETAILS_CHANGED",
            before: { name: before.name },
            after: { name: updated.name },
          });
        if (before.visibility !== updated.visibility)
          await auditPort.append(transaction, audit, {
            resourceType: "COLLECTION",
            resourceId: collectionId,
            action: "COLLECTION_VISIBILITY_CHANGED",
            before: { visibility: before.visibility },
            after: { visibility: updated.visibility },
          });
        return CollectionSchema.parse(updated);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function deleteCollection(collectionIdInput: string): Promise<void> {
    const collectionId = CollectionSchema.shape.id.parse(collectionIdInput);
    await database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new CollectionServiceError("COLLECTION_NOT_FOUND"),
        );
        await lockOwnedCollection(transaction, collectionId, actorUserId);
        const rows = await transaction.$queryRaw<Array<{ id: string }>>`
          UPDATE "Collection"
          SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${actorUserId} AND "deletedAt" IS NULL
          RETURNING "id"
        `;
        if (rows.length !== 1) throw new CollectionServiceError("COLLECTION_NOT_FOUND");
        await auditPort.append(transaction, audit, {
          resourceType: "COLLECTION",
          resourceId: collectionId,
          action: "COLLECTION_DELETED",
          before: { deleted: false },
          after: { deleted: true },
        });
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function updateCollectionNode(
    nodeIdInput: string,
    input: UpdateCollectionNodeInput,
  ): Promise<CollectionNode> {
    const nodeId = CollectionNodeSchema.shape.id.parse(nodeIdInput);
    const data = UpdateCollectionNodeInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new CollectionServiceError("COLLECTION_NOT_FOUND"),
        );
        const staleSource = await transaction.collectionNode.findUnique({
          where: { id: nodeId },
          select: { id: true, collectionId: true },
        });
        if (!staleSource) throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
        await lockOwnedCollection(transaction, staleSource.collectionId, actorUserId);
        const source = await transaction.collectionNode.findUnique({
          where: { id: nodeId },
          select: { id: true, collectionId: true },
        });
        if (!source || source.collectionId !== staleSource.collectionId) {
          throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
        }
        if (data.parentId !== undefined && data.parentId !== null) {
          const parent = await transaction.collectionNode.findUnique({
            where: { id: data.parentId },
            select: { id: true, collectionId: true },
          });
          if (!parent || parent.collectionId !== source.collectionId) {
            throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
          }
          const descendants = await transaction.$queryRaw<
            Array<{ id: string; collectionId: string; cycle: boolean }>
          >`
            WITH RECURSIVE descendants AS (
              SELECT "id", "collectionId", ARRAY["id"] AS path, false AS cycle
              FROM "CollectionNode"
              WHERE "id" = ${nodeId}::uuid AND "collectionId" = ${source.collectionId}::uuid
              UNION ALL
              SELECT child."id", child."collectionId", parent.path || child."id",
                     child."id" = ANY(parent.path)
              FROM "CollectionNode" child JOIN descendants parent ON child."parentId" = parent."id"
              WHERE NOT parent.cycle
            )
            SELECT "id", "collectionId", cycle FROM descendants
          `;
          if (
            descendants.length === 0 ||
            descendants.some((row) => row.cycle || row.collectionId !== source.collectionId)
          ) {
            throw new CollectionServiceError("COLLECTION_HIERARCHY_INVALID");
          }
          if (descendants.some((row) => row.id === data.parentId)) {
            throw new CollectionServiceError("COLLECTION_HIERARCHY_CYCLE");
          }
        }
        const before = await nodeAuditSnapshot(transaction, nodeId, source.collectionId);
        const rows = await transaction.$queryRaw<CollectionNode[]>`
          UPDATE "CollectionNode"
          SET
            "parentId" = CASE WHEN ${data.parentId !== undefined} THEN ${data.parentId ?? null}::uuid ELSE "parentId" END,
            "name" = COALESCE(${data.name ?? null}, "name"),
            "visibility" = COALESCE(${data.visibility ?? null}::"Visibility", "visibility"),
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${nodeId}::uuid AND "collectionId" = ${source.collectionId}::uuid
          RETURNING "id", "collectionId", "parentId", "name", "visibility"
        `;
        const updated = rows[0];
        if (!updated) throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
        const after = nodeSnapshot(updated);
        if (JSON.stringify(before) !== JSON.stringify(after))
          await auditPort.append(transaction, audit, {
            resourceType: "NODE",
            resourceId: nodeId,
            action: "NODE_DETAILS_CHANGED",
            before,
            after,
          });
        return CollectionNodeSchema.parse(updated);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function moveCollectionNode(
    nodeIdInput: string,
    input: MoveCollectionNodeInput,
  ): Promise<void> {
    const nodeId = CollectionNodeSchema.shape.id.parse(nodeIdInput);
    const data = MoveCollectionNodeInputSchema.parse(input);
    await database.$transaction(
      async (transaction) => {
        const audit = await auditPort.begin(
          transaction,
          actorUserId,
          () => new CollectionServiceError("COLLECTION_NOT_FOUND"),
        );
        const staleSource = await transaction.collectionNode.findUnique({
          where: { id: nodeId },
          select: { id: true, collectionId: true },
        });
        if (!staleSource) {
          throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
        }
        await lockOwnedCollection(transaction, staleSource.collectionId, actorUserId);

        const source = await transaction.collectionNode.findUnique({
          where: { id: nodeId },
          select: { id: true, collectionId: true },
        });
        if (!source || source.collectionId !== staleSource.collectionId) {
          throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
        }
        if (data.parentId !== null) {
          const parent = await transaction.collectionNode.findUnique({
            where: { id: data.parentId },
            select: { id: true, collectionId: true },
          });
          if (!parent || parent.collectionId !== source.collectionId) {
            throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
          }
        }

        const descendants = await transaction.$queryRaw<
          Array<{ id: string; collectionId: string; cycle: boolean }>
        >`
          WITH RECURSIVE descendants AS (
            SELECT
              "id",
              "collectionId",
              ARRAY["id"] AS path,
              false AS cycle
            FROM "CollectionNode"
            WHERE "id" = ${nodeId}::uuid AND "collectionId" = ${source.collectionId}::uuid
            UNION ALL
            SELECT
              child."id",
              child."collectionId",
              parent.path || child."id",
              child."id" = ANY(parent.path)
            FROM "CollectionNode" child
            JOIN descendants parent ON child."parentId" = parent."id"
            WHERE NOT parent.cycle
          )
          SELECT "id", "collectionId", cycle FROM descendants
        `;
        if (
          descendants.some(
            (descendant) =>
              descendant.cycle === true || descendant.collectionId !== source.collectionId,
          )
        ) {
          throw new CollectionServiceError("COLLECTION_HIERARCHY_INVALID");
        }
        if (
          data.parentId !== null &&
          descendants.some((descendant) => descendant.id === data.parentId)
        ) {
          throw new CollectionServiceError("COLLECTION_HIERARCHY_CYCLE");
        }

        const before = await nodeAuditSnapshot(transaction, nodeId, source.collectionId);
        const result = await transaction.collectionNode.updateMany({
          where: { id: nodeId, collectionId: source.collectionId },
          data: { parentId: data.parentId },
        });
        if (result.count !== 1) {
          throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
        }
        if (before.parentId !== data.parentId)
          await auditPort.append(transaction, audit, {
            resourceType: "NODE",
            resourceId: nodeId,
            action: "NODE_MOVED",
            before,
            after: { ...before, parentId: data.parentId },
          });
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function getAncestorVisibility(
    collectionIdInput: string,
    nodeIdInput: string | null,
  ): Promise<AncestorVisibility> {
    const collectionId = CollectionSchema.shape.id.parse(collectionIdInput);
    const nodeId = nodeIdInput === null ? null : CollectionNodeSchema.shape.id.parse(nodeIdInput);
    const rows = await database.$queryRaw<AncestryRow[]>`
      WITH RECURSIVE ancestry AS (
        SELECT
          node."id",
          node."parentId",
          node."collectionId",
          node."visibility",
          ARRAY[node."id"] AS path,
          false AS cycle,
          0 AS depth
        FROM "CollectionNode" node
        WHERE node."id" = ${nodeId}::uuid AND node."collectionId" = ${collectionId}::uuid

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
        WHERE NOT child.cycle
      )
      SELECT
        collection."visibility" AS "collectionVisibility",
        ancestry."id" AS "nodeId",
        ancestry."parentId",
        ancestry."collectionId" AS "nodeCollectionId",
        ancestry."visibility" AS "nodeVisibility",
        ancestry.cycle,
        ancestry.depth
      FROM "Collection" collection
      LEFT JOIN ancestry ON true
      WHERE collection."id" = ${collectionId}::uuid AND collection."deletedAt" IS NULL
      ORDER BY ancestry.depth DESC NULLS LAST
    `;
    if (rows.length === 0) {
      throw new CollectionServiceError("COLLECTION_NOT_FOUND");
    }
    const nodeRows = rows.filter(
      (row): row is AncestryRow & { nodeId: string; nodeVisibility: Visibility; depth: number } =>
        row.nodeId !== null && row.nodeVisibility !== null && row.depth !== null,
    );
    if (nodeId !== null && nodeRows.length === 0) {
      throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
    }
    if (
      nodeRows.some((row) => row.cycle === true || row.nodeCollectionId !== collectionId) ||
      (nodeRows.length > 0 && nodeRows[0]?.parentId !== null)
    ) {
      throw new CollectionServiceError("COLLECTION_HIERARCHY_INVALID");
    }

    const visibilityPath = [
      rows[0]!.collectionVisibility,
      ...nodeRows.map((row) => row.nodeVisibility),
    ];
    const effectiveVisibility: Visibility = visibilityPath.includes("PRIVATE")
      ? "PRIVATE"
      : visibilityPath.includes("UNLISTED")
        ? "UNLISTED"
        : "PUBLIC";
    return AncestorVisibilitySchema.parse({ visibilityPath, effectiveVisibility });
  }

  return {
    createCollection,
    updateCollection,
    deleteCollection,
    createCollectionNode,
    updateCollectionNode,
    moveCollectionNode,
    moveNode: moveCollectionNode,
    getAncestorVisibility,
  };
}
