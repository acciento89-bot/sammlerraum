import { CollectibleItemSchema } from "@sammlerraum/contracts/items";

export type ItemIdentifierInput = {
  type: string;
  value: string;
};

export type ItemIdentifier = {
  id: string;
  itemId: string;
  type: string;
  value: string;
  normalizedValue: string;
};

type StoredIdentifier = ItemIdentifier;

const identifierSelect = {
  id: true,
  itemId: true,
  type: true,
  value: true,
  normalizedValue: true,
} as const;

type IdentifierCreateData = Omit<StoredIdentifier, "id">;

type IdentifierTransaction = {
  itemIdentifier: {
    deleteMany(args: { where: { itemId: string } }): Promise<{ count: number }>;
    createMany(args: { data: IdentifierCreateData[] }): Promise<{ count: number }>;
    findMany(args: {
      where: { itemId: string };
      select: typeof identifierSelect;
    }): Promise<StoredIdentifier[]>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

export type IdentifierDatabase = {
  $transaction<T>(
    operation: (transaction: IdentifierTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};

export type IdentifierServiceErrorCode = "ITEM_NOT_FOUND" | "IDENTIFIERS_INVALID";

const errorMessages: Record<IdentifierServiceErrorCode, string> = {
  ITEM_NOT_FOUND: "Item not found",
  IDENTIFIERS_INVALID: "Identifiers are invalid",
};

export class IdentifierServiceError extends Error {
  constructor(readonly code: IdentifierServiceErrorCode) {
    super(errorMessages[code]);
    this.name = "IdentifierServiceError";
  }
}

function normalizeWhitespace(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeIdentifier(input: ItemIdentifierInput): Omit<IdentifierCreateData, "itemId"> {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.type !== "string" ||
    typeof input.value !== "string"
  ) {
    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
  }
  if (input.type.includes("\u0000") || input.value.includes("\u0000")) {
    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
  }

  const type = normalizeWhitespace(input.type).toUpperCase();
  const value = normalizeWhitespace(input.value);
  if (type.length === 0 || type.length > 64 || value.length === 0 || value.length > 512) {
    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
  }

  const normalizedValue = /^(EAN|UPC|ISBN)$/u.test(type)
    ? value.replace(/[\s-]+/gu, "").toUpperCase()
    : value.toUpperCase();
  if (normalizedValue.length === 0) {
    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
  }
  return { type, value, normalizedValue };
}

function parseIdentifiers(
  inputs: readonly ItemIdentifierInput[],
): Array<Omit<IdentifierCreateData, "itemId">> {
  if (!Array.isArray(inputs) || inputs.length > 100) {
    throw new IdentifierServiceError("IDENTIFIERS_INVALID");
  }

  const identifiers: Array<Omit<IdentifierCreateData, "itemId">> = [];
  const identifierPositionsByType = new Map<string, Map<string, number>>();
  for (const input of inputs) {
    const identifier = normalizeIdentifier(input);
    let positionsByValue = identifierPositionsByType.get(identifier.type);
    if (!positionsByValue) {
      positionsByValue = new Map();
      identifierPositionsByType.set(identifier.type, positionsByValue);
    }
    const existingPosition = positionsByValue.get(identifier.normalizedValue);
    if (existingPosition === undefined) {
      positionsByValue.set(identifier.normalizedValue, identifiers.length);
      identifiers.push(identifier);
    } else {
      identifiers[existingPosition] = identifier;
    }
  }
  return identifiers;
}

async function lockOwnedItem(
  transaction: IdentifierTransaction,
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
    throw new IdentifierServiceError("ITEM_NOT_FOUND");
  }
}

export function createIdentifierService(database: IdentifierDatabase, actorUserId: string) {
  async function setItemIdentifiers(
    itemIdInput: string,
    identifiersInput: readonly ItemIdentifierInput[],
  ): Promise<ItemIdentifier[]> {
    const itemId = CollectibleItemSchema.shape.id.parse(itemIdInput);
    const identifiers = parseIdentifiers(identifiersInput);

    return database.$transaction(
      async (transaction) => {
        await lockOwnedItem(transaction, itemId, actorUserId);
        await transaction.itemIdentifier.deleteMany({ where: { itemId } });
        if (identifiers.length > 0) {
          await transaction.itemIdentifier.createMany({
            data: identifiers.map((identifier) => ({ itemId, ...identifier })),
          });
        }

        const saved = await transaction.itemIdentifier.findMany({
          where: { itemId },
          select: identifierSelect,
        });
        const savedByType = new Map<string, Map<string, StoredIdentifier>>();
        for (const identifier of saved) {
          let savedByValue = savedByType.get(identifier.type);
          if (!savedByValue) {
            savedByValue = new Map();
            savedByType.set(identifier.type, savedByValue);
          }
          savedByValue.set(identifier.normalizedValue, identifier);
        }
        return identifiers.map((identifier) => {
          const savedIdentifier = savedByType.get(identifier.type)?.get(identifier.normalizedValue);
          if (!savedIdentifier) {
            throw new Error("Identifier replacement did not persist every row");
          }
          return savedIdentifier;
        });
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  return { setItemIdentifiers };
}
