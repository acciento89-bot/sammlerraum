import { CollectibleItemSchema } from "@sammlerraum/contracts/items";

export type ItemTag = {
  id: string;
  ownerId: string;
  name: string;
  normalizedName: string;
};

type TagCreateData = Omit<ItemTag, "id">;

type TagTransaction = {
  tag: {
    upsert(args: {
      where: {
        ownerId_normalizedName: {
          ownerId: string;
          normalizedName: string;
        };
      };
      create: TagCreateData;
      update: Record<string, never>;
    }): Promise<ItemTag>;
  };
  itemTag: {
    deleteMany(args: { where: { itemId: string } }): Promise<{ count: number }>;
    createMany(args: {
      data: Array<{ itemId: string; tagId: string }>;
    }): Promise<{ count: number }>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export type TagDatabase = {
  $transaction<T>(
    operation: (transaction: TagTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};

export type TagServiceErrorCode = "ITEM_NOT_FOUND" | "TAGS_INVALID";

const errorMessages: Record<TagServiceErrorCode, string> = {
  ITEM_NOT_FOUND: "Item not found",
  TAGS_INVALID: "Tags are invalid",
};

export class TagServiceError extends Error {
  constructor(readonly code: TagServiceErrorCode) {
    super(errorMessages[code]);
    this.name = "TagServiceError";
  }
}

function normalizeTag(value: string): { name: string; normalizedName: string } {
  if (typeof value !== "string") {
    throw new TagServiceError("TAGS_INVALID");
  }
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (name.length === 0 || name.length > 100) {
    throw new TagServiceError("TAGS_INVALID");
  }
  return { name, normalizedName: name.toLowerCase() };
}

function parseTags(inputs: readonly string[]): Array<{
  name: string;
  normalizedName: string;
}> {
  if (!Array.isArray(inputs) || inputs.length > 100) {
    throw new TagServiceError("TAGS_INVALID");
  }

  const tags = new Map<string, { name: string; normalizedName: string }>();
  for (const input of inputs) {
    const tag = normalizeTag(input);
    if (!tags.has(tag.normalizedName)) {
      tags.set(tag.normalizedName, tag);
    }
  }
  return [...tags.values()];
}

async function lockOwnedItem(
  transaction: TagTransaction,
  itemId: string,
  actorUserId: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT item."id"
    FROM "CollectibleItem" item
    JOIN "Collection" collection ON collection."id" = item."collectionId"
    WHERE item."id" = ${itemId}::uuid AND collection."ownerId" = ${actorUserId}
    FOR UPDATE OF item
  `;
  if (rows.length !== 1) {
    throw new TagServiceError("ITEM_NOT_FOUND");
  }
}

export function createTagService(database: TagDatabase, actorUserId: string) {
  async function setItemTags(
    itemIdInput: string,
    tagsInput: readonly string[],
  ): Promise<ItemTag[]> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
    const tags = parseTags(tagsInput);

    return database.$transaction(
      async (transaction) => {
        await lockOwnedItem(transaction, itemId, actorUserId);
        await transaction.itemTag.deleteMany({ where: { itemId } });

        const saved: ItemTag[] = [];
        for (const tag of tags) {
          saved.push(
            await transaction.tag.upsert({
              where: {
                ownerId_normalizedName: {
                  ownerId: actorUserId,
                  normalizedName: tag.normalizedName,
                },
              },
              create: {
                ownerId: actorUserId,
                name: tag.name,
                normalizedName: tag.normalizedName,
              },
              update: {},
            }),
          );
        }
        if (saved.length > 0) {
          await transaction.itemTag.createMany({
            data: saved.map((tag) => ({ itemId, tagId: tag.id })),
          });
        }
        return saved;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  return { setItemTags };
}
