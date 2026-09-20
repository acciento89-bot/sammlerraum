import {
  CollectionNodeSchema,
  CollectionSchema,
  CreateCollectionInputSchema,
  CreateCollectionNodeInputSchema,
  MoveCollectionNodeInputSchema,
  type Collection,
  type CollectionNode,
  type CreateCollectionInput,
  type CreateCollectionNodeInput,
  type MoveCollectionNodeInput,
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
): Promise<void> {
  const locked = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Collection"
    WHERE "id" = ${collectionId}::uuid AND "ownerId" = ${actorUserId}
    FOR UPDATE
  `;
  if (locked.length !== 1) {
    throw new CollectionServiceError("COLLECTION_NOT_FOUND");
  }
}

export function createCollectionService(database: CollectionDatabase, actorUserId: string) {
  async function createCollection(input: CreateCollectionInput): Promise<Collection> {
    const data = CreateCollectionInputSchema.parse(input);
    const collection = await database.collection.create({
      data: { ownerId: actorUserId, name: data.name, visibility: data.visibility },
      select: collectionSelect,
    });
    return CollectionSchema.parse(collection);
  }

  async function createCollectionNode(input: CreateCollectionNodeInput): Promise<CollectionNode> {
    const data = CreateCollectionNodeInputSchema.parse(input);
    return database.$transaction(
      async (transaction) => {
        await lockOwnedCollection(transaction, data.collectionId, actorUserId);
        if (data.parentId !== null) {
          const parent = await transaction.collectionNode.findUnique({
            where: { id: data.parentId },
            select: { id: true, collectionId: true },
          });
          if (!parent) {
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
        return CollectionNodeSchema.parse(node);
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

        const descendants = await transaction.$queryRaw<Array<{ id: string }>>`
          WITH RECURSIVE descendants AS (
            SELECT "id"
            FROM "CollectionNode"
            WHERE "id" = ${nodeId}::uuid AND "collectionId" = ${source.collectionId}::uuid
            UNION ALL
            SELECT child."id"
            FROM "CollectionNode" child
            JOIN descendants parent ON child."parentId" = parent."id"
            WHERE child."collectionId" = ${source.collectionId}::uuid
          )
          SELECT "id" FROM descendants
        `;
        if (
          data.parentId !== null &&
          descendants.some((descendant) => descendant.id === data.parentId)
        ) {
          throw new CollectionServiceError("COLLECTION_HIERARCHY_CYCLE");
        }

        const result = await transaction.collectionNode.updateMany({
          where: { id: nodeId, collectionId: source.collectionId },
          data: { parentId: data.parentId },
        });
        if (result.count !== 1) {
          throw new CollectionServiceError("COLLECTION_NODE_NOT_FOUND");
        }
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  return { createCollection, createCollectionNode, moveCollectionNode, moveNode: moveCollectionNode };
}
